// Business schema provisioning — CREATE SCHEMA, run migrations, seed defaults.
// Schema name = UUID from businesses.schema_name (non-guessable).

import { masterKnex } from "../db/master-pool.js";
import { createSchemaKnex, schemaName } from "../db/knex.js";

async function provisionSchema(schemaUuid: string, migrationsDir: string, seedersDir?: string): Promise<void> {
  const schema = schemaName(schemaUuid);

  await masterKnex.raw(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);

  const tenantDb = createSchemaKnex(schema, { min: 0, max: 1 });

  try {
    await tenantDb.migrate.latest({
      directory: migrationsDir,
      schemaName: schema,
    });

    if (seedersDir) {
      await tenantDb.seed.run({ directory: seedersDir });
    }
  } finally {
    await tenantDb.destroy();
  }
}

/**
 * Provision a new business schema:
 * 1. CREATE SCHEMA using the UUID schema_name
 * 2. Run business migrations (roles, agents, agent_invitations)
 * 3. Seed default roles
 */
export async function provisionBusinessSchema(schemaUuid: string): Promise<void> {
  await provisionSchema(schemaUuid, "./database/migrations/business", "./database/seeders/business");
}

/**
 * Provision a new institution schema:
 * 1. CREATE SCHEMA using the UUID schema_name
 * 2. Run institution migrations (members, member_invitations)
 */
export async function provisionInstitutionSchema(schemaUuid: string): Promise<void> {
  await provisionSchema(schemaUuid, "./database/migrations/institution");
}
