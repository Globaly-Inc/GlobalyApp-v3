// Training queries. Knex only, always against the master schema.
//
// Tenant isolation: every business-scoped read takes a business_id and filters
// on it; routes derive that id from req.business. A program owned by another
// business is absent, which is what lets the service answer 404 rather than 403.

import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";
import { paginationToOffset, type PaginationInput } from "../../../shared/pagination.js";
import type { CertificateLevel, ProgressStatus, TargetAudience } from "../consts.js";

export type Db = Knex | Knex.Transaction;

export function db(trx?: Db): Db {
  return trx ?? masterKnex;
}

export interface ProgramRow {
  id: number;
  business_id: number;
  created_by: number | null;
  title: string;
  description: string | null;
  category: string | null;
  target_audience: TargetAudience;
  thumbnail_url: string | null;
  is_mandatory: boolean;
  due_date: Date | null;
  auto_close: boolean;
  certificate_expiry_months: number | null;
  certificate_level_thresholds: { gold: number; silver: number; bronze: number };
  passing_score: number;
  retake_allowed: boolean;
  max_attempts: number | null;
  is_published: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ChapterRow {
  id: number;
  program_id: number;
  title: string;
  content_text: string | null;
  video_url: string | null;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface AssessmentRow {
  id: number;
  program_id: number;
  chapter_id: number | null;
  title: string;
  questions: unknown[];
  passing_score: number;
  created_at: Date;
  updated_at: Date;
}

export interface CertificateRow {
  id: number;
  user_id: number;
  program_id: number;
  level: CertificateLevel;
  score: number | null;
  verification_code: string;
  is_expired: boolean;
  issued_at: Date;
  expires_at: Date | null;
}

export interface GamificationRow {
  id: number;
  user_id: number;
  total_xp: number;
  current_streak: number;
  longest_streak: number;
  last_activity_date: Date | null;
  badges: { id: string; name: string; earned_at: string }[];
}

// ── Programs ────────────────────────────────────────────────────────────────

export async function listPrograms(
  businessId: number,
  query: PaginationInput & { target_audience?: TargetAudience; is_published?: boolean },
  trx?: Db,
) {
  const { limit, offset } = paginationToOffset(query);
  const base = () => {
    const q = db(trx)<ProgramRow>("training_programs")
      .where({ business_id: businessId })
      .whereNull("deleted_at");
    if (query.target_audience) q.andWhere({ target_audience: query.target_audience });
    if (query.is_published !== undefined) q.andWhere({ is_published: query.is_published });
    return q;
  };
  const [rows, countRow] = await Promise.all([
    base().orderBy("created_at", "desc").limit(limit).offset(offset),
    base().count<{ count: string }[]>({ count: "*" }).first(),
  ]);
  return { rows, total: Number(countRow?.count ?? 0) };
}

export async function findProgramInBusiness(
  programId: number,
  businessId: number,
  trx?: Db,
): Promise<ProgramRow | null> {
  const row = await db(trx)<ProgramRow>("training_programs")
    .where({ id: programId, business_id: businessId })
    .whereNull("deleted_at")
    .first();
  return row ?? null;
}

/** Unscoped: only for learner reads, which gate on `is_published` instead. */
export async function findPublishedProgram(programId: number, trx?: Db): Promise<ProgramRow | null> {
  const row = await db(trx)<ProgramRow>("training_programs")
    .where({ id: programId, is_published: true })
    .whereNull("deleted_at")
    .first();
  return row ?? null;
}

export async function findProgram(programId: number, trx?: Db): Promise<ProgramRow | null> {
  const row = await db(trx)<ProgramRow>("training_programs")
    .where({ id: programId })
    .whereNull("deleted_at")
    .first();
  return row ?? null;
}

export async function insertProgram(values: Record<string, unknown>, trx?: Db): Promise<ProgramRow> {
  const [row] = await db(trx)<ProgramRow>("training_programs").insert(values as never).returning("*");
  return row as ProgramRow;
}

export async function updateProgram(
  programId: number,
  businessId: number,
  values: Record<string, unknown>,
  trx?: Db,
): Promise<ProgramRow | null> {
  const [row] = await db(trx)<ProgramRow>("training_programs")
    .where({ id: programId, business_id: businessId })
    .whereNull("deleted_at")
    .update({ ...values, updated_at: db(trx).fn.now() } as never)
    .returning("*");
  return (row as ProgramRow) ?? null;
}

export async function softDeleteProgram(programId: number, businessId: number, trx?: Db) {
  return db(trx)("training_programs")
    .where({ id: programId, business_id: businessId })
    .whereNull("deleted_at")
    .update({ deleted_at: db(trx).fn.now(), is_published: false });
}

// ── Chapters ────────────────────────────────────────────────────────────────

export async function listChapters(programId: number, trx?: Db): Promise<ChapterRow[]> {
  return db(trx)<ChapterRow>("training_chapters")
    .where({ program_id: programId })
    .orderBy("sort_order", "asc");
}

/** Replace the ordered chapter list. Ids present in `chapters` are kept (so
 *  learner progress survives an edit); anything else is deleted. */
export async function replaceChapters(
  programId: number,
  chapters: { id?: number; title: string; content_text?: string | null; video_url?: string | null }[],
  trx: Db,
): Promise<ChapterRow[]> {
  const keep = chapters.map((c) => c.id).filter((id): id is number => typeof id === "number");
  const del = trx("training_chapters").where({ program_id: programId });
  if (keep.length > 0) del.whereNotIn("id", keep);
  await del.delete();

  for (const [index, chapter] of chapters.entries()) {
    const values = {
      program_id: programId,
      title: chapter.title,
      content_text: chapter.content_text ?? null,
      video_url: chapter.video_url ?? null,
      sort_order: index,
      updated_at: db(trx).fn.now(),
    };
    if (chapter.id) {
      await trx("training_chapters").where({ id: chapter.id, program_id: programId }).update(values);
    } else {
      await trx("training_chapters").insert(values);
    }
  }
  return listChapters(programId, trx);
}

// ── Assessment ──────────────────────────────────────────────────────────────

export async function findAssessmentByProgram(
  programId: number,
  trx?: Db,
): Promise<AssessmentRow | null> {
  const row = await db(trx)<AssessmentRow>("training_assessments")
    .where({ program_id: programId })
    .first();
  return row ?? null;
}

export async function findAssessment(id: number, trx?: Db): Promise<AssessmentRow | null> {
  const row = await db(trx)<AssessmentRow>("training_assessments").where({ id }).first();
  return row ?? null;
}

export async function upsertAssessment(
  programId: number,
  values: { title: string; questions: unknown[]; passing_score: number },
  trx?: Db,
): Promise<AssessmentRow> {
  const [row] = await db(trx)<AssessmentRow>("training_assessments")
    .insert({
      program_id: programId,
      title: values.title,
      questions: JSON.stringify(values.questions),
      passing_score: values.passing_score,
    } as never)
    .onConflict("program_id")
    .merge(["title", "questions", "passing_score", "updated_at"])
    .returning("*");
  return row as AssessmentRow;
}

// ── Assignments / progress / attempts ───────────────────────────────────────

export async function listAssignmentsForUser(userId: number, trx?: Db) {
  return db(trx)("training_assignments as a")
    .join("training_programs as p", "p.id", "a.program_id")
    .where("a.user_id", userId)
    .whereNull("p.deleted_at")
    .orderBy("a.created_at", "desc")
    .select(
      "a.id",
      "a.program_id",
      "a.due_date",
      "a.is_closed",
      "a.created_at",
      "p.title",
      "p.description",
      "p.is_mandatory",
      "p.is_published",
    );
}

export async function listAssignmentsForProgram(programId: number, trx?: Db) {
  return db(trx)("training_assignments")
    .where({ program_id: programId })
    .orderBy("created_at", "desc")
    .select("id", "program_id", "user_id", "assigned_by", "due_date", "is_closed", "created_at");
}

export async function assignUsers(
  programId: number,
  userIds: number[],
  assignedBy: number,
  dueDate: string | null,
  trx?: Db,
) {
  if (userIds.length === 0) return [];
  return db(trx)("training_assignments")
    .insert(
      userIds.map((user_id) => ({
        program_id: programId,
        user_id,
        assigned_by: assignedBy,
        due_date: dueDate,
      })),
    )
    // Assigning the same person twice is a no-op, not a duplicate enrolment.
    .onConflict(["program_id", "user_id"])
    .ignore()
    .returning("*");
}

export async function chapterCountsByProgram(programIds: number[], trx?: Db) {
  if (programIds.length === 0) return [];
  const rows = await db(trx)("training_chapters")
    .whereIn("program_id", programIds)
    .groupBy("program_id")
    .select("program_id")
    .count<{ program_id: number; count: string }[]>({ count: "*" });
  return rows.map((r) => ({ program_id: r.program_id, count: Number(r.count) }));
}

export async function completedCountsForUser(userId: number, programIds: number[], trx?: Db) {
  if (programIds.length === 0) return [];
  const rows = await db(trx)("training_progress")
    .where({ user_id: userId, status: "completed" })
    .whereIn("program_id", programIds)
    .groupBy("program_id")
    .select("program_id")
    .count<{ program_id: number; count: string }[]>({ count: "*" });
  return rows.map((r) => ({ program_id: r.program_id, count: Number(r.count) }));
}

export async function listProgress(userId: number, programId: number, trx?: Db) {
  return db(trx)("training_progress")
    .where({ user_id: userId, program_id: programId })
    .select("chapter_id", "status", "completed_at");
}

export async function markChapterComplete(
  userId: number,
  programId: number,
  chapterId: number,
  trx?: Db,
) {
  const [row] = await db(trx)("training_progress")
    .insert({
      user_id: userId,
      program_id: programId,
      chapter_id: chapterId,
      status: "completed" as ProgressStatus,
      completed_at: db(trx).fn.now(),
    })
    .onConflict(["user_id", "chapter_id"])
    .merge(["status", "completed_at", "updated_at"])
    .returning("*");
  return row;
}

export async function listAttempts(userId: number, programId: number, trx?: Db) {
  return db(trx)("training_assessment_attempts")
    .where({ user_id: userId, program_id: programId })
    .orderBy("attempted_at", "desc")
    .select("id", "score", "passed", "attempted_at");
}

export async function insertAttempt(
  values: {
    user_id: number;
    assessment_id: number;
    program_id: number;
    answers: Record<string, number>;
    score: number;
    passed: boolean;
  },
  trx?: Db,
) {
  const [row] = await db(trx)("training_assessment_attempts")
    .insert({ ...values, answers: JSON.stringify(values.answers) })
    .returning("*");
  return row;
}

// ── Certificates ────────────────────────────────────────────────────────────

export async function listCertificatesForUser(userId: number, trx?: Db): Promise<CertificateRow[]> {
  return db(trx)<CertificateRow>("training_certificates")
    .where({ user_id: userId })
    .orderBy("issued_at", "desc");
}

/** Non-expired certificates with their program title — used by the PUBLIC
 *  ambassador profile, so the projection is deliberately narrow. */
export async function listPublicCertificatesForUser(userId: number, limit: number, trx?: Db) {
  return db(trx)("training_certificates as c")
    .leftJoin("training_programs as p", "p.id", "c.program_id")
    .where("c.user_id", userId)
    .andWhere("c.is_expired", false)
    .orderBy("c.issued_at", "desc")
    .limit(limit)
    .select(
      "c.level",
      "c.score",
      "c.issued_at",
      "c.expires_at",
      "c.verification_code",
      "p.title as program_title",
    );
}

export async function findActiveCertificate(
  userId: number,
  programId: number,
  trx?: Db,
): Promise<CertificateRow | null> {
  const row = await db(trx)<CertificateRow>("training_certificates")
    .where({ user_id: userId, program_id: programId, is_expired: false })
    .first();
  return row ?? null;
}

export async function insertCertificate(
  values: {
    user_id: number;
    program_id: number;
    level: CertificateLevel;
    score: number;
    verification_code: string;
    expires_at: string | null;
  },
  trx?: Db,
): Promise<CertificateRow> {
  const [row] = await db(trx)<CertificateRow>("training_certificates")
    .insert(values as never)
    .returning("*");
  return row as CertificateRow;
}

/** The public verify read. Joins only what a certificate itself displays. */
export async function findByVerificationCode(code: string, trx?: Db) {
  const row = await db(trx)("training_certificates as c")
    .leftJoin("training_programs as p", "p.id", "c.program_id")
    .leftJoin("businesses as b", "b.id", "p.business_id")
    .leftJoin("platform_users as u", "u.id", "c.user_id")
    .where("c.verification_code", code)
    .first(
      "c.level",
      "c.score",
      "c.is_expired",
      "c.issued_at",
      "c.expires_at",
      "c.verification_code",
      "p.title as program_title",
      "b.business_name as issued_by",
      "u.first_name as holder_first_name",
      "u.last_name as holder_last_name",
    );
  return row ?? null;
}

// ── Gamification ────────────────────────────────────────────────────────────

export async function findGamification(userId: number, trx?: Db): Promise<GamificationRow | null> {
  const row = await db(trx)<GamificationRow>("training_gamification")
    .where({ user_id: userId })
    .first();
  return row ?? null;
}

export async function upsertGamification(
  userId: number,
  values: {
    total_xp: number;
    current_streak: number;
    longest_streak: number;
    last_activity_date: string | null;
    badges: unknown;
  },
  trx?: Db,
) {
  const [row] = await db(trx)("training_gamification")
    .insert({ user_id: userId, ...values, badges: JSON.stringify(values.badges) })
    .onConflict("user_id")
    .merge(["total_xp", "current_streak", "longest_streak", "last_activity_date", "badges", "updated_at"])
    .returning("*");
  return row;
}

export async function leaderboard(businessProgramIds: number[], limit: number, trx?: Db) {
  if (businessProgramIds.length === 0) return [];
  return db(trx)("training_gamification as g")
    .join("platform_users as u", "u.id", "g.user_id")
    // Only learners this business actually enrolled — the gamification table is
    // platform-wide, so without this join a business would read every user's XP.
    .whereIn(
      "g.user_id",
      db(trx)("training_assignments").whereIn("program_id", businessProgramIds).distinct("user_id"),
    )
    .orderBy("g.total_xp", "desc")
    .limit(limit)
    .select(
      "g.user_id",
      "g.total_xp",
      "g.current_streak",
      "g.longest_streak",
      "g.badges",
      "u.first_name",
      "u.last_name",
    );
}

export async function programIdsForBusiness(businessId: number, trx?: Db): Promise<number[]> {
  const rows = await db(trx)("training_programs")
    .where({ business_id: businessId })
    .whereNull("deleted_at")
    .select("id");
  return rows.map((r: { id: number }) => r.id);
}

// ── Roster (business view of one program's learners) ────────────────────────

export async function roster(programId: number, trx?: Db) {
  const [enrollments, progress, certificates] = await Promise.all([
    db(trx)("training_assignments")
      .where({ program_id: programId })
      .select("id", "user_id", "created_at", "due_date", "is_closed"),
    db(trx)("training_progress")
      .where({ program_id: programId })
      .select("user_id", "chapter_id", "status", "completed_at"),
    db(trx)("training_certificates")
      .where({ program_id: programId })
      .select("user_id", "level", "score", "issued_at", "is_expired"),
  ]);

  const userIds = [
    ...new Set([
      ...enrollments.map((e: { user_id: number }) => e.user_id),
      ...certificates.map((c: { user_id: number }) => c.user_id),
    ]),
  ];
  const learners =
    userIds.length > 0
      ? await db(trx)("platform_users")
          .whereIn("id", userIds)
          .select("id", "first_name", "last_name", "photo_url")
      : [];

  return { enrollments, progress, certificates, learners };
}
