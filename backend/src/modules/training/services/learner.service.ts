// The signed-in learner's own training. Behavioural spec: V2 routes/training.ts.
//
// The learner is always req.auth.sub. Nothing here takes a user id, so there is
// no "read someone else's progress" shape to defend against.
//
// The assessment SUBMIT is the security-critical path: the score is computed
// from the SERVER's copy of `correct_index` (never from the request body), the
// certificate is issued in the same transaction as the attempt, and the whole
// thing is guarded by the program's retake/attempt policy.

import { masterKnex } from "../../../core/db/master-pool.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../../shared/errors.js";
import { DEFAULT_MAX_ATTEMPTS, EXPIRY_DAYS_PER_MONTH, XP_BY_LEVEL } from "../consts.js";
import {
  certLevelFor,
  gradeAnswers,
  nextGamificationState,
  newVerificationCode,
  stripAnswers,
  type GamificationState,
  type Question,
} from "../lib/grading.js";
import * as repo from "../repositories/training.repository.js";

export async function listAssignments(userId: number) {
  const assignments = await repo.listAssignmentsForUser(userId);
  const programIds = [...new Set(assignments.map((a: { program_id: number }) => a.program_id))];

  const [totals, completed] = await Promise.all([
    repo.chapterCountsByProgram(programIds),
    repo.completedCountsForUser(userId, programIds),
  ]);
  const totalBy = new Map(totals.map((t) => [t.program_id, t.count]));
  const doneBy = new Map(completed.map((c) => [c.program_id, c.count]));

  return {
    data: assignments.map(
      (a: {
        id: number;
        program_id: number;
        due_date: Date | null;
        is_closed: boolean;
        created_at: Date;
        title: string;
        description: string | null;
        is_mandatory: boolean;
        is_published: boolean;
      }) => ({
        id: a.id,
        program_id: a.program_id,
        due_date: a.due_date,
        is_closed: a.is_closed,
        created_at: a.created_at,
        program: {
          id: a.program_id,
          title: a.title,
          description: a.description,
          is_mandatory: a.is_mandatory,
          is_published: a.is_published,
        },
        total_chapters: totalBy.get(a.program_id) ?? 0,
        completed_chapters: doneBy.get(a.program_id) ?? 0,
      }),
    ),
  };
}

/**
 * A learner may open a program they were assigned, whether or not it is still
 * published — closing enrolment must not erase the course someone is halfway
 * through. Everyone else needs it published.
 */
async function programForLearner(userId: number, programId: number) {
  const program = await repo.findProgram(programId);
  if (!program) throw new NotFoundError("Program not found");
  if (!program.is_published) {
    const assigned = await masterKnex("training_assignments")
      .where({ program_id: programId, user_id: userId })
      .first();
    if (!assigned) throw new NotFoundError("Program not found");
  }
  return program;
}

export async function getProgram(userId: number, programId: number) {
  const program = await programForLearner(userId, programId);
  const chapters = await repo.listChapters(programId);
  return {
    program: {
      id: program.id,
      title: program.title,
      description: program.description,
      category: program.category,
      thumbnail_url: program.thumbnail_url,
      passing_score: program.passing_score,
      retake_allowed: program.retake_allowed,
      max_attempts: program.max_attempts,
      certificate_expiry_months: program.certificate_expiry_months,
    },
    chapters,
  };
}

export async function getProgress(userId: number, programId: number) {
  await programForLearner(userId, programId);
  const [progress, attempts] = await Promise.all([
    repo.listProgress(userId, programId),
    repo.listAttempts(userId, programId),
  ]);
  return { progress, attempts };
}

export async function markProgress(userId: number, programId: number, chapterId: number) {
  await programForLearner(userId, programId);
  const chapter = await masterKnex("training_chapters")
    .where({ id: chapterId, program_id: programId })
    .first();
  if (!chapter) throw new NotFoundError("Chapter not found");
  return repo.markChapterComplete(userId, programId, chapterId);
}

/** The quiz as a learner may see it: `correct_index` is stripped, not hidden. */
export async function getAssessment(userId: number, programId: number) {
  await programForLearner(userId, programId);
  const assessment = await repo.findAssessmentByProgram(programId);
  if (!assessment) return { assessment: null };
  return {
    assessment: {
      id: assessment.id,
      program_id: assessment.program_id,
      title: assessment.title,
      passing_score: assessment.passing_score,
      questions: stripAnswers((assessment.questions ?? []) as Question[]),
    },
  };
}

export interface SubmitResult {
  score: number;
  passed: boolean;
  level: string | null;
  attempt_number: number;
  certificate: {
    id: number;
    level: string;
    verification_code: string;
    issued_at: Date;
    expires_at: Date | null;
  } | null;
}

export async function submitAssessment(
  userId: number,
  assessmentId: number,
  body: { program_id: number; answers: Record<string, number> },
  now: Date = new Date(),
): Promise<SubmitResult> {
  await programForLearner(userId, body.program_id);

  return masterKnex.transaction(async (trx) => {
    const assessment = await repo.findAssessment(assessmentId, trx);
    if (!assessment || assessment.program_id !== body.program_id) {
      throw new NotFoundError("Assessment not found");
    }
    const program = await repo.findProgram(body.program_id, trx);
    if (!program) throw new NotFoundError("Program not found");

    const attempts = await repo.listAttempts(userId, body.program_id, trx);
    const alreadyPassed = attempts.some((a: { passed: boolean }) => a.passed);
    const active = await repo.findActiveCertificate(userId, body.program_id, trx);

    if (active) throw new ConflictError("You already have an active certificate for this program");
    if (alreadyPassed && !program.retake_allowed) throw new BadRequestError("Retakes not allowed");
    if (attempts.length >= (program.max_attempts ?? DEFAULT_MAX_ATTEMPTS) && !alreadyPassed) {
      throw new BadRequestError("Maximum attempts reached");
    }

    const { score } = gradeAnswers((assessment.questions ?? []) as Question[], body.answers);
    // passing_score is NOT NULL with a default — no fallback needed.
    const passed = score >= program.passing_score;

    await repo.insertAttempt(
      {
        user_id: userId,
        assessment_id: assessmentId,
        program_id: body.program_id,
        answers: body.answers,
        score,
        passed,
      },
      trx,
    );

    if (!passed) {
      return { score, passed, level: null, attempt_number: attempts.length + 1, certificate: null };
    }

    const level = certLevelFor(score, program.certificate_level_thresholds);
    const expiresAt = program.certificate_expiry_months
      ? new Date(
          now.getTime() +
            program.certificate_expiry_months * EXPIRY_DAYS_PER_MONTH * 24 * 60 * 60 * 1000,
        ).toISOString()
      : null;

    const certificate = await repo.insertCertificate(
      {
        user_id: userId,
        program_id: body.program_id,
        level,
        score,
        verification_code: newVerificationCode(),
        expires_at: expiresAt,
      },
      trx,
    );

    await awardXp(userId, XP_BY_LEVEL[level], now, trx);

    return {
      score,
      passed,
      level,
      attempt_number: attempts.length + 1,
      certificate: {
        id: certificate.id,
        level: certificate.level,
        verification_code: certificate.verification_code,
        issued_at: certificate.issued_at,
        expires_at: certificate.expires_at,
      },
    };
  });
}

async function awardXp(userId: number, xp: number, now: Date, trx: repo.Db) {
  const existing = await repo.findGamification(userId, trx);
  const current: GamificationState | null = existing
    ? {
        total_xp: existing.total_xp,
        current_streak: existing.current_streak,
        longest_streak: existing.longest_streak,
        last_activity_date: existing.last_activity_date
          ? new Date(existing.last_activity_date).toISOString()
          : null,
        badges: existing.badges ?? [],
      }
    : null;
  const next = nextGamificationState(current, xp, now);
  await repo.upsertGamification(userId, next, trx);
}

export async function listCertificates(userId: number) {
  return { data: await repo.listCertificatesForUser(userId) };
}

export async function getGamification(userId: number) {
  const row = await repo.findGamification(userId);
  return (
    row ?? {
      user_id: userId,
      total_xp: 0,
      current_streak: 0,
      longest_streak: 0,
      last_activity_date: null,
      badges: [],
    }
  );
}
