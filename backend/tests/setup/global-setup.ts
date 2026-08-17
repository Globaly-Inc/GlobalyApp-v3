// Runs once before the integration project. Applies migrations to the test DB.
// If the DB is unreachable this is a no-op — the per-worker setup skips the suite.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  DB_UNREACHABLE_WARNING,
  probeTestDatabase,
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

export default async function setup() {
  if (!(await probeTestDatabase())) {
    console.warn(DB_UNREACHABLE_WARNING);
    return;
  }

  const env = { ...process.env, ...testEnv() };
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
