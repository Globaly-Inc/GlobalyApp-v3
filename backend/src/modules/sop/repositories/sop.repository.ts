// Knex only. Every read names its columns.
//
// A `select *` here would be a `select *` over a student's unpublished personal
// writing, their profile snapshot and their chat history. Four leaks of exactly that
// shape have been caught in this program already, so the column lists below are the
// allowlist and a column added by a later migration is excluded until someone adds it
// on purpose. `sop_generation_logs` exposes insert and select only — it is the
// append-only audit trail V1 protected with `FOR UPDATE USING (false)` RLS policies
// that V3 does not have.

import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";
import type { DocumentType } from "../consts.js";

type Db = Knex | Knex.Transaction;
const db = (trx?: Db): Db => trx ?? masterKnex;

// ── sessions ────────────────────────────────────────────────────────────────

/** Never includes profile_snapshot or chat_history: a list does not need the essay. */
const SESSION_LIST_COLUMNS = [
  "id",
  "student_id",
  "target_org_type",
  "target_org_id",
  "course_service_id",
  "country_id",
  "status",
  "stage",
  "created_at",
  "updated_at",
] as const;

/** The detail read adds the snapshot, because the owner is entitled to their own. */
const SESSION_DETAIL_COLUMNS = [
  ...SESSION_LIST_COLUMNS,
  "initiated_by",
  "is_agent_initiated",
  "profile_snapshot",
  "chat_history",
] as const;

export interface SessionRow {
  id: number;
  student_id: number;
  target_org_type: string | null;
  target_org_id: number | null;
  course_service_id: string | null;
  country_id: number | null;
  status: string;
  stage: string;
  created_at: Date;
  updated_at: Date;
  initiated_by?: number;
  is_agent_initiated?: boolean;
  profile_snapshot?: Record<string, unknown>;
  chat_history?: unknown[];
}

export interface CreateSessionInput {
  student_id: number;
  initiated_by: number;
  target_org_type: string | null;
  target_org_id: number | null;
  course_service_id: string | null;
  country_id: number | null;
  profile_snapshot: Record<string, unknown>;
}

export async function insertSession(input: CreateSessionInput, trx?: Db): Promise<SessionRow> {
  const [row] = await db(trx)("sop_intake_sessions")
    .insert({
      ...input,
      profile_snapshot: JSON.stringify(input.profile_snapshot),
    })
    .returning([...SESSION_DETAIL_COLUMNS]);
  return row as SessionRow;
}

export async function findSession(
  id: number,
  studentId: number,
  trx?: Db,
): Promise<SessionRow | undefined> {
  return db(trx)("sop_intake_sessions")
    .select([...SESSION_DETAIL_COLUMNS])
    .where({ id, student_id: studentId })
    .whereNull("deleted_at")
    .first() as Promise<SessionRow | undefined>;
}

export async function listSessions(studentId: number, trx?: Db): Promise<SessionRow[]> {
  return db(trx)("sop_intake_sessions")
    .select([...SESSION_LIST_COLUMNS])
    .where({ student_id: studentId })
    .whereNull("deleted_at")
    .orderBy("created_at", "desc") as Promise<SessionRow[]>;
}

/** Returns the row so a caller can check the update actually landed. */
export async function updateSessionState(
  id: number,
  patch: { status?: string; stage?: string },
  trx?: Db,
): Promise<SessionRow | undefined> {
  const [row] = await db(trx)("sop_intake_sessions")
    .where({ id })
    .update({ ...patch, updated_at: db(trx).fn.now() })
    .returning([...SESSION_LIST_COLUMNS]);
  return row as SessionRow | undefined;
}

// ── questionnaire ───────────────────────────────────────────────────────────

const ANSWER_COLUMNS = ["id", "question_key", "answer", "answer_json", "updated_at"] as const;

export interface AnswerRow {
  id: number;
  question_key: string;
  answer: string | null;
  answer_json: unknown;
  updated_at: Date;
}

export async function upsertAnswers(
  sessionId: number,
  answers: Array<{ question_key: string; answer: string | null; answer_json?: unknown }>,
  trx?: Db,
): Promise<void> {
  if (answers.length === 0) return;
  const conn = db(trx);
  await conn("sop_conversation_answers")
    .insert(
      answers.map((a) => ({
        session_id: sessionId,
        question_key: a.question_key,
        answer: a.answer,
        answer_json: a.answer_json === undefined ? null : JSON.stringify(a.answer_json),
      })),
    )
    // (session_id, question_key) is the natural key and both columns are NOT NULL, so
    // this predicate always matches an existing row — the G6 trap (a UNIQUE over a
    // nullable column, where ON CONFLICT silently never fires) does not apply.
    .onConflict(["session_id", "question_key"])
    .merge(["answer", "answer_json", "updated_at"]);
}

export async function listAnswers(sessionId: number, trx?: Db): Promise<AnswerRow[]> {
  return db(trx)("sop_conversation_answers")
    .select([...ANSWER_COLUMNS])
    .where({ session_id: sessionId })
    .orderBy("question_key") as Promise<AnswerRow[]>;
}

// ── documents ───────────────────────────────────────────────────────────────

/** The history list: metadata only. The text is fetched one version at a time. */
const DOCUMENT_META_COLUMNS = [
  "id",
  "session_id",
  "document_type",
  "version",
  "is_current",
  "word_count",
  "char_count",
  "quality_score",
  "edit_depth_pct",
  "created_at",
] as const;

const DOCUMENT_FULL_COLUMNS = [
  ...DOCUMENT_META_COLUMNS,
  "created_by",
  "content",
  "quality_breakdown",
  "analysis",
] as const;

export interface DocumentRow {
  id: number;
  session_id: number;
  document_type: DocumentType;
  version: number;
  is_current: boolean;
  word_count: number | null;
  char_count: number | null;
  quality_score: number | null;
  edit_depth_pct: string | number;
  created_at: Date;
  created_by?: number;
  content?: string;
  quality_breakdown?: Record<string, unknown>;
  analysis?: Record<string, unknown>;
}

export interface InsertDocumentInput {
  session_id: number;
  created_by: number;
  document_type: DocumentType;
  version: number;
  content: string;
  word_count: number;
  char_count: number;
  quality_score: number;
  quality_breakdown: Record<string, unknown>;
  edit_depth_pct: number;
  analysis: Record<string, unknown>;
}

export async function insertDocument(
  input: InsertDocumentInput,
  trx?: Db,
): Promise<DocumentRow> {
  const [row] = await db(trx)("sop_documents")
    .insert({
      ...input,
      quality_breakdown: JSON.stringify(input.quality_breakdown),
      analysis: JSON.stringify(input.analysis),
    })
    .returning([...DOCUMENT_FULL_COLUMNS]);
  return row as DocumentRow;
}

/** Scoped by the owning session's student, which is the ownership boundary. */
export async function findDocument(
  id: number,
  studentId: number,
  trx?: Db,
): Promise<(DocumentRow & { student_id: number; country_id: number | null }) | undefined> {
  return db(trx)("sop_documents as d")
    .innerJoin("sop_intake_sessions as s", "s.id", "d.session_id")
    .select([
      ...DOCUMENT_FULL_COLUMNS.map((c) => `d.${c}`),
      "s.student_id as student_id",
      "s.country_id as country_id",
    ])
    .where("d.id", id)
    .andWhere("s.student_id", studentId)
    .whereNull("s.deleted_at")
    .first() as Promise<
    (DocumentRow & { student_id: number; country_id: number | null }) | undefined
  >;
}

export async function listVersions(
  sessionId: number,
  documentType: DocumentType,
  trx?: Db,
): Promise<DocumentRow[]> {
  return db(trx)("sop_documents")
    .select([...DOCUMENT_META_COLUMNS])
    .where({ session_id: sessionId, document_type: documentType })
    .orderBy("version") as Promise<DocumentRow[]>;
}

/** Every version WITH its text — used by the revision path, which needs the baseline. */
export async function listVersionsWithContent(
  sessionId: number,
  documentType: DocumentType,
  trx?: Db,
): Promise<DocumentRow[]> {
  return db(trx)("sop_documents")
    .select([...DOCUMENT_FULL_COLUMNS])
    .where({ session_id: sessionId, document_type: documentType })
    .orderBy("version")
    .forUpdate() as Promise<DocumentRow[]>;
}

export async function listCurrentDocuments(
  sessionId: number,
  trx?: Db,
): Promise<DocumentRow[]> {
  return db(trx)("sop_documents")
    .select([...DOCUMENT_FULL_COLUMNS])
    .where({ session_id: sessionId, is_current: true })
    .orderBy("document_type") as Promise<DocumentRow[]>;
}

export async function clearCurrentFlag(
  sessionId: number,
  documentType: DocumentType,
  trx: Db,
): Promise<void> {
  await trx("sop_documents")
    .where({ session_id: sessionId, document_type: documentType, is_current: true })
    .update({ is_current: false, updated_at: trx.fn.now() });
}

export async function deleteVersions(ids: number[], trx: Db): Promise<void> {
  if (ids.length === 0) return;
  await trx("sop_documents").whereIn("id", ids).del();
}

// ── reference data ──────────────────────────────────────────────────────────

const CONFIG_COLUMNS = [
  "country_code",
  "document_type",
  "min_words",
  "max_words",
  "max_chars",
  "banned_phrases",
  "compliance_rules",
] as const;

export interface ConfigRow {
  country_code: string;
  document_type: DocumentType;
  min_words: number | null;
  max_words: number | null;
  max_chars: number | null;
  banned_phrases: string[];
  compliance_rules: Record<string, unknown>;
}

export async function listConfig(countryCode: string, trx?: Db): Promise<ConfigRow[]> {
  return db(trx)("sop_config")
    .select([...CONFIG_COLUMNS])
    .where({ country_code: countryCode, is_active: true })
    .orderBy("document_type") as Promise<ConfigRow[]>;
}

const GUIDE_COLUMNS = [
  "country_code",
  "key_requirements",
  "dos",
  "donts",
  "common_refusal_reasons",
  "notes",
] as const;

export interface GuideRow {
  country_code: string;
  key_requirements: string[];
  dos: string[];
  donts: string[];
  common_refusal_reasons: string[];
  notes: string | null;
}

export async function findGuide(countryCode: string, trx?: Db): Promise<GuideRow | undefined> {
  return db(trx)("sop_country_guides")
    .select([...GUIDE_COLUMNS])
    .where({ country_code: countryCode })
    .first() as Promise<GuideRow | undefined>;
}

export async function findCountryIso2(id: number, trx?: Db): Promise<string | undefined> {
  const row = await db(trx)("countries").select("iso2").where({ id }).first();
  return row?.iso2 as string | undefined;
}

// ── audit log (append only) ─────────────────────────────────────────────────

export interface LogInput {
  session_id: number;
  student_id: number;
  initiated_by: number;
  action: string;
  credits_charged?: number;
  status: "success" | "failed";
  metadata?: Record<string, unknown>;
}

export async function insertLog(input: LogInput, trx?: Db): Promise<{ id: number }> {
  const [row] = await db(trx)("sop_generation_logs")
    .insert({
      session_id: input.session_id,
      student_id: input.student_id,
      initiated_by: input.initiated_by,
      action: input.action,
      credits_charged: input.credits_charged ?? 0,
      status: input.status,
      metadata: JSON.stringify(input.metadata ?? {}),
    })
    .returning(["id"]);
  return { id: Number(row.id) };
}
