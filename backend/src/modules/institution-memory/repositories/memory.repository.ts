// Knex access to institution_ai_memories — a table in each institution's OWN schema.
//
// Two rules for everyone above this file:
//   1. institutionId is a `number` on every read and write. It resolves to that institution's
//      tenant schema through the pool manager; a query can only ever see one institution's rows
//      because the schema, not a column, is the boundary. An unprovisioned institution has no
//      schema and therefore no memory — reads return nothing, writes throw.
//   2. every counter, status or history change is ONE UPDATE. The learning worker runs jobs
//      concurrently and touchUsed runs on every chat turn; read-modify-write would race.
//
// The embedding never leaves the database: reads select explicit columns plus `has_embedding`.

import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";
import { getKnex } from "../../../core/db/pool-manager.js";
import { schemaName } from "../../../core/db/knex.js";
import { NotFoundError } from "../../../shared/errors.js";
import {
  MemoryRowSchema, type MemoryRow, type MemoryQuery, type MemoryType, type MemorySource,
  type MemoryStatus, type HistoryEntry,
} from "../schemas/memory.schema.js";

const TABLE = "institution_ai_memories";
const HISTORY_CAP = 30;
const SCHEMA_TTL_MS = 5 * 60_000;

// ── Tenant resolution ────────────────────────────────────────────────────────

// ponytail: in-process map, one backend process today. A schema name never changes once
// provisioned, so a stale entry can only ever be a still-valid one.
const schemas = new Map<number, { schema: string | null; until: number }>();

/** The institution's tenant schema, or null when it has none yet. */
async function schemaFor(institutionId: number): Promise<string | null> {
  const hit = schemas.get(institutionId);
  if (hit && hit.until > Date.now()) return hit.schema;
  const row = await masterKnex("institutions")
    .where({ id: institutionId }).whereNull("deleted_at").whereNotNull("schema_provisioned_at")
    .first("schema_name");
  const schema = row?.schema_name ? schemaName(row.schema_name) : null;
  schemas.set(institutionId, { schema, until: Date.now() + SCHEMA_TTL_MS });
  return schema;
}

/** Test seam: replace to point every institution at a faked connection. */
export const _memoryDeps = {
  tenantDb: async (institutionId: number): Promise<Knex | null> => {
    const schema = await schemaFor(institutionId);
    return schema ? getKnex(schema, schema) : null;
  },
};
export const clearSchemaCache = () => schemas.clear();

/** The tenant connection, or a NotFoundError — writes must never silently go nowhere. */
async function db(institutionId: number): Promise<Knex> {
  const k = await _memoryDeps.tenantDb(institutionId);
  if (!k) throw new NotFoundError("Institution has no provisioned schema");
  return k;
}
/** For reads: null means "no schema, so no memories" — the caller returns empty. */
const dbOrNull = (institutionId: number) => _memoryDeps.tenantDb(institutionId);

// ── Helpers ──────────────────────────────────────────────────────────────────

const COLUMNS = [
  "id", "type", "content", "content_hash", "metadata", "source", "source_reference",
  "confidence", "importance", "status", "version", "reinforce_count", "use_count", "flagged_at",
  "conflicts_with_id", "history", "created_by", "created_at", "updated_at", "last_used_at", "expires_at",
];
const select = (k: Knex) => [...COLUMNS, k.raw("(embedding IS NOT NULL) AS has_embedding")];
const parse = (institutionId: number) => (row: unknown) => MemoryRowSchema.parse({ ...(row as object), institution_id: institutionId });
const vectorLiteral = (v: number[]) => `[${v.join(",")}]`;
const vectorRaw = (k: Knex, v: number[] | null | undefined) => (v ? k.raw("?::vector", [vectorLiteral(v)]) : null);

/** Append one entry, dropping the oldest past the cap — a single expression, so it composes
 *  into whatever UPDATE is already happening instead of adding a second round-trip. */
const appendHistory = (k: Knex, entry: HistoryEntry) => k.raw(
  `(CASE WHEN jsonb_array_length(history) >= ${HISTORY_CAP} THEN history - 0 ELSE history END) || ?::jsonb`,
  [JSON.stringify([entry])],
);

// ── Write ────────────────────────────────────────────────────────────────────

export interface InsertMemory {
  institution_id: number;
  type: MemoryType;
  content: string;
  content_hash: string;
  metadata: Record<string, unknown>;
  source: MemorySource;
  source_reference: Record<string, unknown>;
  confidence: number;
  importance: number;
  status: MemoryStatus;
  embedding: number[] | null;
  history: HistoryEntry[];
  conflicts_with_id?: string | null;
  created_by?: number | null;
  expires_at?: Date | string | null;
}

/** Insert, or null when this institution already holds the statement. The dedupe index is
 *  partial, so the predicate is named for Postgres to infer it (staging-writer.ts does the same). */
export async function insert(data: InsertMemory): Promise<string | null> {
  const { institution_id, ...row } = data;
  const k = await db(institution_id);
  const rows: Array<{ id: string }> = await k(TABLE)
    .insert({
      ...row,
      metadata: JSON.stringify(row.metadata),
      source_reference: JSON.stringify(row.source_reference),
      history: JSON.stringify(row.history),
      embedding: vectorRaw(k, row.embedding),
    })
    .onConflict(k.raw("(content_hash) WHERE status <> 'deleted'"))
    .ignore()
    .returning("id");
  return rows[0]?.id ?? null;
}

export interface Transition {
  status?: MemoryStatus;
  confidence?: number;
  flagged_at?: Date | null;
  conflicts_with_id?: string | null;
  expires_at?: Date | null;
  bumpVersion?: boolean;
}

/** One UPDATE: change state and record why. */
export async function transition(id: string, institutionId: number, patch: Transition, entry: HistoryEntry): Promise<MemoryRow | undefined> {
  const k = await db(institutionId);
  const { bumpVersion, ...rest } = patch;
  const [row] = await k(TABLE)
    .where({ id })
    .update({
      ...rest,
      ...(bumpVersion ? { version: k.raw("version + 1") } : {}),
      history: appendHistory(k, entry),
      updated_at: k.fn.now(),
    })
    .returning(select(k));
  return row ? parse(institutionId)(row) : undefined;
}

/** Admin edit of content/metadata/importance/expiry. Version climbs; content changes re-embed. */
export async function edit(
  id: string,
  institutionId: number,
  patch: { content?: string; content_hash?: string; importance?: number; expires_at?: Date | null;
    metadata?: Record<string, unknown>; embedding?: number[] | null },
  entry: HistoryEntry,
): Promise<MemoryRow | undefined> {
  const k = await db(institutionId);
  const { metadata, embedding, ...rest } = patch;
  const [row] = await k(TABLE)
    .where({ id })
    .update({
      ...rest,
      ...(metadata ? { metadata: JSON.stringify(metadata) } : {}),
      ...(embedding !== undefined ? { embedding: vectorRaw(k, embedding) } : {}),
      version: k.raw("version + 1"),
      history: appendHistory(k, entry),
      updated_at: k.fn.now(),
    })
    .returning(select(k));
  return row ? parse(institutionId)(row) : undefined;
}

/**
 * One UPDATE: bump count and confidence, record the actor once. The jsonb `?` operator (spelled
 * \\? so knex leaves it alone) tests array membership, so a repeat actor leaves the actors list
 * untouched while the count still moves — a returning student is still evidence.
 */
export async function reinforce(id: string, institutionId: number, actorHash: string | null, entry: HistoryEntry): Promise<MemoryRow | undefined> {
  const k = await db(institutionId);
  const [row] = await k(TABLE)
    .where({ id })
    .update({
      reinforce_count: k.raw("reinforce_count + 1"),
      confidence: k.raw("LEAST(1, confidence + 0.1)"),
      history: appendHistory(k, entry),
      updated_at: k.fn.now(),
      ...(actorHash ? {
        source_reference: k.raw(
          `CASE WHEN COALESCE(source_reference->'actors', '[]'::jsonb) \\? ? THEN source_reference
                ELSE jsonb_set(source_reference, '{actors}', COALESCE(source_reference->'actors', '[]'::jsonb) || to_jsonb(?::text)) END`,
          [actorHash, actorHash],
        ),
      } : {}),
    })
    .returning(select(k));
  return row ? parse(institutionId)(row) : undefined;
}

/** candidate → active once enough DISTINCT students reinforced it. Conditional, so two workers
 *  promoting the same row at once cannot both win. A candidate that contradicts an existing
 *  memory never promotes this way — only a human can resolve a contradiction. */
export async function promoteIfReady(id: string, institutionId: number, minActors: number, entry: HistoryEntry): Promise<MemoryRow | undefined> {
  const k = await db(institutionId);
  const [row] = await k(TABLE)
    .where({ id, status: "candidate" })
    .whereNull("conflicts_with_id")
    .whereRaw("jsonb_array_length(COALESCE(source_reference->'actors', '[]'::jsonb)) >= ?", [minActors])
    .update({ status: "active", history: appendHistory(k, entry), updated_at: k.fn.now() })
    .returning(select(k));
  return row ? parse(institutionId)(row) : undefined;
}

/** One vote per actor per direction. Undefined when this actor already voted that way. */
export async function vote(id: string, institutionId: number, actorHash: string, direction: "positive" | "negative"): Promise<MemoryRow | undefined> {
  const k = await db(institutionId);
  const key = `${direction}_voters`;
  const [row] = await k(TABLE)
    .where({ id })
    .whereRaw(`NOT (COALESCE(source_reference->'${key}', '[]'::jsonb) \\? ?)`, [actorHash])
    .update({
      source_reference: k.raw(
        `jsonb_set(source_reference, '{${key}}', COALESCE(source_reference->'${key}', '[]'::jsonb) || to_jsonb(?::text))`,
        [actorHash],
      ),
      updated_at: k.fn.now(),
    })
    .returning(select(k));
  return row ? parse(institutionId)(row) : undefined;
}

export async function touchUsed(ids: string[], institutionId: number): Promise<void> {
  if (!ids.length) return;
  const k = await db(institutionId);
  await k(TABLE).whereIn("id", ids).update({ use_count: k.raw("use_count + 1"), last_used_at: k.fn.now() });
}

/** Sweep one institution: active rows past their expiry → deprecated. */
export async function expireDue(institutionId: number, entry: HistoryEntry): Promise<number> {
  const k = await dbOrNull(institutionId);
  if (!k) return 0;
  return k(TABLE)
    .where({ status: "active" }).whereNotNull("expires_at").where("expires_at", "<=", k.fn.now())
    .update({ status: "deprecated", history: appendHistory(k, entry), updated_at: k.fn.now() });
}

/** Sweep one institution: candidates nobody reinforced for `days` → deprecated. */
export async function deprecateStaleCandidates(institutionId: number, days: number, entry: HistoryEntry): Promise<number> {
  const k = await dbOrNull(institutionId);
  if (!k) return 0;
  return k(TABLE)
    .where({ status: "candidate" })
    .whereRaw("updated_at < now() - (? * INTERVAL '1 day')", [days])
    .update({ status: "deprecated", history: appendHistory(k, entry), updated_at: k.fn.now() });
}

/** Every institution that has a schema — the sweep walks these. */
export async function provisionedInstitutionIds(): Promise<number[]> {
  const rows = await masterKnex("institutions").whereNull("deleted_at").whereNotNull("schema_provisioned_at").pluck("id");
  return rows.map(Number);
}

// ── Read ─────────────────────────────────────────────────────────────────────

export async function findById(id: string, institutionId: number): Promise<MemoryRow | undefined> {
  const k = await dbOrNull(institutionId);
  if (!k) return undefined;
  const row = await k(TABLE).select(select(k)).where({ id }).first();
  return row ? parse(institutionId)(row) : undefined;
}

export async function findByIds(ids: string[], institutionId: number): Promise<MemoryRow[]> {
  const k = ids.length ? await dbOrNull(institutionId) : null;
  if (!k) return [];
  const rows = await k(TABLE).select(select(k)).whereIn("id", ids);
  return rows.map(parse(institutionId));
}

/** The live row holding this statement, if any (deleted rows do not count). */
export async function findByHash(institutionId: number, contentHash: string): Promise<MemoryRow | undefined> {
  const k = await dbOrNull(institutionId);
  if (!k) return undefined;
  const row = await k(TABLE).select(select(k)).where({ content_hash: contentHash }).whereNot({ status: "deleted" }).first();
  return row ? parse(institutionId)(row) : undefined;
}

export async function list(institutionId: number, query: MemoryQuery): Promise<MemoryRow[]> {
  const k = await dbOrNull(institutionId);
  if (!k) return [];
  const q = k(TABLE).select(select(k)).orderBy("updated_at", "desc").limit(query.limit);
  if (query.status) q.where({ status: query.status }); else q.whereNot({ status: "deleted" });
  if (query.type) q.where({ type: query.type });
  if (query.source) q.where({ source: query.source });
  if (query.flagged) q.whereNotNull("flagged_at");
  if (query.conflicting) q.whereNotNull("conflicts_with_id");
  if (query.q) q.whereILike("content", `%${query.q}%`);
  return (await q).map(parse(institutionId));
}

export interface MemoryMatch {
  id: string;
  type: MemoryType;
  content: string;
  metadata: Record<string, unknown>;
  source: MemorySource;
  confidence: number;
  importance: number;
  status: MemoryStatus;
  reinforce_count: number;
  use_count: number;
  similarity: number;
}

/** Semantic retrieval inside one institution's schema. */
export async function match(
  embedding: number[],
  institutionId: number,
  opts: { count?: number; types?: MemoryType[]; statuses?: MemoryStatus[] } = {},
): Promise<MemoryMatch[]> {
  const k = await dbOrNull(institutionId);
  if (!k) return [];
  const { rows } = await k.raw(
    `SELECT * FROM match_institution_ai_memories(?::vector, ?, ?, ?)`,
    [vectorLiteral(embedding), opts.count ?? 12, opts.types ?? null, opts.statuses ?? ["active"]],
  );
  return rows as MemoryMatch[];
}

/** Rules fetched by index, not similarity: every AVOIDANCE_RULE, every RESPONSE_PREFERENCE (style
 *  applies to every reply and has no similarity to any question), plus importance-5 guidelines. */
export async function pinned(institutionId: number): Promise<MemoryRow[]> {
  const k = await dbOrNull(institutionId);
  if (!k) return [];
  const rows = await k(TABLE).select(select(k))
    .where({ status: "active" })
    .where((b) => b.whereIn("type", ["AVOIDANCE_RULE", "RESPONSE_PREFERENCE"]).orWhere({ type: "COUNSELLING_GUIDELINE", importance: 5 }))
    .where((b) => b.whereNull("expires_at").orWhere("expires_at", ">", k.fn.now()))
    .orderBy([{ column: "importance", order: "desc" }, { column: "created_at", order: "asc" }]);
  return rows.map(parse(institutionId));
}

/** Active, retrievable memories. Zero lets retrieval skip the embedding call. */
export async function activeEmbeddedCount(institutionId: number): Promise<number> {
  const k = await dbOrNull(institutionId);
  if (!k) return 0;
  const row = await k(TABLE).where({ status: "active" }).whereNotNull("embedding").count("* as c").first();
  return Number(row?.c ?? 0);
}
