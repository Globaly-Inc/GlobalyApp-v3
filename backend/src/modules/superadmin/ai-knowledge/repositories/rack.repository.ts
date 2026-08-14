// Knex queries for the Knowledge Rack.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import type { DocumentQuery, SourceQuery } from "../schemas/rack.schema.js";

const CATEGORIES = `${S}.ai_knowledge_categories`;
const SOURCES = `${S}.ai_knowledge_sources`;
const DOCUMENTS = `${S}.ai_knowledge_documents`;

// ── Categories ──

export async function listCategories() {
  return masterKnex(CATEGORIES).orderBy("sort_order").orderBy("label");
}

export async function findCategory(id: string) {
  return masterKnex(CATEGORIES).where({ id }).first();
}

export async function insertCategory(data: Record<string, unknown>) {
  const [row] = await masterKnex(CATEGORIES).insert(data).returning("*");
  return row;
}

export async function updateCategory(id: string, patch: Record<string, unknown>) {
  const [row] = await masterKnex(CATEGORIES)
    .where({ id })
    .update({ ...patch, updated_at: masterKnex.fn.now() })
    .returning("*");
  return row;
}

export async function deleteCategory(id: string) {
  return masterKnex(CATEGORIES).where({ id }).delete();
}

// ── Sources ──

export async function listSources(opts: SourceQuery) {
  const query = masterKnex(SOURCES).orderBy("created_at", "desc").limit(opts.limit);
  if (opts.category_id) query.where("category_id", opts.category_id);
  if (opts.q) {
    const like = `%${opts.q}%`;
    query.where((b) => b.whereILike("url", like).orWhereILike("domain", like).orWhereILike("title", like));
  }
  return query;
}

export async function findSource(id: string) {
  return masterKnex(SOURCES).where({ id }).first();
}

export async function insertSource(data: Record<string, unknown>) {
  const [row] = await masterKnex(SOURCES).insert(data).returning("*");
  return row;
}

export async function updateSource(id: string, patch: Record<string, unknown>) {
  const [row] = await masterKnex(SOURCES)
    .where({ id })
    .update({ ...patch, updated_at: masterKnex.fn.now() })
    .returning("*");
  return row;
}

export async function deleteSource(id: string) {
  return masterKnex(SOURCES).where({ id }).delete();
}

// ── Documents ──

// markdown is deliberately excluded: a source can hold hundreds of documents and the
// list only renders titles. Fetch the body through findDocument.
const DOC_LIST_COLUMNS = [
  "id", "source_id", "category_id", "url", "title", "content_hash",
  "word_count", "crawled_at", "active", "created_at", "updated_at",
];

export async function listDocuments(opts: DocumentQuery) {
  const query = masterKnex(DOCUMENTS)
    .select(DOC_LIST_COLUMNS)
    // Whether a row is embedded drives the "in brain" badge, but the vector itself
    // is far too large to ship to the browser.
    .select(masterKnex.raw("(embedding IS NOT NULL) as is_embedded"))
    .orderBy("crawled_at", "desc")
    .limit(opts.limit);
  if (opts.source_id) query.where("source_id", opts.source_id);
  if (opts.category_id) query.where("category_id", opts.category_id);
  if (opts.q) {
    const like = `%${opts.q}%`;
    query.where((b) => b.whereILike("title", like).orWhereILike("url", like));
  }
  return query;
}

export async function findDocument(id: string) {
  return masterKnex(DOCUMENTS).where({ id }).first();
}

export async function deleteDocument(id: string) {
  return masterKnex(DOCUMENTS).where({ id }).delete();
}

/** doc_count is denormalised onto the source; recompute after any document change. */
export async function syncDocCount(sourceId: string) {
  const row = await masterKnex(DOCUMENTS).where({ source_id: sourceId, active: true }).count("* as c").first();
  await masterKnex(SOURCES).where({ id: sourceId }).update({ doc_count: Number(row?.c ?? 0) });
}

export async function rackCounts() {
  const [categories, sources, documents, embedded] = await Promise.all([
    masterKnex(CATEGORIES).count("* as c").first(),
    masterKnex(SOURCES).count("* as c").first(),
    masterKnex(DOCUMENTS).count("* as c").first(),
    masterKnex(DOCUMENTS).whereNotNull("embedding").count("* as c").first(),
  ]);
  return {
    categories: Number(categories?.c ?? 0),
    sources: Number(sources?.c ?? 0),
    documents: Number(documents?.c ?? 0),
    embedded_documents: Number(embedded?.c ?? 0),
  };
}
