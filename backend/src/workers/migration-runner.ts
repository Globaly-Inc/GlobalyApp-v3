// CLI tool — applies business migrations to ALL active business databases.
// Run with: npm run migrate:tenants
// For now business DBs are empty — all tables live in globalyapp.

import knex from "knex";
import { masterKnex } from "../core/db/master-pool.js";
import { config } from "../config.js";

async function migrateAllBusinesses() {
  const businesses = await masterKnex("businesses")
    .select("id", "subdomain", "db_name")
    .where("account_status", 1);

  const results: Array<{ business: string; applied?: string[]; error?: string }> = [];

  // ponytail: add concurrency limit (p-limit) when business count > 50
  for (const b of businesses) {
    const businessDb = knex({
      client: "pg",
      connection: `postgresql://api:${config.DB_PASSWORD}@${config.DB_HOST}:${config.DB_PORT}/${b.db_name}`,
      pool: { min: 0, max: 1 },
    });

    try {
      const [, applied] = await businessDb.migrate.latest({
        directory: "./database/migrations/business",
      });
      results.push({ business: b.subdomain, applied });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ business: b.subdomain, error: message });
    } finally {
      await businessDb.destroy();
    }
  }

  console.table(results);
  await masterKnex.destroy();
}

migrateAllBusinesses();
