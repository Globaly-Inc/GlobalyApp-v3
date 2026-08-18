// Programs / applications / roster queries. Knex only.
//
// Tenant isolation is this layer's job, exactly as in the enquiries module:
// every business-scoped read takes a business_id and filters on it, and routes
// derive that id from req.business — never from the path or body. A program that
// belongs to another business is therefore *absent*, which is what lets the
// service answer 404 instead of 403 (a 403 confirms the row exists).

import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";
import type { PaginationInput } from "../../../shared/pagination.js";
import { paginationToOffset } from "../../../shared/pagination.js";
import type { AmbassadorStatus, ApplicationStatus, ProgramStatus } from "../consts.js";

export type Db = Knex | Knex.Transaction;

export function db(trx?: Db): Db {
  return trx ?? masterKnex;
}

export interface ProgramRow {
  id: number;
  business_id: number;
  name: string;
  slug: string;
  description: string | null;
  welcome_video_url: string | null;
  status: ProgramStatus;
  application_stages: unknown;
  compensation_model: unknown;
  requirements: unknown;
  created_by: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface ApplicationRow {
  id: number;
  program_id: number;
  student_id: number;
  current_stage: string | null;
  status: ApplicationStatus;
  application_data: Record<string, unknown>;
  video_url: string | null;
  documents: unknown;
  submitted_at: Date | null;
  reviewed_at: Date | null;
  decided_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface AmbassadorRow {
  id: number;
  user_id: number;
  program_id: number;
  status: AmbassadorStatus;
  deactivation_reason: string | null;
  bio: string | null;
  photo_url: string | null;
  major: string | null;
  year: number | null;
  country_of_origin: string | null;
  languages: string[];
  interests: string[];
  avg_rating: string;
  total_inquiries: number;
  total_resolved: number;
  typical_response_time_minutes: number | null;
  is_online: boolean;
  last_active_at: Date | null;
  joined_at: Date;
  total_earnings_minor: number;
  pending_earnings_minor: number;
  available_earnings_minor: number;
  currency: string;
  stripe_account_id: string | null;
  stripe_onboarding_complete: boolean;
  created_at: Date;
  updated_at: Date;
}

const PROGRAM_COLUMNS = [
  "id",
  "business_id",
  "name",
  "slug",
  "description",
  "welcome_video_url",
  "status",
  "application_stages",
  "compensation_model",
  "requirements",
  "created_by",
  "created_at",
  "updated_at",
] as const;

// ── Programs ────────────────────────────────────────────────────────────────

export async function listPrograms(
  businessId: number,
  query: PaginationInput & { status?: ProgramStatus },
  trx?: Db,
): Promise<{ rows: ProgramRow[]; total: number }> {
  const { limit, offset } = paginationToOffset(query);
  const base = () => {
    const q = db(trx)<ProgramRow>("ambassador_programs")
      .where({ business_id: businessId })
      .whereNull("deleted_at");
    if (query.status) q.andWhere({ status: query.status });
    return q;
  };
  const [rows, countRow] = await Promise.all([
    base().select(...PROGRAM_COLUMNS).orderBy("created_at", "desc").limit(limit).offset(offset),
    base().count<{ count: string }[]>({ count: "*" }).first(),
  ]);
  return { rows, total: Number(countRow?.count ?? 0) };
}

/** A program, scoped to one business. Null when missing OR owned by someone else. */
export async function findProgramInBusiness(
  programId: number,
  businessId: number,
  trx?: Db,
): Promise<ProgramRow | null> {
  const row = await db(trx)<ProgramRow>("ambassador_programs")
    .where({ id: programId, business_id: businessId })
    .whereNull("deleted_at")
    .select(...PROGRAM_COLUMNS)
    .first();
  return row ?? null;
}

/** Unscoped lookup — only for the public read, which filters on status itself. */
export async function findActiveProgramByRef(idOrSlug: string, trx?: Db): Promise<ProgramRow | null> {
  const numeric = /^\d+$/.test(idOrSlug) ? Number(idOrSlug) : null;
  const row = await db(trx)<ProgramRow>("ambassador_programs")
    .where({ status: "active" })
    .whereNull("deleted_at")
    .andWhere((q) => {
      q.where({ slug: idOrSlug });
      if (numeric !== null) q.orWhere({ id: numeric });
    })
    .select(...PROGRAM_COLUMNS)
    .first();
  return row ?? null;
}

export async function insertProgram(
  values: Partial<ProgramRow> & { business_id: number; name: string; slug: string },
  trx?: Db,
): Promise<ProgramRow> {
  const [row] = await db(trx)<ProgramRow>("ambassador_programs")
    .insert(values as never)
    .returning([...PROGRAM_COLUMNS]);
  return row as ProgramRow;
}

export async function updateProgram(
  programId: number,
  businessId: number,
  values: Partial<ProgramRow>,
  trx?: Db,
): Promise<ProgramRow | null> {
  const [row] = await db(trx)<ProgramRow>("ambassador_programs")
    .where({ id: programId, business_id: businessId })
    .whereNull("deleted_at")
    .update({ ...values, updated_at: db(trx).fn.now() } as never)
    .returning([...PROGRAM_COLUMNS]);
  return (row as ProgramRow) ?? null;
}

export async function softDeleteProgram(
  programId: number,
  businessId: number,
  trx?: Db,
): Promise<number> {
  return db(trx)("ambassador_programs")
    .where({ id: programId, business_id: businessId })
    .whereNull("deleted_at")
    .update({ deleted_at: db(trx).fn.now(), status: "archived" });
}

export async function programIdsForBusiness(
  businessId: number,
  programId?: number,
  trx?: Db,
): Promise<number[]> {
  const q = db(trx)("ambassador_programs")
    .where({ business_id: businessId })
    .whereNull("deleted_at");
  if (programId) q.andWhere({ id: programId });
  const rows = await q.select("id");
  return rows.map((r: { id: number }) => r.id);
}

// ── Applications ────────────────────────────────────────────────────────────

export async function listApplicationsForProgram(programId: number, trx?: Db): Promise<ApplicationRow[]> {
  return db(trx)<ApplicationRow>("ambassador_applications")
    .where({ program_id: programId })
    .orderBy("created_at", "desc");
}

export async function listApplicationsForStudent(studentId: number, trx?: Db) {
  return db(trx)("ambassador_applications as a")
    .leftJoin("ambassador_programs as p", "p.id", "a.program_id")
    .leftJoin("businesses as b", "b.id", "p.business_id")
    .where("a.student_id", studentId)
    .orderBy("a.created_at", "desc")
    .select(
      "a.id",
      "a.program_id",
      "a.student_id",
      "a.current_stage",
      "a.status",
      "a.application_data",
      "a.submitted_at",
      "a.created_at",
      "a.updated_at",
      "p.name as program_name",
      "p.slug as program_slug",
      "p.business_id",
      "b.business_name as institution_name",
    );
}

export async function findApplication(applicationId: number, trx?: Db): Promise<ApplicationRow | null> {
  const row = await db(trx)<ApplicationRow>("ambassador_applications")
    .where({ id: applicationId })
    .first();
  return row ?? null;
}

export async function findApplicationByStudent(
  programId: number,
  studentId: number,
  trx?: Db,
): Promise<ApplicationRow | null> {
  const row = await db(trx)<ApplicationRow>("ambassador_applications")
    .where({ program_id: programId, student_id: studentId })
    .first();
  return row ?? null;
}

export async function insertApplication(
  values: { program_id: number; student_id: number; application_data: unknown; video_url?: string | null },
  trx?: Db,
): Promise<ApplicationRow> {
  const [row] = await db(trx)<ApplicationRow>("ambassador_applications")
    .insert({ ...values, submitted_at: db(trx).fn.now() } as never)
    .returning("*");
  return row as ApplicationRow;
}

export async function updateApplication(
  applicationId: number,
  values: Record<string, unknown>,
  trx?: Db,
): Promise<ApplicationRow | null> {
  const [row] = await db(trx)<ApplicationRow>("ambassador_applications")
    .where({ id: applicationId })
    .update({ ...values, updated_at: db(trx).fn.now() } as never)
    .returning("*");
  return (row as ApplicationRow) ?? null;
}

// ── Application notes ───────────────────────────────────────────────────────

export async function getNote(applicationId: number, trx?: Db) {
  const row = await db(trx)("ambassador_application_notes")
    .where({ application_id: applicationId })
    .first();
  return row ?? null;
}

export async function upsertNote(applicationId: number, notes: string | null, trx?: Db) {
  const [row] = await db(trx)("ambassador_application_notes")
    .insert({ application_id: applicationId, notes, updated_at: db(trx).fn.now() })
    .onConflict("application_id")
    .merge(["notes", "updated_at"])
    .returning("*");
  return row;
}

// ── Roster ──────────────────────────────────────────────────────────────────

export async function findAmbassadorById(id: number, trx?: Db): Promise<AmbassadorRow | null> {
  const row = await db(trx)<AmbassadorRow>("ambassadors").where({ id }).whereNull("deleted_at").first();
  return row ?? null;
}

export async function findAmbassadorByUser(
  userId: number,
  trx?: Db,
): Promise<AmbassadorRow | null> {
  const row = await db(trx)<AmbassadorRow>("ambassadors")
    .where({ user_id: userId, status: "active" })
    .whereNull("deleted_at")
    .orderBy("joined_at", "desc")
    .first();
  return row ?? null;
}

export async function findAmbassadorByUserAndProgram(
  userId: number,
  programId: number,
  trx?: Db,
): Promise<AmbassadorRow | null> {
  const row = await db(trx)<AmbassadorRow>("ambassadors")
    .where({ user_id: userId, program_id: programId })
    .first();
  return row ?? null;
}

export async function insertAmbassador(
  values: Partial<AmbassadorRow> & { user_id: number; program_id: number },
  trx?: Db,
): Promise<AmbassadorRow> {
  const [row] = await db(trx)<AmbassadorRow>("ambassadors")
    .insert(values as never)
    .returning("*");
  return row as AmbassadorRow;
}

export async function updateAmbassador(
  id: number,
  values: Record<string, unknown>,
  trx?: Db,
): Promise<AmbassadorRow | null> {
  const [row] = await db(trx)<AmbassadorRow>("ambassadors")
    .where({ id })
    .update({ ...values, updated_at: db(trx).fn.now() } as never)
    .returning("*");
  return (row as AmbassadorRow) ?? null;
}

export async function listRoster(programIds: number[], trx?: Db): Promise<AmbassadorRow[]> {
  if (programIds.length === 0) return [];
  return db(trx)<AmbassadorRow>("ambassadors")
    .whereIn("program_id", programIds)
    .whereNull("deleted_at")
    .orderBy("joined_at", "desc");
}

/** The public profile join. Returns only what an anonymous caller may see. */
export async function findPublicAmbassador(id: number, trx?: Db) {
  const row = await db(trx)("ambassadors as a")
    .leftJoin("ambassador_programs as p", "p.id", "a.program_id")
    .leftJoin("businesses as b", "b.id", "p.business_id")
    .where("a.id", id)
    .andWhere("a.status", "active")
    .whereNull("a.deleted_at")
    .first(
      "a.id",
      "a.program_id",
      "a.bio",
      "a.photo_url",
      "a.major",
      "a.year",
      "a.country_of_origin",
      "a.languages",
      "a.interests",
      "a.avg_rating",
      "a.total_inquiries",
      "a.total_resolved",
      "a.typical_response_time_minutes",
      "a.is_online",
      "a.last_active_at",
      "a.joined_at",
      "a.user_id",
      "p.name as program_name",
      "p.slug as program_slug",
      "p.business_id",
      "b.business_name as institution_name",
      "b.logo_url as institution_logo_url",
    );
  return row ?? null;
}

export async function listPublicReviews(ambassadorId: number, limit: number, trx?: Db) {
  return db(trx)("ambassador_reviews")
    .where({ ambassador_id: ambassadorId, is_public: true })
    .orderBy("created_at", "desc")
    .limit(limit)
    .select(
      "id",
      "overall_rating",
      "responsiveness_rating",
      "helpfulness_rating",
      "knowledge_rating",
      "friendliness_rating",
      "review_text",
      "created_at",
    );
}
