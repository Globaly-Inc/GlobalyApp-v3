// CLI tool — runs migrations then seeds for ALL active business and institution schemas.
// Run with: npm run seed:tenants

import { masterKnex } from "../core/db/master-pool.js";
import { createSchemaKnex, schemaName } from "../core/db/knex.js";

const results: Array<{ tenant: string; migrations?: string[]; seeded?: boolean; error?: string }> = [];

async function provisionTenants(
  rows: Array<{ subdomain: string; schema_name: string }>,
  migrationsDir: string,
  seedersDir: string,
) {
  for (const row of rows) {
    const schema = schemaName(row.schema_name);
    const tenantDb = createSchemaKnex(schema, { min: 0, max: 1 });
    try {
      const [, applied] = await tenantDb.migrate.latest({ directory: migrationsDir, schemaName: schema });
      await tenantDb.seed.run({ directory: seedersDir });
      results.push({ tenant: row.subdomain, migrations: applied, seeded: true });
    } catch (err: unknown) {
      results.push({ tenant: row.subdomain, error: err instanceof Error ? err.message : String(err) });
    } finally {
      await tenantDb.destroy();
    }
  }
}

const businesses = await masterKnex("businesses")
  .select("subdomain", "schema_name")
  .where("account_status", 1)
  .whereNotNull("schema_provisioned_at");
await provisionTenants(businesses, "./database/migrations/business", "./database/seeders/business");

const institutions = await masterKnex("institutions")
  .select("subdomain", "schema_name")
  .whereNull("deleted_at")
  .whereNotNull("schema_provisioned_at");
await provisionTenants(institutions, "./database/migrations/institution", "./database/seeders/institution");

console.table(results);
await masterKnex.destroy();
