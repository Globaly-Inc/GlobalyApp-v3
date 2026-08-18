// Business-owner ambassador program management: programs CRUD, application
// review (including promotion to the roster), notes, and the roster read.
//
// Behavioural spec: V2 routes/business-ambassador-programs.ts.
//
// Every function takes `businessId` as its first argument and every repository
// call is filtered by it. A program owned by another business is *absent*, so
// the answer is NotFound — never Forbidden, which would confirm it exists.

import { masterKnex } from "../../../core/db/master-pool.js";
import { ConflictError, NotFoundError } from "../../../shared/errors.js";
import { buildPaginatedResponse, type PaginationInput } from "../../../shared/pagination.js";
import type { ProgramStatus } from "../consts.js";
import * as repo from "../repositories/programs.repository.js";

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === "23505";
}

export async function listPrograms(
  businessId: number,
  query: PaginationInput & { status?: ProgramStatus },
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
  try {
    return await repo.insertProgram({
      ...(body as { name: string; slug: string }),
      business_id: businessId,
      created_by: createdBy,
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError("That program slug is already taken");
    throw err;
  }
}

export async function updateProgram(
  businessId: number,
  programId: number,
  body: Record<string, unknown>,
) {
  try {
    const row = await repo.updateProgram(programId, businessId, body);
    if (!row) throw new NotFoundError("Program not found");
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError("That program slug is already taken");
    throw err;
  }
}

export async function deleteProgram(businessId: number, programId: number) {
  const affected = await repo.softDeleteProgram(programId, businessId);
  if (affected === 0) throw new NotFoundError("Program not found");
  return { deleted: true };
}

// ── Applications ────────────────────────────────────────────────────────────

export async function listApplications(businessId: number, programId: number) {
  await getProgram(businessId, programId);
  return { data: await repo.listApplicationsForProgram(programId) };
}

/**
 * Review an application. On `accepted` the applicant is promoted to the roster
 * IN THE SAME TRANSACTION — V1 did this client-side after the status write, so a
 * closed tab left an accepted applicant who was never an ambassador.
 * Idempotent: `ambassadors_user_program_uniq` makes a second accept a no-op.
 */
export async function reviewApplication(
  businessId: number,
  programId: number,
  applicationId: number,
  body: { status?: string; current_stage?: string },
) {
  return masterKnex.transaction(async (trx) => {
    const program = await repo.findProgramInBusiness(programId, businessId, trx);
    if (!program) throw new NotFoundError("Program not found");

    const existing = await repo.findApplication(applicationId, trx);
    if (!existing || existing.program_id !== programId) {
      throw new NotFoundError("Application not found");
    }

    const updates: Record<string, unknown> = {};
    if (body.status !== undefined) {
      updates.status = body.status;
      updates.reviewed_at = trx.fn.now();
      if (body.status === "accepted" || body.status === "rejected") {
        updates.decided_at = trx.fn.now();
      }
    }
    if (body.current_stage !== undefined) updates.current_stage = body.current_stage;

    const application = await repo.updateApplication(applicationId, updates, trx);

    if (body.status === "accepted") {
      const already = await repo.findAmbassadorByUserAndProgram(existing.student_id, programId, trx);
      if (!already) {
        const data = (existing.application_data ?? {}) as {
          major?: string;
          year?: number;
          languages?: string[];
          motivation?: string;
          country_of_origin?: string;
        };
        await repo.insertAmbassador(
          {
            user_id: existing.student_id,
            program_id: programId,
            status: "active",
            major: data.major ?? null,
            year: typeof data.year === "number" ? data.year : null,
            languages: Array.isArray(data.languages) ? data.languages : ["English"],
            bio: data.motivation ?? null,
            country_of_origin: data.country_of_origin ?? null,
          },
          trx,
        );
      }
    }

    return application!;
  });
}

// ── Application notes ───────────────────────────────────────────────────────

async function assertApplicationInBusiness(applicationId: number, businessId: number) {
  const application = await repo.findApplication(applicationId);
  if (!application) throw new NotFoundError("Application not found");
  const program = await repo.findProgramInBusiness(application.program_id, businessId);
  if (!program) throw new NotFoundError("Application not found");
  return application;
}

export async function getNote(businessId: number, applicationId: number) {
  await assertApplicationInBusiness(applicationId, businessId);
  return { note: await repo.getNote(applicationId) };
}

export async function saveNote(businessId: number, applicationId: number, notes: string | null) {
  await assertApplicationInBusiness(applicationId, businessId);
  return { note: await repo.upsertNote(applicationId, notes) };
}

// ── Roster ──────────────────────────────────────────────────────────────────

/**
 * The business's ambassadors across all its programs. The business pays these
 * people, so it does see the balances — but never the Stripe account id, which
 * belongs to the ambassador's relationship with Stripe, not with the business.
 */
export async function listRoster(businessId: number) {
  const programIds = await repo.programIdsForBusiness(businessId);
  const rows = await repo.listRoster(programIds);
  return {
    data: rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      program_id: r.program_id,
      status: r.status,
      deactivation_reason: r.deactivation_reason,
      bio: r.bio,
      photo_url: r.photo_url,
      major: r.major,
      year: r.year,
      country_of_origin: r.country_of_origin,
      languages: r.languages,
      interests: r.interests,
      avg_rating: Number(r.avg_rating),
      total_inquiries: r.total_inquiries,
      total_resolved: r.total_resolved,
      total_earnings_minor: r.total_earnings_minor,
      pending_earnings_minor: r.pending_earnings_minor,
      available_earnings_minor: r.available_earnings_minor,
      currency: r.currency,
      is_online: r.is_online,
      joined_at: r.joined_at,
    })),
  };
}
