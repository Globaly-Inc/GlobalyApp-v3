// CLI tool — applies business migrations to ALL active business schemas.
// Run with: npm run migrate:tenants

import { masterKnex } from "../core/db/master-pool.js";
import { createSchemaKnex, schemaName } from "../core/db/knex.js";

async function migrateAllBusinesses() {
  const businesses = await masterKnex("businesses")
    .select("id", "subdomain", "schema_name")
    .where("account_status", 1);

  const results: Array<{ business: string; applied?: string[]; error?: string }> = [];

  for (const b of businesses) {
    const schema = schemaName(b.schema_name);
    const tenantDb = createSchemaKnex(schema, { min: 0, max: 1 });

    try {
      const [, applied] = await tenantDb.migrate.latest({
        directory: "./database/migrations/business",
        schemaName: schema,
      });
      results.push({ business: b.subdomain, applied });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ business: b.subdomain, error: message });
    } finally {
      await tenantDb.destroy();
    }
  }

  console.table(results);
  await masterKnex.destroy();
}

migrateAllBusinesses();
