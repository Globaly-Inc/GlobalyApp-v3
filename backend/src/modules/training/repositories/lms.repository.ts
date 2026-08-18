// LMS delivery queries (Wave E4). Knex only, master schema, same conventions as
// training.repository.ts.
//
// Every projection is explicit. V1's grading queue did
// `select("*, training_chapters(title), profiles(full_name)")` on
// lms_assignment_submissions and shipped every column of another learner's
// submission row to the browser.

import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";
import { paginationToOffset, type PaginationInput } from "../../../shared/pagination.js";
import type {
  ApplicationStatus,
  GradeStatus,
  InvitationStatus,
  SubmissionStatus,
} from "../consts.js";

export type Db = Knex | Knex.Transaction;

function db(trx?: Db): Db {
  return trx ?? masterKnex;
}

export const SUBMISSION_COLUMNS = [
  "id",
  "user_id",
  "chapter_id",
  "program_id",
  "submission_text",
  "file_url",
  "file_name",
  "status",
  "feedback",
  "attempt_number",
  "submitted_at",
  "reviewed_at",
  "reviewer_id",
] as const;

/** The learner's own view. Their reviewer's identity is not their business. */
export const LEARNER_SUBMISSION_COLUMNS = SUBMISSION_COLUMNS.filter(
  (c) => c !== "reviewer_id",
);

export const APPLICATION_COLUMNS = [
  "id",
  "program_id",
  "user_id",
  "status",
  "answers_json",
  "rejection_reason",
  "reviewed_by",
  "reviewed_at",
  "created_at",
] as const;

/**
 * `invite_token` is deliberately absent. V2 included it in the invitation LIST
 * projection, handing the token to every accepted business member.
 */
export const INVITATION_COLUMNS = [
  "id",
  "program_id",
  "email",
  "invited_by",
  "invitee_user_id",
  "status",
  "expires_at",
  "created_at",
] as const;

export interface SubmissionRow {
  id: number;
  user_id: number;
  chapter_id: number;
  program_id: number;
  submission_text: string | null;
  file_url: string | null;
  file_name: string | null;
  status: SubmissionStatus;
  feedback: string | null;
  attempt_number: number;
  submitted_at: Date;
  reviewed_at: Date | null;
  reviewer_id?: number | null;
}

export interface ChapterAttachmentRow {
  id: number;
  program_id: number;
  title: string;
  attachments: Record<string, unknown>;
}

// ── Chapters (attachments) ──────────────────────────────────────────────────

export async function findChapterInProgram(
  chapterId: number,
  programId: number,
  trx?: Db,
): Promise<ChapterAttachmentRow | null> {
  const row = await db(trx)("training_chapters")
    .where({ id: chapterId, program_id: programId })
    .first(["id", "program_id", "title", "attachments"]);
  return (row as ChapterAttachmentRow | undefined) ?? null;
}

export async function updateChapterAttachments(
  chapterId: number,
  programId: number,
  attachments: unknown,
  trx?: Db,
) {
  const [row] = await db(trx)("training_chapters")
    .where({ id: chapterId, program_id: programId })
    .update({ attachments: JSON.stringify(attachments), updated_at: db(trx).fn.now() })
    .returning(["id", "program_id", "title", "attachments"]);
  return (row as ChapterAttachmentRow | undefined) ?? null;
}

// ── Assignment submissions ──────────────────────────────────────────────────

export async function findLatestSubmission(
  userId: number,
  chapterId: number,
  trx?: Db,
): Promise<SubmissionRow | null> {
  const row = await db(trx)("lms_assignment_submissions")
    .where({ user_id: userId, chapter_id: chapterId })
    .orderBy("attempt_number", "desc")
    .first([...SUBMISSION_COLUMNS]);
  return (row as SubmissionRow | undefined) ?? null;
}

export async function insertSubmission(
  values: {
    user_id: number;
    chapter_id: number;
    program_id: number;
    submission_text: string | null;
    file_url: string | null;
    file_name: string | null;
    attempt_number: number;
  },
  trx?: Db,
): Promise<SubmissionRow> {
  const [row] = await db(trx)("lms_assignment_submissions")
    .insert(values)
    .returning([...SUBMISSION_COLUMNS]);
  return row as SubmissionRow;
}

export async function findSubmissionInProgram(
  submissionId: number,
  programId: number,
  trx?: Db,
): Promise<SubmissionRow | null> {
  const row = await db(trx)("lms_assignment_submissions")
    .where({ id: submissionId, program_id: programId })
    .first([...SUBMISSION_COLUMNS]);
  return (row as SubmissionRow | undefined) ?? null;
}

export async function gradeSubmission(
  submissionId: number,
  programId: number,
  values: { status: GradeStatus; feedback: string | null; reviewer_id: number },
  trx?: Db,
): Promise<SubmissionRow | null> {
  const [row] = await db(trx)("lms_assignment_submissions")
    .where({ id: submissionId, program_id: programId })
    .update({ ...values, reviewed_at: db(trx).fn.now() })
    .returning([...SUBMISSION_COLUMNS]);
  return (row as SubmissionRow | undefined) ?? null;
}

/** The business's grading queue. Paginated — V2's had no LIMIT at all. */
export async function listSubmissionsForProgram(
  programId: number,
  query: PaginationInput & { status?: SubmissionStatus; chapter_id?: number },
  trx?: Db,
) {
  const base = () => {
    const q = db(trx)("lms_assignment_submissions as s").where("s.program_id", programId);
    if (query.status) q.andWhere("s.status", query.status);
    if (query.chapter_id) q.andWhere("s.chapter_id", query.chapter_id);
    return q;
  };
  const { limit, offset } = paginationToOffset(query);
  const [rows, counted] = await Promise.all([
    base()
      .leftJoin("training_chapters as c", "c.id", "s.chapter_id")
      .leftJoin("platform_users as u", "u.id", "s.user_id")
      .orderBy("s.submitted_at", "desc")
      .limit(limit)
      .offset(offset)
      .select(
        ...SUBMISSION_COLUMNS.map((c) => `s.${c}`),
        "c.title as chapter_title",
        "u.first_name",
        "u.last_name",
      ),
    base().count<{ count: string }[]>({ count: "*" }).first(),
  ]);
  return { rows, total: Number(counted?.count ?? 0) };
}

export async function listSubmissionsForLearner(
  userId: number,
  programId: number,
  trx?: Db,
) {
  return db(trx)("lms_assignment_submissions")
    .where({ user_id: userId, program_id: programId })
    .orderBy([
      { column: "chapter_id", order: "asc" },
      { column: "attempt_number", order: "desc" },
    ])
    .select([...LEARNER_SUBMISSION_COLUMNS]);
}

// ── Quiz submissions ────────────────────────────────────────────────────────

export async function countQuizAttempts(
  userId: number,
  chapterId: number,
  trx?: Db,
): Promise<number> {
  const row = await db(trx)("lms_quiz_submissions")
    .where({ user_id: userId, chapter_id: chapterId })
    .count<{ count: string }[]>({ count: "*" })
    .first();
  return Number(row?.count ?? 0);
}

export async function insertQuizSubmission(
  values: {
    user_id: number;
    program_id: number;
    chapter_id: number;
    answers: unknown;
    score: number;
    passed: boolean;
    attempt_number: number;
  },
  trx?: Db,
) {
  const [row] = await db(trx)("lms_quiz_submissions")
    .insert({ ...values, answers: JSON.stringify(values.answers) })
    .returning([
      "id",
      "user_id",
      "program_id",
      "chapter_id",
      "answers",
      "score",
      "passed",
      "attempt_number",
      "submitted_at",
    ]);
  return row;
}

export async function listQuizSubmissions(userId: number, programId: number, trx?: Db) {
  return db(trx)("lms_quiz_submissions")
    .where({ user_id: userId, program_id: programId })
    .orderBy("attempt_number", "desc")
    .select("id", "chapter_id", "answers", "score", "passed", "attempt_number", "submitted_at");
}

// ── Enrolment applications ──────────────────────────────────────────────────

export async function findApplication(
  programId: number,
  userId: number,
  trx?: Db,
) {
  const row = await db(trx)("training_enrollment_applications")
    .where({ program_id: programId, user_id: userId })
    .first([...APPLICATION_COLUMNS]);
  return row ?? null;
}

export async function findApplicationInProgram(
  applicationId: number,
  programId: number,
  trx?: Db,
) {
  const row = await db(trx)("training_enrollment_applications")
    .where({ id: applicationId, program_id: programId })
    .first([...APPLICATION_COLUMNS]);
  return row ?? null;
}

export async function insertApplication(
  values: { program_id: number; user_id: number; answers_json: unknown },
  trx?: Db,
) {
  const [row] = await db(trx)("training_enrollment_applications")
    .insert({ ...values, answers_json: JSON.stringify(values.answers_json ?? {}) })
    .returning([...APPLICATION_COLUMNS]);
  return row;
}

export async function decideApplication(
  applicationId: number,
  programId: number,
  values: {
    status: ApplicationStatus;
    rejection_reason?: string | null;
    reviewed_by: number;
  },
  trx?: Db,
) {
  const [row] = await db(trx)("training_enrollment_applications")
    .where({ id: applicationId, program_id: programId })
    .update({
      status: values.status,
      rejection_reason: values.rejection_reason ?? null,
      reviewed_by: values.reviewed_by,
      reviewed_at: db(trx).fn.now(),
      updated_at: db(trx).fn.now(),
    })
    .returning([...APPLICATION_COLUMNS]);
  return row ?? null;
}

export async function listApplicationsForProgram(
  programId: number,
  query: PaginationInput & { status?: ApplicationStatus },
  trx?: Db,
) {
  const base = () => {
    const q = db(trx)("training_enrollment_applications as a").where("a.program_id", programId);
    if (query.status) q.andWhere("a.status", query.status);
    return q;
  };
  const { limit, offset } = paginationToOffset(query);
  const [rows, counted] = await Promise.all([
    base()
      .leftJoin("platform_users as u", "u.id", "a.user_id")
      .orderBy("a.created_at", "desc")
      .limit(limit)
      .offset(offset)
      .select(...APPLICATION_COLUMNS.map((c) => `a.${c}`), "u.first_name", "u.last_name"),
    base().count<{ count: string }[]>({ count: "*" }).first(),
  ]);
  return { rows, total: Number(counted?.count ?? 0) };
}

/** GROUP BY, not "pull every row and tally three integers in JS" as V2 did. */
export async function applicationCounts(programId: number, trx?: Db) {
  const rows = await db(trx)("training_enrollment_applications")
    .where({ program_id: programId })
    .groupBy("status")
    .select("status")
    .count<{ status: ApplicationStatus; count: string }[]>({ count: "*" });
  const counts: Record<ApplicationStatus, number> = { pending: 0, approved: 0, rejected: 0 };
  for (const row of rows) counts[row.status] = Number(row.count);
  return counts;
}

// ── Invitations ─────────────────────────────────────────────────────────────

export async function upsertInvitation(
  values: {
    program_id: number;
    email: string;
    invited_by: number;
    invitee_user_id: number | null;
    invite_token: string;
    expires_at: Date;
  },
  trx?: Db,
) {
  const [row] = await db(trx)("training_invitations")
    .insert(values)
    // V1 relied on UNIQUE (program_id, email) + 23505 for idempotency. Re-inviting
    // refreshes the expiry rather than stacking rows and re-sending for ever.
    .onConflict(["program_id", "email"])
    .merge(["invitee_user_id", "expires_at", "updated_at"])
    .returning([...INVITATION_COLUMNS]);
  return row;
}

export async function listInvitations(
  programId: number,
  query: PaginationInput & { status?: InvitationStatus },
  trx?: Db,
) {
  const base = () => {
    const q = db(trx)("training_invitations").where({ program_id: programId });
    if (query.status) q.andWhere({ status: query.status });
    return q;
  };
  const { limit, offset } = paginationToOffset(query);
  const [rows, counted] = await Promise.all([
    base()
      .orderBy("created_at", "desc")
      .limit(limit)
      .offset(offset)
      .select([...INVITATION_COLUMNS]),
    base().count<{ count: string }[]>({ count: "*" }).first(),
  ]);
  return { rows, total: Number(counted?.count ?? 0) };
}

export async function findInvitationInProgram(
  invitationId: number,
  programId: number,
  trx?: Db,
) {
  const row = await db(trx)("training_invitations")
    .where({ id: invitationId, program_id: programId })
    .first([...INVITATION_COLUMNS]);
  return row ?? null;
}

export async function deleteInvitation(invitationId: number, programId: number, trx?: Db) {
  return db(trx)("training_invitations")
    .where({ id: invitationId, program_id: programId, status: "pending" })
    .delete();
}

export async function findUserByEmail(email: string, trx?: Db) {
  const row = await db(trx)("platform_users")
    .whereRaw("lower(email) = lower(?)", [email])
    .whereNull("deleted_at")
    .first(["id", "first_name", "last_name", "email"]);
  return row ?? null;
}

export async function findAssignment(programId: number, userId: number, trx?: Db) {
  const row = await db(trx)("training_assignments")
    .where({ program_id: programId, user_id: userId })
    .first(["id", "program_id", "user_id", "due_date", "is_closed"]);
  return row ?? null;
}

/** Undo a completed lesson when its assignment is failed. See the service. */
export async function markChapterIncomplete(
  userId: number,
  chapterId: number,
  trx?: Db,
) {
  return db(trx)("training_progress")
    .where({ user_id: userId, chapter_id: chapterId })
    .update({ status: "in_progress", completed_at: null, updated_at: db(trx).fn.now() });
}
