// Runs once before the integration project. Applies migrations to the test DB.
// If the DB is unreachable this is a no-op — the per-worker setup skips the suite.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import {
  DB_UNREACHABLE_WARNING,
  probeTestDatabase,
  testDatabaseUrl,
  testEnv,
} from "./db-url.js";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function knexCli(env: NodeJS.ProcessEnv, knexEnv: string, ...args: string[]) {
  execFileSync(
    process.execPath,
    ["--import", "tsx", "node_modules/.bin/knex", ...args, "--knexfile", "knexfile.ts", "--env", knexEnv],
    { cwd: backendRoot, env, stdio: "pipe" },
  );
}

/**
 * Drop tenant schemas left behind by earlier runs.
 *
 * Tenant provisioning creates a schema named by the org's raw UUID, and nothing in
 * the suite drops it — so every run that provisions a business leaves one behind for
 * ever. They had accumulated to 588, which put 57,900 text-ish columns in front of
 * anything that scans schemas: w6-storage-rewrite's buildInventory went from 2s to a
 * 30s timeout, and read as a code failure on a file no branch had touched.
 *
 * Matching on the UUID shape is deliberately narrow: `public`, `superadmin`, `mig`
 * and `v1_staging` can never match it, so this cannot delete real data even if the
 * test URL is ever pointed somewhere it should not be. Runs before migrations so a
 * dropped schema is never one the current run is using.
 */
const UUID_SCHEMA = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

async function dropOrphanedTenantSchemas() {
  const client = new pg.Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    const { rows } = await client.query<{ schema_name: string }>(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name ~ $1`,
      [UUID_SCHEMA],
    );
    for (const { schema_name } of rows) {
      await client.query(`DROP SCHEMA IF EXISTS "${schema_name}" CASCADE`);
    }
    if (rows.length) console.warn(`[integration] dropped ${rows.length} orphaned tenant schema(s)`);
  } finally {
    await client.end().catch(() => {});
  }
}

export default async function setup() {
  if (!(await probeTestDatabase())) {
    console.warn(DB_UNREACHABLE_WARNING);
    return;
  }

  const env = { ...process.env, ...testEnv() };
  await dropOrphanedTenantSchemas();
  try {
    knexCli(env, "globalyapp", "migrate:latest");
    knexCli(env, "superadmin", "migrate:latest");
    // Reference data the onboarding/business flows depend on (idempotent seeder).
    knexCli(env, "globalyapp", "seed:run", "--specific=01_countries_seeder.ts");
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to prepare the test database: ${detail}`, { cause: err });
  }
}
