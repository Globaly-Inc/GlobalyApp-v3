// Business schema provisioning — CREATE SCHEMA, run migrations, seed defaults.
// Schema name = UUID from businesses.schema_name (non-guessable).

import { masterKnex } from "../db/master-pool.js";
import { createSchemaKnex, schemaName } from "../db/knex.js";
import { createChildLogger } from "../../shared/logger.js";

const logger = createChildLogger("provisioner");

async function provisionSchema(
  table: "businesses" | "institutions",
  schemaUuid: string,
  migrationsDir: string,
  seedersDir?: string,
): Promise<void> {
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

  // Stamped HERE rather than by each caller, because this is the only place that knows a
  // schema now exists. Four paths provision (self-service registration, admin creation,
  // institution onboarding, claim accept) and a caller that forgot to stamp would leave a
  // real tenant invisible to migrate:tenants — its schema would silently stop receiving new
  // tenant migrations. Keyed on schema_name, which is unique on both tables, so the row id
  // isn't needed. coalesce keeps the ORIGINAL provisioning time: this runs again on every
  // re-provision (it is CREATE SCHEMA IF NOT EXISTS + migrate.latest).
  await masterKnex(table)
    .where({ schema_name: schemaUuid })
    .update({ schema_provisioned_at: masterKnex.raw("coalesce(schema_provisioned_at, now())") });
}

/**
 * Provision a new business schema:
 * 1. CREATE SCHEMA using the UUID schema_name
 * 2. Run business migrations (roles, agents, agent_invitations)
 * 3. Seed default roles
 */
export async function provisionBusinessSchema(schemaUuid: string): Promise<void> {
  await provisionSchema("businesses", schemaUuid, "./database/migrations/business", "./database/seeders/business");
}

/**
 * Provision a new institution schema:
 * 1. CREATE SCHEMA using the UUID schema_name
 * 2. Run institution migrations (members, member_invitations)
 */
export async function provisionInstitutionSchema(schemaUuid: string): Promise<void> {
  await provisionSchema("institutions", schemaUuid, "./database/migrations/institution", "./database/seeders/institution");
}

export interface ClaimTarget {
  kind: "institution" | "business";
  /** institutions.id / businesses.id */
  id: number;
  schema_name: string;
}

/**
 * Give a promoted listing its tenant schema, the first time somebody really owns it.
 *
 * Promote deliberately creates no schema — it runs in bulk over every job imported from V2,
 * and a schema per job would mean tens of thousands of tables nobody owns. Nothing is lost
 * by waiting: the extracted catalog is never copied anywhere, it is read through
 * businesses/institutions.source_job_id, so the only thing a schema holds is tenant-owned
 * state (members, roles) that cannot exist before there is a tenant.
 *
 * Idempotent — provisionSchema is CREATE SCHEMA IF NOT EXISTS + migrate.latest(), so calling
 * this on an already-provisioned tenant just brings its migrations up to date. It also stamps
 * schema_provisioned_at itself, so there is nothing to do here but log.
 */
export async function provisionOnClaim(target: ClaimTarget): Promise<void> {
  if (target.kind === "institution") await provisionInstitutionSchema(target.schema_name);
  else await provisionBusinessSchema(target.schema_name);

  logger.info("Provisioned schema on claim", { kind: target.kind, id: target.id });
}
