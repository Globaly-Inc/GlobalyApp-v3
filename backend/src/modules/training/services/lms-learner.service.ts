// The learner's side of LMS delivery: hand in an assignment, sit a chapter quiz,
// enrol, apply to enrol, read your own submissions. Wave E4.
//
// Spec: V2 routes/lms-student.ts and routes/lms-quiz.ts, with their trust
// failures corrected rather than ported.
//
// THE GATE. V2's `POST /me/lms/assignment-submissions` and
// `POST /me/lms/quiz-submissions` both took `(program_id, chapter_id)` from the
// body and checked NEITHER that the chapter belonged to the programme NOR that
// the caller was enrolled NOR that the programme was published. Any signed-in
// user could enumerate ids and post unlimited rows into another business's
// grading queue (defect D-E4-5). `requireEnrolledChapter` below is the one door,
// and everything goes through it.

import { masterKnex } from "../../../core/db/master-pool.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../../shared/errors.js";
import { DEFAULT_QUIZ_PASSING_SCORE } from "../consts.js";
import { gradeAnswers, stripAnswers, type Question } from "../lib/grading.js";
import * as lms from "../repositories/lms.repository.js";
import * as repo from "../repositories/training.repository.js";
import type { ChapterAttachments } from "../schemas/lms.schema.js";

interface Gate {
  program: repo.ProgramRow;
  chapter: lms.ChapterAttachmentRow;
  attachments: ChapterAttachments;
}

/**
 * Resolve (programme, chapter) for a learner, proving in one place that:
 *  - the programme exists and is published,
 *  - the learner is enrolled in it,
 *  - the enrolment is not closed,
 *  - the chapter really belongs to that programme.
 */
async function requireEnrolledChapter(
  userId: number,
  programId: number,
  chapterId: number,
  trx?: lms.Db,
): Promise<Gate> {
  const program = await repo.findPublishedProgram(programId, trx);
  if (!program) throw new NotFoundError("Program not found");

  const assignment = await lms.findAssignment(programId, userId, trx);
  if (!assignment) throw new NotFoundError("You are not enrolled in this program");
  if (assignment.is_closed) throw new ConflictError("This enrolment is closed");

  const chapter = await lms.findChapterInProgram(chapterId, programId, trx);
  if (!chapter) throw new NotFoundError("Chapter not found in this program");

  return {
    program,
    chapter,
    attachments: (chapter.attachments ?? {}) as ChapterAttachments,
  };
}

// ── Assignments ─────────────────────────────────────────────────────────────

/**
 * Hand in a lesson task.
 *
 * SUBMITTING DOES NOT COMPLETE THE LESSON. V1 fired `markComplete.mutate()` in
 * the same click handler as the submit, so `training_progress` went to
 * `completed` before anyone looked at the work — and a later `failed` never undid
 * it. Completion percentage, certificate eligibility and XP all keyed off "the
 * learner pressed submit" (defect D-E4-8). Only a `passed` grade completes a
 * lesson here; see gradeSubmission in lms-business.service.
 *
 * RESUBMISSION is bounded and linked. V2 always INSERTed with no unique key, so
 * `needs_revision` was a status nothing could act on and the queue grew one row
 * per retry. A new attempt is allowed only when the previous one was returned for
 * revision, and it carries a server-assigned `attempt_number`.
 */
export async function submitAssignment(
  userId: number,
  input: {
    program_id: number;
    chapter_id: number;
    submission_text?: string | null;
    file_url?: string | null;
    file_name?: string | null;
  },
) {
  return masterKnex.transaction(async (trx) => {
    const { attachments } = await requireEnrolledChapter(
      userId,
      input.program_id,
      input.chapter_id,
      trx,
    );
    // A lesson with no assignment brief is not a lesson you hand work in for.
    if (!attachments.assignment) {
      throw new BadRequestError("This chapter has no assignment to submit");
    }

    const latest = await lms.findLatestSubmission(userId, input.chapter_id, trx);
    if (latest && latest.status !== "needs_revision") {
      throw new ConflictError(
        latest.status === "submitted"
          ? "Your submission is awaiting review"
          : `This assignment is already marked ${latest.status}`,
      );
    }

    return {
      submission: await lms.insertSubmission(
        {
          user_id: userId,
          chapter_id: input.chapter_id,
          program_id: input.program_id,
          submission_text: input.submission_text ?? null,
          file_url: input.file_url ?? null,
          file_name: input.file_name ?? null,
          attempt_number: (latest?.attempt_number ?? 0) + 1,
        },
        trx,
      ),
    };
  });
}

export async function listOwnSubmissions(userId: number, programId: number) {
  const program = await repo.findPublishedProgram(programId);
  if (!program) throw new NotFoundError("Program not found");
  return { data: await lms.listSubmissionsForLearner(userId, programId) };
}

// ── Chapter quiz ────────────────────────────────────────────────────────────

/**
 * The learner-facing quiz. `correct_index` is stripped by rebuilding each
 * question (lib/grading.stripAnswers), so a field added to the stored shape is
 * excluded by default rather than leaked.
 */
export async function getChapterQuiz(userId: number, programId: number, chapterId: number) {
  const { attachments, chapter } = await requireEnrolledChapter(userId, programId, chapterId);
  if (!attachments.quiz) throw new NotFoundError("This chapter has no quiz");
  return {
    chapter_id: chapter.id,
    passing_score: attachments.quiz.passing_score ?? DEFAULT_QUIZ_PASSING_SCORE,
    questions: stripAnswers(attachments.quiz.questions as Question[]),
  };
}

/**
 * GRADED SERVER-SIDE. V2 accepted `score` and `passed` in the request body and
 * wrote them verbatim, documenting it as a faithful port of V1's client-side
 * scoring — which is a learner marking their own work (defect D-E4-4). The body
 * carries only the chosen option indices, exactly as G4's final-assessment
 * grader receives them.
 */
export async function submitQuiz(
  userId: number,
  input: { program_id: number; chapter_id: number; answers: Record<string, number> },
) {
  return masterKnex.transaction(async (trx) => {
    const { attachments } = await requireEnrolledChapter(
      userId,
      input.program_id,
      input.chapter_id,
      trx,
    );
    if (!attachments.quiz) throw new NotFoundError("This chapter has no quiz");

    const questions = attachments.quiz.questions as Question[];
    const passingScore = attachments.quiz.passing_score ?? DEFAULT_QUIZ_PASSING_SCORE;
    const { score, correct, total } = gradeAnswers(questions, input.answers);
    const passed = score >= passingScore;

    const attemptNumber = (await lms.countQuizAttempts(userId, input.chapter_id, trx)) + 1;
    const submission = await lms.insertQuizSubmission(
      {
        user_id: userId,
        program_id: input.program_id,
        chapter_id: input.chapter_id,
        answers: input.answers,
        score,
        passed,
        attempt_number: attemptNumber,
      },
      trx,
    );

    // Passing the chapter quiz completes the chapter — the same rule the final
    // assessment uses for the programme.
    if (passed) {
      await repo.markChapterComplete(userId, input.program_id, input.chapter_id, trx);
    }

    return { submission, score, correct, total, passed, passing_score: passingScore };
  });
}

export async function listOwnQuizSubmissions(userId: number, programId: number) {
  const program = await repo.findPublishedProgram(programId);
  if (!program) throw new NotFoundError("Program not found");
  return { data: await lms.listQuizSubmissions(userId, programId) };
}

// ── Enrolment ───────────────────────────────────────────────────────────────

/** V2 `POST /me/lms/enroll`. Published programmes only, and idempotent. */
export async function enrol(userId: number, programId: number) {
  const program = await repo.findPublishedProgram(programId);
  if (!program) throw new NotFoundError("Program not found");

  const existing = await lms.findAssignment(programId, userId);
  if (existing) return { enrolled: true, already: true };

  await repo.assignUsers(programId, [userId], userId, program.due_date?.toISOString() ?? null);
  return { enrolled: true, already: false };
}

/**
 * V2's enrolment-application flow, from the learner's side (V2 only had the
 * business's half of it — there was no route to file one).
 */
export async function applyForEnrolment(
  userId: number,
  input: { program_id: number; answers_json?: Record<string, unknown> },
) {
  const program = await repo.findPublishedProgram(input.program_id);
  if (!program) throw new NotFoundError("Program not found");

  const already = await lms.findAssignment(input.program_id, userId);
  if (already) throw new ConflictError("You are already enrolled in this program");

  const existing = await lms.findApplication(input.program_id, userId);
  if (existing) {
    if (existing.status === "pending") throw new ConflictError("Your application is pending review");
    if (existing.status === "approved") throw new ConflictError("Your application was approved");
    throw new ConflictError("Your application for this program was rejected");
  }

  return {
    application: await lms.insertApplication({
      program_id: input.program_id,
      user_id: userId,
      answers_json: input.answers_json ?? {},
    }),
  };
}
