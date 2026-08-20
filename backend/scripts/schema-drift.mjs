/**
 * Finds every place the live dev DB has fallen behind the migration files.
 *
 * Why not parse the migrations: they contain conditional ALTERs, raw SQL and
 * in-place edits, so reading them with a regex is guesswork. Instead this builds a
 * throwaway database, runs the real migrations into it, and diffs
 * information_schema against the live one. Whatever the migrations actually
 * produce is the reference, by construction.
 *
 * Read-only against the live DB unless run with --apply, which emits and executes
 * ADD COLUMN statements for the missing columns only. It never drops or retypes
 * anything — those need a human.
 *
 * Usage:  node --import tsx schema-drift.mjs [--apply]
 */
import knexFactory from "knex";
import "dotenv/config";

const APPLY = process.argv.includes("--apply");
const SCRATCH_DB = "globalyapp_drift_check";

const conn = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
};
const LIVE_DB = process.env.DB_NAME;

const SETS = [
  { name: "globalyapp", dir: "./database/migrations/globalyapp", table: "knex_migrations_globalyapp", schema: "public" },
  // needsExtensions: superadmin/20260811_001 uses vector(3072). Creating that
  // extension requires superuser, which master_user is not, so this set can only be
  // checked when the scratch DB already has it (see --help note on the template DB).
  { name: "superadmin", dir: "./database/migrations/superadmin", table: "knex_migrations", schema: "superadmin", needsExtensions: true },
];

const admin = knexFactory({ client: "pg", connection: { ...conn, database: "postgres" }, pool: { min: 0, max: 2 } });
let ref = null;
let live = null;
const skipped = [];

async function columnMap(db, schema) {
  // pg_catalog, not information_schema: the latter reports an array column's
  // data_type as the literal "ARRAY", which is not valid DDL — emitting it produced
  // `ADD COLUMN highlights ARRAY`, which Postgres rejects. format_type() gives the
  // real spelling ("text[]", "timestamp with time zone", "numeric(10,3)").
  const { rows } = await db.raw(
    `select c.relname                                as table_name,
            a.attname                                as column_name,
            format_type(a.atttypid, a.atttypmod)     as data_type,
            pg_get_expr(d.adbin, d.adrelid)          as column_default
       from pg_attribute a
       join pg_class     c on c.oid = a.attrelid
       join pg_namespace n on n.oid = c.relnamespace
       left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where n.nspname = ?
        and c.relkind = 'r'
        and a.attnum > 0
        and not a.attisdropped
        and c.relname not like 'knex_migrations%'
      order by c.relname, a.attname`,
    [schema],
  );
  const byTable = new Map();
  for (const r of rows) {
    if (!byTable.has(r.table_name)) byTable.set(r.table_name, new Map());
    byTable.get(r.table_name).set(r.column_name, r);
  }
  return byTable;
}

function ddlFor(table, col, schema) {
  // data_type already comes from format_type(), so it is valid DDL verbatim.
  const type = col.data_type;
  const dflt = col.column_default ? ` DEFAULT ${col.column_default}` : "";
  // Deliberately always nullable: back-filling a NOT NULL on an existing table
  // needs a value strategy a script cannot invent.
  return `ALTER TABLE "${schema}"."${table}" ADD COLUMN IF NOT EXISTS "${col.column_name}" ${type}${dflt};`;
}

try {
  console.log(`Rebuilding reference schema in ${SCRATCH_DB} …`);
  const template = process.env.TEMPLATE_DB;
  await admin.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DB}`);
  // A template that already carries the extensions lets a non-superuser build a
  // complete reference schema, since CREATE DATABASE ... TEMPLATE copies them.
  try {
    await admin.raw(template ? `CREATE DATABASE ${SCRATCH_DB} TEMPLATE ${template}` : `CREATE DATABASE ${SCRATCH_DB}`);
  } catch (err) {
    // Postgres only lets you copy a template you OWN (or if you are superuser).
    // A template created by `sudo -u postgres` belongs to postgres, so the app role
    // is refused — the fix is a one-off ownership transfer, not more privileges.
    if (template && String(err.message).includes("permission denied to copy database")) {
      console.error(`\n✗ ${conn.user} cannot copy the template — Postgres requires you to own it.`);
      console.error(`  Hand it over once:`);
      console.error(`    sudo -u postgres psql -c 'ALTER DATABASE ${template} OWNER TO ${conn.user}'`);
    }
    throw err;
  }
  if (template) console.log(`  (from template ${template})`);

  ref = knexFactory({ client: "pg", connection: { ...conn, database: SCRATCH_DB }, pool: { min: 0, max: 4 } });

  // Mirror the manual setup SETUP.md §"Create the database, schema, and extensions"
  // requires BEFORE migrations run. Best-effort: enabling an extension needs
  // superuser, so failing here only rules out the sets that depend on it — the rest
  // are still worth checking, and are usually the ones you care about.
  await ref.raw("CREATE SCHEMA IF NOT EXISTS superadmin");
  let haveExtensions = true;
  for (const ext of ["vector", "pg_trgm"]) {
    try {
      await ref.raw(`CREATE EXTENSION IF NOT EXISTS ${ext}`);
    } catch (err) {
      haveExtensions = false;
      console.log(`  note: cannot create the "${ext}" extension (${String(err.message).split("\n")[0].trim()})`);
    }
  }

  const checkable = SETS.filter((set) => {
    if (set.needsExtensions && !haveExtensions) {
      skipped.push(set);
      return false;
    }
    return true;
  });

  for (const set of checkable) {
    const cfg = { directory: set.dir, tableName: set.table, extension: "ts" };
    if (set.schema !== "public") cfg.schemaName = set.schema;
    try {
      const [, applied] = await ref.migrate.latest(cfg);
      console.log(`  ${set.name}: ${applied.length} migration(s) applied`);
    } catch (err) {
      console.error(`\n✗ The ${set.name} migrations cannot run on a fresh database.`);
      console.error(`  ${String(err.message).trim().split("\n").slice(0, 3).join("\n  ")}`);
      console.error(`\n  This is a real finding: it means a new environment cannot bootstrap.`);
      console.error(`  Drift for ${set.name} cannot be computed until it is fixed.`);
      throw err;
    }
  }

  live = knexFactory({ client: "pg", connection: { ...conn, database: LIVE_DB }, pool: { min: 0, max: 4 } });
  const statements = [];
  let missingTables = 0;

  for (const set of checkable) {
    const refCols = await columnMap(ref, set.schema);
    const liveCols = await columnMap(live, set.schema);
    console.log(`\n═══ ${set.schema} ═══`);
    let clean = true;

    for (const [table, cols] of refCols) {
      if (!liveCols.has(table)) {
        console.log(`  ✗ TABLE MISSING: ${table}`);
        missingTables++;
        clean = false;
        continue;
      }
      const have = liveCols.get(table);
      const missing = [...cols.keys()].filter((c) => !have.has(c));
      const extra = [...have.keys()].filter((c) => !cols.has(c));
      if (missing.length) {
        console.log(`  ✗ ${table}: missing ${missing.join(", ")}`);
        for (const c of missing) statements.push(ddlFor(table, cols.get(c), set.schema));
        clean = false;
      }
      if (extra.length) {
        console.log(`  ! ${table}: live has extra ${extra.join(", ")} (not in migrations — left alone)`);
        clean = false;
      }
    }
    if (clean) console.log("  ✓ no drift");
  }

  if (statements.length) {
    console.log(`\n── ${statements.length} ADD COLUMN statement(s) ──`);
    for (const s of statements) console.log(`  ${s}`);
    if (APPLY && missingTables > 0) {
      console.log(`\n✗ REFUSING TO APPLY: ${missingTables} table(s) are missing entirely.`);
      console.log(`  Those are PENDING MIGRATIONS, not drift — run them first:`);
      console.log(`    npm run migrate:globalyapp`);
      console.log(`  Adding columns now would leave the DB half-built and could make the`);
      console.log(`  pending migrations fail on tables that already exist. Re-run after.`);
    } else if (APPLY) {
      for (const s of statements) await live.raw(s);
      console.log(`\n✓ applied ${statements.length} statement(s) to ${LIVE_DB}`);
    } else {
      console.log("\n(dry run — re-run with --apply to execute)");
    }
  } else {
    console.log("\nNo missing columns.");
  }
  if (missingTables) console.log(`\n⚠ ${missingTables} table(s) missing entirely — needs a real migration run, not ALTERs.`);

  if (skipped.length) {
    console.log(`\n⚠ NOT CHECKED: ${skipped.map((s) => s.schema).join(", ")} — the pgvector extension`);
    console.log(`  cannot be created without superuser, so its reference schema cannot be built.`);
    console.log(`  To include it, have a superuser create a template once:`);
    console.log(`    CREATE DATABASE ${SCRATCH_DB}_template;`);
    console.log(`    \\c ${SCRATCH_DB}_template`);
    console.log(`    CREATE EXTENSION vector; CREATE EXTENSION pg_trgm;`);
    console.log(`  then re-run with TEMPLATE_DB=${SCRATCH_DB}_template`);
  }

} finally {
  // Always tear the scratch DB down, including after a crash — otherwise the next
  // run trips over a half-migrated leftover.
  if (ref) await ref.destroy();
  if (live) await live.destroy();
  try {
    await admin.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DB}`);
  } catch (err) {
    console.error(`  (could not drop ${SCRATCH_DB}: ${err.message})`);
  }
  await admin.destroy();
}
