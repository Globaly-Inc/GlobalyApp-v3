// Knex queries for the curated-content tables. One generic set of helpers: the four
// tables differ only in which columns a text search touches.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import type { ListQuery } from "../schemas/content.schema.js";

export const CONTENT_TABLES = {
  visa: `${S}.ai_knowledge_visa`,
  faqs: `${S}.ai_knowledge_faqs`,
  guides: `${S}.ai_knowledge_country_guides`,
} as const;

export type ContentKind = keyof typeof CONTENT_TABLES;

// Columns a `?q=` search scans, per kind.
const SEARCH_COLUMNS: Record<ContentKind, string[]> = {
  visa: ["visa_type", "destination_country"],
  faqs: ["question", "answer"],
  guides: ["country"],
};

export async function list(kind: ContentKind, opts: ListQuery) {
  const query = masterKnex(CONTENT_TABLES[kind]).orderBy("created_at", "desc").limit(opts.limit);
  if (opts.active !== undefined) query.where("active", opts.active);
  if (opts.q) {
    const like = `%${opts.q}%`;
    query.where((b) => {
      for (const col of SEARCH_COLUMNS[kind]) b.orWhereRaw(`?? ilike ?`, [col, like]);
    });
  }
  return query;
}

export async function findById(kind: ContentKind, id: string) {
  return masterKnex(CONTENT_TABLES[kind]).where({ id }).first();
}

export async function insert(kind: ContentKind, data: Record<string, unknown>) {
  const [row] = await masterKnex(CONTENT_TABLES[kind]).insert(data).returning("*");
  return row;
}

export async function update(kind: ContentKind, id: string, patch: Record<string, unknown>) {
  const [row] = await masterKnex(CONTENT_TABLES[kind])
    .where({ id })
    .update({ ...patch, updated_at: masterKnex.fn.now() })
    .returning("*");
  return row;
}

export async function remove(kind: ContentKind, id: string) {
  return masterKnex(CONTENT_TABLES[kind]).where({ id }).delete();
}

// ── Verification queue ──

const QUEUE = `${S}.data_verification_queue`;

export async function listQueue(opts: { status?: string; limit: number }) {
  const query = masterKnex(QUEUE).orderBy("created_at", "desc").limit(opts.limit);
  if (opts.status) query.where("status", opts.status);
  return query;
}

export async function reviewQueueItem(
  id: string,
  status: "verified" | "rejected",
  adminId: number,
  rejectionReason: string | null,
) {
  const [row] = await masterKnex(QUEUE)
    .where({ id })
    .update({
      status,
      rejection_reason: rejectionReason,
      reviewed_by: adminId,
      reviewed_at: masterKnex.fn.now(),
    })
    .returning("*");
  return row;
}

/** Counts behind the four stat cards, in one round trip per table. */
export async function overviewCounts() {
  const [visa, faqs, guides, pending] = await Promise.all([
    masterKnex(CONTENT_TABLES.visa).count("* as c").first(),
    masterKnex(CONTENT_TABLES.faqs).count("* as c").first(),
    masterKnex(CONTENT_TABLES.guides).count("* as c").first(),
    masterKnex(QUEUE).where("status", "pending").count("* as c").first(),
  ]);
  return {
    visa: Number(visa?.c ?? 0),
    faqs: Number(faqs?.c ?? 0),
    guides: Number(guides?.c ?? 0),
    pending_reviews: Number(pending?.c ?? 0),
  };
}
