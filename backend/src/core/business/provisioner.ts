// Business schema provisioning — CREATE SCHEMA, run migrations, seed defaults.
// Schema name = UUID from businesses.schema_name (non-guessable).

import { masterKnex } from "../db/master-pool.js";
import { createSchemaKnex, schemaName } from "../db/knex.js";

/**
 * Provision a new business schema:
 * 1. CREATE SCHEMA using the UUID schema_name
 * 2. Run business migrations (roles, agents, agent_invitations)
 * 3. Seed default roles
 */
export async function provisionBusinessSchema(schemaUuid: string): Promise<void> {
  const schema = schemaName(schemaUuid);

  await masterKnex.raw(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);

  const tenantDb = createSchemaKnex(schema, { min: 0, max: 1 });

  try {
    await tenantDb.migrate.latest({
      directory: "./database/migrations/business",
      schemaName: schema,
    });

    await tenantDb.seed.run({
      directory: "./database/seeders/business",
    });
  } finally {
    await tenantDb.destroy();
  }
}
