// Business-owner training management: programs CRUD, the editor's chapter list
// and final assessment, enrolment, roster and leaderboard.
//
// Behavioural spec: V2 routes/business-training.ts.
//
// Every function takes `businessId` first and every repository call filters on
// it. A program owned by another business is absent → NotFound, never Forbidden.

import { masterKnex } from "../../../core/db/master-pool.js";
import { NotFoundError } from "../../../shared/errors.js";
import { buildPaginatedResponse, type PaginationInput } from "../../../shared/pagination.js";
import type { TargetAudience } from "../consts.js";
import * as repo from "../repositories/training.repository.js";

const LEADERBOARD_LIMIT = 25;

export async function listPrograms(
  businessId: number,
  query: PaginationInput & { target_audience?: TargetAudience; is_published?: boolean },
) {
  const { rows, total } = await repo.listPrograms(businessId, query);
  return buildPaginatedResponse(rows, total, query);
}

export async function getProgram(businessId: number, programId: number) {
  const program = await repo.findProgramInBusiness(programId, businessId);
  if (!program) throw new NotFoundError("Program not found");
  return program;
}

export async function createProgram(
  businessId: number,
  createdBy: number,
  body: Record<string, unknown>,
) {
  const values: Record<string, unknown> = { ...body, business_id: businessId, created_by: createdBy };
  if (values.certificate_level_thresholds) {
    values.certificate_level_thresholds = JSON.stringify(values.certificate_level_thresholds);
  }
  return repo.insertProgram(values);
}

export async function updateProgram(
  businessId: number,
  programId: number,
  body: Record<string, unknown>,
) {
  const values: Record<string, unknown> = { ...body };
  if (values.certificate_level_thresholds) {
    values.certificate_level_thresholds = JSON.stringify(values.certificate_level_thresholds);
  }
  const row = await repo.updateProgram(programId, businessId, values);
  if (!row) throw new NotFoundError("Program not found");
  return row;
}

export async function deleteProgram(businessId: number, programId: number) {
  const affected = await repo.softDeleteProgram(programId, businessId);
  if (affected === 0) throw new NotFoundError("Program not found");
  return { deleted: true };
}

// ── Chapters ────────────────────────────────────────────────────────────────

export async function listChapters(businessId: number, programId: number) {
  await getProgram(businessId, programId);
  return { data: await repo.listChapters(programId) };
}

export async function putChapters(
  businessId: number,
  programId: number,
  chapters: { id?: number; title: string; content_text?: string | null; video_url?: string | null }[],
) {
  return masterKnex.transaction(async (trx) => {
    const program = await repo.findProgramInBusiness(programId, businessId, trx);
    if (!program) throw new NotFoundError("Program not found");
    return { data: await repo.replaceChapters(programId, chapters, trx) };
  });
}

// ── Assessment ──────────────────────────────────────────────────────────────

/** The author DOES see `correct_index` — they wrote it. Only learners get the
 *  stripped projection (learner.service.getAssessment). */
export async function getAssessment(businessId: number, programId: number) {
  await getProgram(businessId, programId);
  return { assessment: await repo.findAssessmentByProgram(programId) };
}

export async function putAssessment(
  businessId: number,
  programId: number,
  body: { title?: string; questions: unknown[]; passing_score: number },
) {
  await getProgram(businessId, programId);
  return {
    assessment: await repo.upsertAssessment(programId, {
      title: body.title ?? "Final assessment",
      questions: body.questions,
      passing_score: body.passing_score,
    }),
  };
}

// ── Enrolment ───────────────────────────────────────────────────────────────

export async function listAssignments(businessId: number, programId: number) {
  await getProgram(businessId, programId);
  return { data: await repo.listAssignmentsForProgram(programId) };
}

export async function assign(
  businessId: number,
  programId: number,
  assignedBy: number,
  body: { user_ids: number[]; due_date?: string | null },
) {
  await getProgram(businessId, programId);
  const created = await repo.assignUsers(
    programId,
    body.user_ids,
    assignedBy,
    body.due_date ?? null,
  );
  return { assigned: created.length, requested: body.user_ids.length };
}

export async function getRoster(businessId: number, programId: number) {
  await getProgram(businessId, programId);
  return repo.roster(programId);
}

// ── Leaderboard + stats ─────────────────────────────────────────────────────

export async function leaderboard(businessId: number) {
  const programIds = await repo.programIdsForBusiness(businessId);
  const rows = await repo.leaderboard(programIds, LEADERBOARD_LIMIT);
  return {
    data: rows.map(
      (r: {
        user_id: number;
        total_xp: number;
        current_streak: number;
        longest_streak: number;
        badges: unknown;
        first_name: string | null;
        last_name: string | null;
      }) => ({
        user_id: r.user_id,
        name: `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || `Learner ${r.user_id}`,
        total_xp: r.total_xp,
        current_streak: r.current_streak,
        longest_streak: r.longest_streak,
        badges: r.badges,
      }),
    ),
  };
}

export async function stats(businessId: number) {
  const programIds = await repo.programIdsForBusiness(businessId);
  if (programIds.length === 0) {
    return {
      programs: 0,
      enrolments: { total: 0, this_month: 0, closed: 0 },
      certificates_issued: 0,
    };
  }
  const [enrolments, certificates] = await Promise.all([
    masterKnex("training_assignments")
      .whereIn("program_id", programIds)
      .select(
        masterKnex.raw(
          `count(*) AS total, count(*) FILTER (WHERE created_at >= now() - interval '30 days') AS this_month, count(*) FILTER (WHERE is_closed) AS closed`,
        ),
      )
      .first(),
    masterKnex("training_certificates")
      .whereIn("program_id", programIds)
      .count<{ count: string }[]>({ count: "*" })
      .first(),
  ]);
  const n = (v: unknown) => Number(v ?? 0);
  return {
    programs: programIds.length,
    enrolments: {
      total: n(enrolments?.total),
      this_month: n(enrolments?.this_month),
      closed: n(enrolments?.closed),
    },
    certificates_issued: n(certificates?.count),
  };
}
