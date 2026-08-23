// CLI tool — applies tenant migrations to ALL active business and institution schemas.
// Run with: npm run migrate:tenants

import { masterKnex } from "../core/db/master-pool.js";
import { createSchemaKnex, schemaName } from "../core/db/knex.js";

const results: Array<{ tenant: string; applied?: string[]; error?: string }> = [];

async function migrateTenants(rows: Array<{ subdomain: string; schema_name: string }>, directory: string) {
  for (const b of rows) {
    const schema = schemaName(b.schema_name);
    const tenantDb = createSchemaKnex(schema, { min: 0, max: 1 });

    try {
      const [, applied] = await tenantDb.migrate.latest({ directory, schemaName: schema });
      results.push({ tenant: b.subdomain, applied });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ tenant: b.subdomain, error: message });
    } finally {
      await tenantDb.destroy();
    }
  }
}

// schema_provisioned_at IS NULL = a promoted listing nobody owns yet, with no schema.
// Including those would make migrate.latest() CREATE SCHEMA for every one of them.
const businesses = await masterKnex("businesses")
  .select("subdomain", "schema_name")
  .where("account_status", 1)
  .whereNotNull("schema_provisioned_at");
await migrateTenants(businesses, "./database/migrations/business");

const institutions = await masterKnex("institutions")
  .select("subdomain", "schema_name")
  .whereNull("deleted_at")
  .whereNotNull("schema_provisioned_at");
await migrateTenants(institutions, "./database/migrations/institution");

console.table(results);
await masterKnex.destroy();
