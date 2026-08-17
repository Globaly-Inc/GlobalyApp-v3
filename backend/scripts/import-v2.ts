/**
 * Import the V2 extraction pipeline + AI knowledge data into V3.
 *
 *   npm run import:v2 -- --source "postgres://user:pass@host:5432/globaly_v2_import" [flags]
 *
 * Flags:
 *   --dry-run          Report what would move, write nothing. Always run this first.
 *   --only a,b         Restrict to table groups: jobs, staged, junctions, ops, knowledge
 *   --tables a,b       Restrict to specific table names
 *   --batch 500        Rows per insert (default 500)
 *   --admin-id 1       Owner id substituted for V2's auth.users uuids (default 1)
 *   --source-schema s  Schema the dump restored into (default public)
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
 * auth.users reference) and V3 expects an integer, the value becomes --admin-id.
 * No column allow-list to keep in sync.
 */

import "dotenv/config";
import knex, { type Knex } from "knex";
import { masterKnex } from "../src/core/db/master-pool.js";

const SCHEMA = "superadmin";

/** Parent-before-child. Junctions last: they reference two parents. */
const GROUPS: Record<string, string[]> = {
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
 * Columns that hold a foreign key to a table whose PK changed from uuid (V2) to
 * serial integer (V3). Instead of substituting --admin-id these need a real
 * uuid→int lookup via slug. Built once in main() from both databases.
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
    console.log(`  ${col}: ${maps[col].size} uuid→int mappings (${v2Rows.length} V2 rows, ${v3Rows.length} V3 rows)`);
  }
  return maps;
}

interface Args {
  source: string;
  dryRun: boolean;
  only: string[] | null;
  tables: string[] | null;
  batch: number;
  adminId: number;
  sourceSchema: string;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  const source = get("--source") ?? process.env.V2_DATABASE_URL;
  if (!source) {
    console.error("Missing --source (or V2_DATABASE_URL). Point it at the restored V2 dump.");
    process.exit(1);
  }
  const csv = (v: string | undefined) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : null);
  return {
    source,
    dryRun: argv.includes("--dry-run"),
    only: csv(get("--only")),
    tables: csv(get("--tables")),
    batch: Number(get("--batch") ?? 500),
    adminId: Number(get("--admin-id") ?? 1),
    sourceSchema: get("--source-schema") ?? "public",
  };
}

type ColumnInfo = { name: string; type: string };

async function columnsOf(db: Knex, schema: string, table: string): Promise<ColumnInfo[]> {
  const rows = await db("information_schema.columns")
    .where({ table_schema: schema, table_name: table })
    .select("column_name", "data_type")
    .orderBy("ordinal_position");
  return rows.map((r: { column_name: string; data_type: string }) => ({ name: r.column_name, type: r.data_type }));
}

/** V2 dumps restore into `public`; --source-schema overrides, then we probe. */
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

async function planFor(src: Knex, table: string, preferredSchema: string): Promise<Plan | null> {
  const sourceSchema = await sourceSchemaFor(src, table, preferredSchema);
  if (!sourceSchema) return null;

  const [srcCols, dstCols] = await Promise.all([
    columnsOf(src, sourceSchema, table),
    columnsOf(masterKnex, SCHEMA, table),
  ]);
  if (!dstCols.length) return null;

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
    hasId: dstByName.has("id") && srcCols.some((c) => c.name === "id"),
  };
}

async function importTable(src: Knex, plan: Plan, args: Args, catMaps: CategoryMaps): Promise<{ read: number; written: number }> {
  const names = plan.copy.map((c) => c.name);
  const rows: Record<string, unknown>[] = await src
    .withSchema(plan.sourceSchema)
    .from(plan.table)
    .select(names);

  if (args.dryRun || rows.length === 0) return { read: rows.length, written: 0 };

  let written = 0;
  for (let i = 0; i < rows.length; i += args.batch) {
    const chunk = rows.slice(i, i + args.batch).map((row) => {
      const out = { ...row };
      for (const col of plan.ownerColumns) out[col] = out[col] == null ? null : args.adminId;
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
    const result = plan.hasId
      ? await query.onConflict("id").merge()
      : await query.onConflict().ignore();
    written += chunk.length;
    void result;
  }
  return { read: rows.length, written };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let tables = args.tables ?? Object.entries(GROUPS)
    .filter(([group]) => !args.only || args.only.includes(group))
    .flatMap(([, list]) => list);
  tables = [...new Set(tables)];

  const src = knex({ client: "pg", connection: args.source, pool: { min: 0, max: 4 } });

  console.log(`\nV2 → V3 import${args.dryRun ? "  [DRY RUN — nothing will be written]" : ""}`);
  console.log(`  owner uuids → admin id ${args.adminId}`);

  const catMaps = await buildCategoryMaps(src, args.sourceSchema);

  console.log(`  ${tables.length} tables\n`);
  console.log(`  ${"table".padEnd(46)}${"rows".padStart(8)}${"written".padStart(9)}  notes`);
  console.log(`  ${"-".repeat(46)}${"-".padStart(8, "-")}${"-".padStart(9, "-")}  ${"-".repeat(20)}`);

  let totalRead = 0;
  let totalWritten = 0;
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const table of tables) {
    const plan = await planFor(src, table, args.sourceSchema);
    if (!plan) { missing.push(table); console.log(`  ${table.padEnd(46)}${"—".padStart(8)}${"—".padStart(9)}  not in source`); continue; }

    try {
      const { read, written } = await importTable(src, plan, args, catMaps);
      totalRead += read;
      totalWritten += written;
      const notes: string[] = [];
      if (plan.ownerColumns.length) notes.push(`owner→${args.adminId}: ${plan.ownerColumns.join(",")}`);
      if (plan.categoryColumns.length) notes.push(`cat→slug: ${plan.categoryColumns.join(",")}`);
      if (plan.droppedFromSource.length) notes.push(`dropped: ${plan.droppedFromSource.join(", ")}`);
      console.log(`  ${table.padEnd(46)}${String(read).padStart(8)}${String(written).padStart(9)}  ${notes.join(" | ")}`);
      if (plan.droppedFromSource.length) warnings.push(`${table}: dropped ${plan.droppedFromSource.join(", ")}`);
    } catch (e) {
      console.log(`  ${table.padEnd(46)}${"ERR".padStart(8)}${"—".padStart(9)}  ${(e as Error).message.slice(0, 90)}`);
      warnings.push(`${table}: FAILED — ${(e as Error).message.slice(0, 200)}`);
    }
  }

  console.log(`\n  read ${totalRead}, written ${totalWritten}`);
  if (missing.length) console.log(`\n  not present in source (${missing.length}): ${missing.join(", ")}`);
  if (warnings.length) {
    console.log("\n  warnings:");
    warnings.forEach((w) => console.log(`    - ${w}`));
  }
  if (args.dryRun) console.log("\n  DRY RUN — re-run without --dry-run to write.");

  await src.destroy();
  await masterKnex.destroy();
}

main().catch(async (e) => {
  console.error("Import failed:", e);
  await masterKnex.destroy().catch(() => {});
  process.exit(1);
});
