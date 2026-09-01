/**
 * V2 → V3 import core — shared by the CLI (scripts/import-v2.ts) and the
 * LavinMQ worker (workers/import-v2.worker.ts).
 *
 * Design notes
 * ------------
 * Rerunnable by construction: every row keeps its V2 uuid primary key and is written
 * with ON CONFLICT (id) DO UPDATE, so a second run reconciles instead of duplicating.
 * Interrupted halfway is safe — just run it again.
 *
 * Columns are resolved by introspecting BOTH databases rather than hardcoding 34
 * table maps. V3's extraction schema is a parity port of V2, so the intersection is
 * nearly total, and anything V2 has that V3 dropped is reported rather than silently
 * lost.
 *
 * Owner remapping falls out of the type comparison: where V2 stores a uuid (an
 * auth.users reference) and V3 expects an integer, the value becomes adminId.
 * No column allow-list to keep in sync.
 */

import knex, { type Knex } from "knex";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { createChildLogger } from "../../../../shared/logger.js";

const logger = createChildLogger("import-v2");

const SCHEMA = "superadmin";

/** Parent-before-child. Junctions last: they reference two parents. */
export const GROUPS: Record<string, string[]> = {
  // Reference data first: extraction rows FK into fee_types/degree_levels/accreditations.
  reference: ["fee_types", "degree_levels", "accreditations", "blog_posts", "blog_keywords"],
  jobs: ["extraction_jobs", "extraction_institution_overview"],
  staged: [
    "extraction_campuses",
    "extraction_agents",
    "extraction_agent_locations",
    "extraction_courses",
    "extraction_course_fees",
    "extraction_intakes",
    "extraction_eligibility_requirements",
    "extraction_english_requirements",
    "extraction_study_options",
    "extraction_study_units",
    "extraction_accreditations",
    "extraction_additional_info",
  ],
  junctions: [
    "extraction_course_campuses",
    "extraction_course_fee_assignments",
    "extraction_course_intake_assignments",
    "extraction_course_eligibility_assignments",
    "extraction_course_study_option_assignments",
    "extraction_course_study_unit_assignments",
    "extraction_course_accreditation_assignments",
  ],
  ops: [
    "extraction_queue",
    "extraction_job_events",
    "extraction_verification_results",
    "extraction_site_intelligence",
    "extraction_site_profiles",
    "extraction_lessons",
    "extraction_memory",
    "extraction_visas",
    "extraction_mara_agents",
    "agent_extraction_runs",
    "agent_extraction_schedule",
  ],
  knowledge: [
    "ai_knowledge_visa",
    "ai_knowledge_faqs",
    "ai_knowledge_country_guides",
    "ai_knowledge_categories",
    "ai_knowledge_sources",
    "ai_knowledge_documents",
    "data_verification_queue",
  ],
};

/**
 * V2 embeds with OpenAI (1536 dims), V3 with Gemini gemini-embedding-001 (3072).
 * The vectors are not convertible, so they are left NULL and re-embedded in V3.
 */
const NEVER_COPY = new Set(["embedding"]);

const INT_TYPES = new Set(["integer", "bigint", "smallint"]);

/**
 * Tables whose PK changed uuid (V2) → serial (V3): the V2 id is dropped and rows
 * reconcile on a natural unique key instead, keeping the import rerunnable.
 */
const CONFLICT_KEYS: Record<string, string> = { blog_posts: "slug", blog_keywords: "keyword" };

/**
 * Columns that hold a foreign key to a table whose PK changed from uuid (V2) to
 * serial integer (V3). Instead of substituting adminId these need a real
 * uuid→int lookup via slug. Built once per run from both databases.
 */
const CATEGORY_COLUMNS = new Set(["business_category_id", "service_category_id"]);
type CategoryMaps = {
  business_category_id: Map<string, number>; // V2 uuid → V3 int
  service_category_id: Map<string, number>;
};

async function buildCategoryMaps(src: Knex, sourceSchema: string): Promise<CategoryMaps> {
  const maps: CategoryMaps = {
    business_category_id: new Map(),
    service_category_id: new Map(),
  };

  // V2: uuid→slug
  for (const [col, table] of [
    ["business_category_id", "business_categories"],
    ["service_category_id", "service_categories"],
  ] as const) {
    const v2Rows: { id: string; slug: string }[] = await src
      .withSchema(sourceSchema)
      .from(table)
      .select("id", "slug")
      .catch(() => []); // table might not exist in source
    // V3: slug→int (lives in globalyapp/public, not superadmin)
    const v3Rows: { id: number; slug: string }[] = await masterKnex(table)
      .select("id", "slug")
      .catch(() => []);

    const slugToInt = new Map(v3Rows.map((r) => [r.slug, r.id]));
    for (const row of v2Rows) {
      const v3Id = slugToInt.get(row.slug);
      if (v3Id != null) maps[col].set(row.id, v3Id);
    }
    logger.info(`${col}: ${maps[col].size} uuid→int mappings (${v2Rows.length} V2 rows, ${v3Rows.length} V3 rows)`);
  }
  return maps;
}

export interface ImportOptions {
  source: string;
  dryRun?: boolean;
  only?: string[] | null;
  tables?: string[] | null;
  batch?: number;
  adminId?: number;
  sourceSchema?: string;
}

export interface ImportResult {
  totalRead: number;
  totalWritten: number;
  perTable: Array<{ table: string; read?: number; written?: number; notes: string }>;
  missing: string[];
  warnings: string[];
}

type ColumnInfo = { name: string; type: string };

async function columnsOf(db: Knex, schema: string, table: string): Promise<ColumnInfo[]> {
  const rows = await db("information_schema.columns")
    .where({ table_schema: schema, table_name: table })
    .select("column_name", "data_type")
    .orderBy("ordinal_position");
  return rows.map((r: { column_name: string; data_type: string }) => ({ name: r.column_name, type: r.data_type }));
}

/** V2 dumps restore into `public`; sourceSchema overrides, then we probe. */
async function sourceSchemaFor(src: Knex, table: string, preferred: string): Promise<string | null> {
  for (const schema of [...new Set([preferred, "public", SCHEMA])]) {
    const [row] = await src("information_schema.tables").where({ table_schema: schema, table_name: table }).count("* as c");
    if (Number(row.c) > 0) return schema;
  }
  return null;
}

interface Plan {
  table: string;
  sourceSchema: string;
  copy: ColumnInfo[];
  ownerColumns: string[];
  /** uuid→integer FK columns that need the slug-based category lookup instead of admin-id. */
  categoryColumns: string[];
  /** Columns needing JSON.stringify before insert (text→jsonb or jsonb re-serialization). */
  jsonWrapColumns: string[];
  droppedFromSource: string[];
  hasId: boolean;
}

async function planFor(src: Knex, table: string, preferredSchema: string): Promise<Plan | "missing-in-v3" | null> {
  const sourceSchema = await sourceSchemaFor(src, table, preferredSchema);
  if (!sourceSchema) return null;

  const [srcCols, dstCols] = await Promise.all([
    columnsOf(src, sourceSchema, table),
    columnsOf(masterKnex, SCHEMA, table),
  ]);
  if (!dstCols.length) return "missing-in-v3";

  const dstByName = new Map(dstCols.map((c) => [c.name, c]));
  const copy: ColumnInfo[] = [];
  const ownerColumns: string[] = [];
  const categoryColumns: string[] = [];
  const jsonWrapColumns: string[] = [];
  const droppedFromSource: string[] = [];

  for (const col of srcCols) {
    if (NEVER_COPY.has(col.name)) { droppedFromSource.push(`${col.name} (vector dims differ)`); continue; }
    const dst = dstByName.get(col.name);
    if (!dst) { droppedFromSource.push(col.name); continue; }
    // uuid PK → serial PK: let V3 assign ids; CONFLICT_KEYS keeps reruns idempotent.
    if (col.name === "id" && col.type === "uuid" && INT_TYPES.has(dst.type)) {
      droppedFromSource.push("id (uuid→serial)");
      continue;
    }
    if (col.type === "uuid" && INT_TYPES.has(dst.type)) {
      // Category FKs need slug-based lookup; all other uuid→int columns are owner refs.
      if (CATEGORY_COLUMNS.has(col.name)) categoryColumns.push(col.name);
      else ownerColumns.push(col.name);
    }
    // jsonb columns need explicit JSON.stringify: text→jsonb wraps plain text,
    // and jsonb→jsonb needs re-serialization since knex doesn't auto-serialize objects for inserts.
    if (dst.type === "jsonb") jsonWrapColumns.push(col.name);
    copy.push(dst);
  }

  return {
    table,
    sourceSchema,
    copy,
    ownerColumns,
    categoryColumns,
    jsonWrapColumns,
    droppedFromSource,
    hasId: copy.some((c) => c.name === "id"),
  };
}

async function importTable(
  src: Knex,
  plan: Plan,
  opts: Required<Pick<ImportOptions, "dryRun" | "batch" | "adminId">>,
  catMaps: CategoryMaps,
): Promise<{ read: number; written: number }> {
  const names = plan.copy.map((c) => c.name);
  let rows: Record<string, unknown>[] = await src
    .withSchema(plan.sourceSchema)
    .from(plan.table)
    .select(names);

  if (opts.dryRun || rows.length === 0) return { read: rows.length, written: 0 };

  const read = rows.length;
  // extraction_queue's real identity is (job_id, url) — unique since migration
  // 20260901_001. V2 data can carry duplicate queue rows for one URL (the old discovery
  // step re-queued on every re-run), which would abort the whole chunk with a unique
  // violation the id conflict target can't absorb. Collapse them here with the same
  // preference as the migration's dedupe: completed first, then most recently touched.
  if (plan.table === "extraction_queue") {
    const rank = (r: Record<string, unknown>) => (r.status === "completed" ? 2 : r.status === "processing" ? 1 : 0);
    const ts = (r: Record<string, unknown>) => new Date((r.updated_at ?? r.created_at ?? 0) as string | Date).getTime();
    const best = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      const key = `${row.job_id} ${row.url}`;
      const prev = best.get(key);
      if (!prev || rank(row) > rank(prev) || (rank(row) === rank(prev) && ts(row) > ts(prev))) best.set(key, row);
    }
    rows = [...best.values()];
  }

  let written = 0;
  for (let i = 0; i < rows.length; i += opts.batch) {
    const chunk = rows.slice(i, i + opts.batch).map((row) => {
      const out = { ...row };
      for (const col of plan.ownerColumns) out[col] = out[col] == null ? null : opts.adminId;
      for (const col of plan.categoryColumns) {
        const uuid = out[col] as string | null;
        const map = catMaps[col as keyof CategoryMaps];
        out[col] = uuid == null ? null : (map.get(uuid) ?? null);
      }
      for (const col of plan.jsonWrapColumns) out[col] = out[col] == null ? null : JSON.stringify(out[col]);
      return out;
    });

    const query = masterKnex(`${SCHEMA}.${plan.table}`).insert(chunk);
    // Rerunnable: re-importing reconciles rows rather than duplicating or failing.
    // extraction_queue targets its (job_id, url) identity and ignores instead of
    // merging: a rerun in V3 may have re-created a URL's row under a fresh id, and an
    // id-merge would rewrite that pkey out from under the queue message holding it.
    if (plan.table === "extraction_queue") {
      await query.onConflict(["job_id", "url"]).ignore();
      written += chunk.length;
      continue;
    }
    const conflictKey = plan.hasId ? "id" : CONFLICT_KEYS[plan.table];
    const result = conflictKey
      ? await query.onConflict(conflictKey).merge()
      : await query.onConflict().ignore();
    written += chunk.length;
    void result;
  }
  return { read, written };
}

/** Run the full import. Does NOT destroy masterKnex — callers own its lifecycle. */
export async function runImport(options: ImportOptions): Promise<ImportResult> {
  const opts = {
    dryRun: options.dryRun ?? false,
    only: options.only ?? null,
    tables: options.tables ?? null,
    batch: options.batch ?? 500,
    adminId: options.adminId ?? 1,
    sourceSchema: options.sourceSchema ?? "public",
  };

  let tables = opts.tables ?? Object.entries(GROUPS)
    .filter(([group]) => !opts.only || opts.only.includes(group))
    .flatMap(([, list]) => list);
  tables = [...new Set(tables)];

  const src = knex({ client: "pg", connection: options.source, pool: { min: 0, max: 4 } });

  const result: ImportResult = { totalRead: 0, totalWritten: 0, perTable: [], missing: [], warnings: [] };

  try {
    logger.info(`V2 → V3 import starting${opts.dryRun ? " [DRY RUN]" : ""}`, { tables: tables.length, adminId: opts.adminId });

    const catMaps = await buildCategoryMaps(src, opts.sourceSchema);

    for (const table of tables) {
      const plan = await planFor(src, table, opts.sourceSchema);
      if (!plan) {
        result.missing.push(table);
        result.perTable.push({ table, notes: "not in source" });
        continue;
      }
      if (plan === "missing-in-v3") {
        result.warnings.push(`${table}: missing in V3 superadmin schema — run \`npm run migrate:superadmin\``);
        result.perTable.push({ table, notes: "MISSING IN V3 (migrate:superadmin?)" });
        continue;
      }

      try {
        const { read, written } = await importTable(src, plan, opts, catMaps);
        result.totalRead += read;
        result.totalWritten += written;
        const notes: string[] = [];
        if (plan.ownerColumns.length) notes.push(`owner→${opts.adminId}: ${plan.ownerColumns.join(",")}`);
        if (plan.categoryColumns.length) notes.push(`cat→slug: ${plan.categoryColumns.join(",")}`);
        if (plan.droppedFromSource.length) {
          notes.push(`dropped: ${plan.droppedFromSource.join(", ")}`);
          result.warnings.push(`${table}: dropped ${plan.droppedFromSource.join(", ")}`);
        }
        result.perTable.push({ table, read, written, notes: notes.join(" | ") });
        logger.info(`imported ${table}`, { read, written, notes: notes.join(" | ") });
      } catch (e) {
        const msg = (e as Error).message;
        result.perTable.push({ table, notes: `FAILED — ${msg.slice(0, 90)}` });
        result.warnings.push(`${table}: FAILED — ${msg.slice(0, 200)}`);
        logger.error(`import failed for ${table}`, { error: msg.slice(0, 200) });
      }
    }

    logger.info("V2 → V3 import complete", {
      read: result.totalRead,
      written: result.totalWritten,
      missing: result.missing.length,
      warnings: result.warnings.length,
    });
    return result;
  } finally {
    await src.destroy();
  }
}
