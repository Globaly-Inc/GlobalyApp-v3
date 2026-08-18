// Inquiries / threads / messages / analytics queries. Knex only.
//
// Inquiries have no business_id of their own — they hang off
// ambassador_programs.business_id, exactly as in V2. So every business-scoped
// read here takes an already-resolved list of program ids (see
// programs.repository.programIdsForBusiness) rather than a business id, and an
// empty list short-circuits to an empty result. That is what stops business A
// reading business B's engagement data.

import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";
import type { PaginationInput } from "../../../shared/pagination.js";
import { paginationToOffset } from "../../../shared/pagination.js";
import type { InquiryStatus } from "../consts.js";

export type Db = Knex | Knex.Transaction;

export function db(trx?: Db): Db {
  return trx ?? masterKnex;
}

export interface InquiryRow {
  id: number;
  program_id: number;
  ambassador_id: number | null;
  prospect_id: number;
  status: InquiryStatus;
  first_message: string;
  inquiry_context: Record<string, unknown>;
  matched_at: Date | null;
  expires_at: Date | null;
  accepted_at: Date | null;
  resolved_at: Date | null;
  escalated_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ThreadRow {
  id: number;
  inquiry_id: number;
  participants: number[];
  created_at: Date;
  updated_at: Date;
}

export interface MessageRow {
  id: number;
  thread_id: number;
  sender_id: number;
  sender_type: "prospect" | "ambassador";
  message_text: string;
  flagged: boolean;
  flag_reason: string | null;
  read_at: Date | null;
  created_at: Date;
}

// ── Inquiries ───────────────────────────────────────────────────────────────

export async function insertInquiry(
  values: Partial<InquiryRow> & { program_id: number; prospect_id: number; first_message: string },
  trx?: Db,
): Promise<InquiryRow> {
  const [row] = await db(trx)<InquiryRow>("ambassador_inquiries")
    .insert(values as never)
    .returning("*");
  return row as InquiryRow;
}

export async function findInquiry(id: number, trx?: Db): Promise<InquiryRow | null> {
  const row = await db(trx)<InquiryRow>("ambassador_inquiries").where({ id }).first();
  return row ?? null;
}

/** Scoped read: null when the inquiry belongs to a program this business does not own. */
export async function findInquiryInPrograms(
  id: number,
  programIds: number[],
  trx?: Db,
): Promise<InquiryRow | null> {
  if (programIds.length === 0) return null;
  const row = await db(trx)<InquiryRow>("ambassador_inquiries")
    .where({ id })
    .whereIn("program_id", programIds)
    .first();
  return row ?? null;
}

export async function listInquiriesInPrograms(
  programIds: number[],
  query: PaginationInput & { status?: InquiryStatus },
  trx?: Db,
): Promise<{ rows: InquiryRow[]; total: number }> {
  if (programIds.length === 0) return { rows: [], total: 0 };
  const { limit, offset } = paginationToOffset(query);
  const base = () => {
    const q = db(trx)<InquiryRow>("ambassador_inquiries").whereIn("program_id", programIds);
    if (query.status) q.andWhere({ status: query.status });
    return q;
  };
  const [rows, countRow] = await Promise.all([
    base().orderBy("created_at", "desc").limit(limit).offset(offset),
    base().count<{ count: string }[]>({ count: "*" }).first(),
  ]);
  return { rows, total: Number(countRow?.count ?? 0) };
}

export async function listInquiriesForAmbassador(
  ambassadorId: number,
  limit: number,
  trx?: Db,
): Promise<InquiryRow[]> {
  return db(trx)<InquiryRow>("ambassador_inquiries")
    .where({ ambassador_id: ambassadorId })
    .orderBy("created_at", "desc")
    .limit(limit);
}

export async function updateInquiry(
  id: number,
  values: Record<string, unknown>,
  trx?: Db,
): Promise<InquiryRow | null> {
  const [row] = await db(trx)<InquiryRow>("ambassador_inquiries")
    .where({ id })
    .update({ ...values, updated_at: db(trx).fn.now() } as never)
    .returning("*");
  return (row as InquiryRow) ?? null;
}

/**
 * Update an inquiry ONLY when it is currently assigned to this ambassador.
 * The ownership predicate is part of the UPDATE, not a preceding SELECT, so two
 * concurrent writers cannot both pass a check and then both write.
 * Returns null when nothing matched — the caller turns that into a 403/404.
 */
export async function updateInquiryForAmbassador(
  id: number,
  ambassadorId: number,
  values: Record<string, unknown>,
  trx?: Db,
): Promise<InquiryRow | null> {
  const [row] = await db(trx)<InquiryRow>("ambassador_inquiries")
    .where({ id, ambassador_id: ambassadorId })
    .update({ ...values, updated_at: db(trx).fn.now() } as never)
    .returning("*");
  return (row as InquiryRow) ?? null;
}

/** Matched-but-unaccepted inquiries whose accept window has closed. */
export async function claimExpiredInquiries(now: Date, limit: number, trx?: Db): Promise<InquiryRow[]> {
  return db(trx)<InquiryRow>("ambassador_inquiries")
    .where({ status: "matched" })
    .whereNotNull("expires_at")
    .andWhere("expires_at", "<", now)
    .orderBy("expires_at", "asc")
    .limit(limit);
}

/** Online, active ambassadors in a program, best-rated first, excluding one. */
export async function rerouteCandidates(
  programId: number,
  excludeAmbassadorId: number | null,
  limit: number,
  trx?: Db,
) {
  const q = db(trx)("ambassadors")
    .where({ program_id: programId, status: "active", is_online: true })
    .whereNull("deleted_at");
  if (excludeAmbassadorId !== null) q.andWhereNot({ id: excludeAmbassadorId });
  const rows = await q
    .orderBy("avg_rating", "desc")
    .limit(limit)
    .select("id", "user_id", "country_of_origin", "avg_rating");
  return rows.map((r: { id: number; user_id: number; country_of_origin: string | null; avg_rating: string }) => ({
    id: r.id,
    user_id: r.user_id,
    country_of_origin: r.country_of_origin,
    avg_rating: Number(r.avg_rating),
  }));
}

// ── Threads + messages ──────────────────────────────────────────────────────

export async function findThreadByInquiry(inquiryId: number, trx?: Db): Promise<ThreadRow | null> {
  const row = await db(trx)<ThreadRow>("ambassador_threads").where({ inquiry_id: inquiryId }).first();
  return row ?? null;
}

export async function findThread(id: number, trx?: Db): Promise<ThreadRow | null> {
  const row = await db(trx)<ThreadRow>("ambassador_threads").where({ id }).first();
  return row ?? null;
}

/**
 * Get-or-create, resolved by the UNIQUE on inquiry_id rather than a
 * read-then-insert race: a concurrent loser conflicts and re-reads the winner.
 */
export async function ensureThread(
  inquiryId: number,
  participants: number[],
  trx?: Db,
): Promise<ThreadRow> {
  const existing = await findThreadByInquiry(inquiryId, trx);
  if (existing) return existing;
  const [row] = await db(trx)<ThreadRow>("ambassador_threads")
    .insert({ inquiry_id: inquiryId, participants } as never)
    .onConflict("inquiry_id")
    .ignore()
    .returning("*");
  if (row) return row as ThreadRow;
  return (await findThreadByInquiry(inquiryId, trx))!;
}

export async function listMessages(threadId: number, trx?: Db): Promise<MessageRow[]> {
  return db(trx)<MessageRow>("ambassador_messages")
    .where({ thread_id: threadId })
    .orderBy("created_at", "asc");
}

export async function insertMessage(
  values: { thread_id: number; sender_id: number; sender_type: "prospect" | "ambassador"; message_text: string },
  trx?: Db,
): Promise<MessageRow> {
  const [row] = await db(trx)<MessageRow>("ambassador_messages")
    .insert(values as never)
    .returning("*");
  return row as MessageRow;
}

// ── Analytics + digest aggregates ───────────────────────────────────────────

export async function inquiryStatusCounts(programIds: number[], trx?: Db) {
  if (programIds.length === 0) return [] as { status: InquiryStatus; count: number }[];
  const rows = await db(trx)("ambassador_inquiries")
    .whereIn("program_id", programIds)
    .groupBy("status")
    .select("status")
    .count<{ status: InquiryStatus; count: string }[]>({ count: "*" });
  return rows.map((r) => ({ status: r.status, count: Number(r.count) }));
}

export async function activeAmbassadorStats(programIds: number[], trx?: Db) {
  if (programIds.length === 0) return [];
  const rows = await db(trx)("ambassadors")
    .whereIn("program_id", programIds)
    .andWhere({ status: "active" })
    .whereNull("deleted_at")
    .select(
      "id",
      "major",
      "year",
      "total_inquiries",
      "total_resolved",
      "avg_rating",
      "typical_response_time_minutes",
    );
  return rows.map(
    (r: {
      id: number;
      major: string | null;
      year: number | null;
      total_inquiries: number;
      total_resolved: number;
      avg_rating: string;
      typical_response_time_minutes: number | null;
    }) => ({ ...r, avg_rating: Number(r.avg_rating) }),
  );
}

/** Message senders, for the business-side transcript. Names only — no contact details. */
export async function senderNames(userIds: number[], trx?: Db) {
  if (userIds.length === 0) return [];
  return db(trx)("platform_users")
    .whereIn("id", userIds)
    .select("id as user_id", "first_name", "last_name");
}

export interface DigestCounts {
  new_inquiries: number;
  resolved_inquiries: number;
  new_ambassadors: number;
  flagged_messages: number;
}

/** The four KPIs V1's `send-ambassador-digest` computed, in one round trip each. */
export async function digestCounts(programId: number, since: Date, trx?: Db): Promise<DigestCounts> {
  const k = db(trx);
  const [newInquiries, resolved, newAmbassadors, flagged] = await Promise.all([
    k("ambassador_inquiries").where({ program_id: programId }).andWhere("created_at", ">=", since)
      .count<{ count: string }[]>({ count: "*" }).first(),
    k("ambassador_inquiries").where({ program_id: programId, status: "resolved" })
      .andWhere("resolved_at", ">=", since)
      .count<{ count: string }[]>({ count: "*" }).first(),
    k("ambassadors").where({ program_id: programId }).andWhere("joined_at", ">=", since)
      .count<{ count: string }[]>({ count: "*" }).first(),
    k("ambassador_messages as m")
      .join("ambassador_threads as t", "t.id", "m.thread_id")
      .join("ambassador_inquiries as i", "i.id", "t.inquiry_id")
      .where("i.program_id", programId)
      .andWhere("m.flagged", true)
      .andWhere("m.created_at", ">=", since)
      .count<{ count: string }[]>({ count: "*" }).first(),
  ]);
  return {
    new_inquiries: Number(newInquiries?.count ?? 0),
    resolved_inquiries: Number(resolved?.count ?? 0),
    new_ambassadors: Number(newAmbassadors?.count ?? 0),
    flagged_messages: Number(flagged?.count ?? 0),
  };
}

export async function topAmbassadors(programId: number, limit: number, trx?: Db) {
  const rows = await db(trx)("ambassadors as a")
    .join("platform_users as u", "u.id", "a.user_id")
    .where("a.program_id", programId)
    .andWhere("a.status", "active")
    .whereNull("a.deleted_at")
    .orderBy("a.total_resolved", "desc")
    .limit(limit)
    .select("a.total_resolved", "a.avg_rating", "u.first_name", "u.last_name");
  return rows.map(
    (r: { total_resolved: number; avg_rating: string; first_name: string | null; last_name: string | null }) => ({
      name: `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || "Ambassador",
      resolved: r.total_resolved,
      rating: Number(r.avg_rating),
    }),
  );
}

export async function activeProgramsForDigest(trx?: Db) {
  return db(trx)("ambassador_programs as p")
    .join("businesses as b", "b.id", "p.business_id")
    .where("p.status", "active")
    .whereNull("p.deleted_at")
    .select("p.id", "p.name", "p.business_id", "b.business_name", "b.email as business_email");
}
