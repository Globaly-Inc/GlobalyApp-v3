/**
 * W1.4 — tenant schema provisioning and the per-tenant `agents` table (§4 W1.2).
 *
 * V1's `business_members` becomes two things: the flat public.user_business_index
 * (loaded by w1-businesses) and one `agents` row inside the business's OWN
 * schema. This step provisions those schemas and loads the agents.
 *
 * WHY THIS IS ITS OWN SCRIPT, AND WHY PROVISIONING SITS OUTSIDE THE TRANSACTION.
 * Provisioning is DDL — CREATE SCHEMA plus the twelve tracked business
 * migrations plus the roles seeder — and it runs through knex on its own
 * connection, so it cannot join the runner's transaction. It is idempotent and
 * forward-only (CREATE SCHEMA IF NOT EXISTS; knex records migrations per
 * schema), and it runs in BOTH modes deliberately: a dry run of the agent load
 * has nothing to rehearse against if the schema does not exist. The DATA half —
 * every agents row — stays inside the runner's single transaction, so
 * dry-run and --apply differ only by ROLLBACK vs COMMIT exactly as elsewhere.
 *
 * Schema names are derived from the V1 business uuid by w1-businesses, so a
 * re-run provisions the same schemas rather than a second set.
 *
 * Usage:
 *   node --import tsx scripts/migration/w1-tenants.ts --self-check
 *   node --import tsx scripts/migration/w1-tenants.ts             # dry run
 *   node --import tsx scripts/migration/w1-tenants.ts --apply
 */

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import knexLib from "knex";
import pg from "pg";

import { liveMembers } from "./w1-businesses.js";
import {
  assertParentCounts,
  assertTargetColumns,
  clearReport,
  execWrite,
  quoteIdent,
  reportUnresolvedQuery,
  runTransform,
  type TransformContext,
} from "./lib.js";

const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BUSINESS_MIGRATIONS = path.join(BACKEND_ROOT, "database/migrations/business");
const BUSINESS_SEEDS = path.join(BACKEND_ROOT, "database/seeders/business");

/** V1's member roles as V3 tenant role names. `staff` is the only rename. */
const ROLE_NAME = `CASE m.role::text WHEN 'staff' THEN 'member' ELSE m.role::text END`;

/**
 * Provision every tenant schema public.businesses names.
 *
 * Deliberately the same path the application uses (database/migrations/business
 * + the roles seeder) rather than hand-written DDL: a tenant schema that differs
 * from the one V3 creates at signup is a bug that only shows up in W7.
 */
export async function provisionTenantSchemas(url: string, schemas: readonly string[]): Promise<string[]> {
  const provisioned: string[] = [];
  const master = new pg.Client({ connectionString: url });
  await master.connect();
  try {
    for (const schema of schemas) {
      await master.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schema)}`);
    }
  } finally {
    await master.end().catch(() => {});
  }

  for (const schema of schemas) {
    const tenant = knexLib({
      client: "pg",
      connection: url,
      searchPath: [schema, "public"],
      pool: { min: 0, max: 1 },
    });
    try {
      await tenant.migrate.latest({ directory: BUSINESS_MIGRATIONS, schemaName: schema, extension: "ts" });
      await tenant.seed.run({ directory: BUSINESS_SEEDS, extension: "ts" });
      provisioned.push(schema);
    } finally {
      await tenant.destroy();
    }
  }
  return provisioned;
}

async function tenantSchemas(url: string): Promise<string[]> {
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    const { rows } = await db.query<{ schema_name: string }>(
      `SELECT schema_name::text FROM public.businesses WHERE deleted_at IS NULL ORDER BY id`,
    );
    return rows.map((r) => r.schema_name);
  } finally {
    await db.end().catch(() => {});
  }
}

export async function transformTenantAgents(ctx: TransformContext, allowedCodes: ReadonlySet<string>): Promise<void> {
  const { rows: businesses } = await ctx.db.query<{ schema_name: string }>(
    `SELECT schema_name::text FROM public.businesses WHERE deleted_at IS NULL ORDER BY id`,
  );
  await clearReport(ctx, ["business_members"]);

  await assertParentCounts(ctx, '"{{schema}}".agents', [
    { label: "platform_users", stagingTable: "auth_users", targetTable: "public.platform_users", targetFilter: "deleted_at IS NULL" },
    {
      label: "businesses + institutions",
      stagingTable: "businesses",
      targetTable: `(SELECT id FROM public.businesses WHERE deleted_at IS NULL
                     UNION ALL
                     SELECT id FROM public.institutions WHERE deleted_at IS NULL AND v1_business_id IS NOT NULL) parents`,
    },
  ]);

  for (const { schema_name: schema } of businesses) {
    const agents = `${quoteIdent(schema)}."agents"`;
    const roles = `${quoteIdent(schema)}."roles"`;
    await assertTargetColumns(ctx.db, schema, "agents", ["platform_user_id", "role_id", "is_owner", "account_status", "added_by", "meta"]);

    // A V1 role with no seeded tenant role would otherwise become a NOT NULL
    // violation at insert time; reported per business so the row is explained
    // rather than blocking the whole wave.
    await reportUnresolvedQuery(ctx, allowedCodes, {
      sourceTable: "business_members",
      targetTable: `${schema}.agents`,
      column: "role_id",
      reasonCode: "unresolved_parent",
      sql: `SELECT m.business_id::text || '|' || m.user_id::text,
                   'no tenant role named ' || (${ROLE_NAME}) || ' in schema ${schema}'
            ${liveMembers(
              "JOIN public.businesses tb ON tb.meta->>'v1_business_id' = m.business_id::text",
            )}
              AND tb.schema_name::text = $1
              AND NOT EXISTS (SELECT 1 FROM ${roles} tr WHERE tr.name = (${ROLE_NAME}) AND tr.deleted_at IS NULL)`,
      params: [schema],
    });

    await execWrite(
      ctx,
      '"{{schema}}".agents',
      `INSERT INTO ${agents} (platform_user_id, role_id, is_owner, account_status, meta)
       SELECT pu.id, tr.id, (m.role::text = 'owner'), 1,
              CASE WHEN nullif(btrim(coalesce(m.position, '')), '') IS NULL THEN '{}'::jsonb
                   ELSE jsonb_build_object('position', btrim(m.position)) END
       ${liveMembers(
         "JOIN public.platform_users pu ON pu.uuid = m.user_id",
         "JOIN public.businesses tb ON tb.meta->>'v1_business_id' = m.business_id::text",
         `JOIN ${roles} tr ON tr.name = (${ROLE_NAME}) AND tr.deleted_at IS NULL`,
       )}
         AND tb.schema_name::text = $1
       ON CONFLICT (platform_user_id) DO UPDATE SET
         role_id = EXCLUDED.role_id, is_owner = EXCLUDED.is_owner,
         account_status = EXCLUDED.account_status, meta = EXCLUDED.meta, updated_at = now()`,
      [schema],
    );

    // Second pass: agents.added_by is a self-FK, so the inviter can only be
    // resolved once every agent row in this schema exists. An inviter who is not
    // an agent of the same business is reported and left NULL — an added_by
    // pointing at the wrong person is worse than an honest absence.
    await reportUnresolvedQuery(ctx, allowedCodes, {
      sourceTable: "business_members",
      targetTable: `${schema}.agents`,
      column: "added_by",
      reasonCode: "unresolved_user",
      sql: `SELECT m.business_id::text || '|' || m.user_id::text,
                   'inviter ' || m.invited_by::text || ' is not an agent of this business'
            ${liveMembers(
              "JOIN public.businesses tb ON tb.meta->>'v1_business_id' = m.business_id::text",
            )}
              AND tb.schema_name::text = $1
              AND m.invited_by IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM ${agents} a2
                                JOIN public.platform_users pi ON pi.id = a2.platform_user_id
                               WHERE pi.uuid = m.invited_by)`,
      params: [schema],
    });

    await execWrite(
      ctx,
      '"{{schema}}".agents (added_by)',
      `UPDATE ${agents} t
          SET added_by = inviter.id, updated_at = now()
         FROM v1_staging.business_members m
         JOIN public.platform_users pu ON pu.uuid = m.user_id
         JOIN public.businesses tb ON tb.meta->>'v1_business_id' = m.business_id::text
         JOIN public.platform_users pi ON pi.uuid = m.invited_by
         JOIN ${agents} inviter ON inviter.platform_user_id = pi.id
        WHERE t.platform_user_id = pu.id
          AND tb.schema_name::text = $1
          AND m.invited_by IS NOT NULL
          AND t.added_by IS DISTINCT FROM inviter.id`,
      [schema],
    );
  }
}

export function tenantsSelfCheck(): void {
  assert.ok(ROLE_NAME.includes("'staff' THEN 'member'"), "staff is the one V1 role V3 renames");
  assert.ok(!ROLE_NAME.includes("ELSE 'member'"), "an unmapped role must not silently become a member");
  assert.equal(quoteIdent("3829ff2a-7ff9-0ffc-0d69-f66ac608cdba"), '"3829ff2a-7ff9-0ffc-0d69-f66ac608cdba"');
  assert.equal(quoteIdent('ev"il'), '"ev""il"', "a schema name is quoted, never interpolated raw");
  assert.ok(BUSINESS_MIGRATIONS.endsWith("database/migrations/business"), "tenant schemas use the app's own migrations, not hand-written DDL");
  console.log("w1-tenants self-check: ok");
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (argv.includes("--self-check")) {
    return runTransform({ wave: "W1-tenants", argv, body: async () => {}, selfCheck: tenantsSelfCheck });
  }
  const url = argv.find((a) => a.startsWith("--url="))?.slice(6) ?? process.env.V3_DATABASE_URL;
  if (!url) {
    console.error("set --url= or V3_DATABASE_URL — the V3 database holding v1_staging");
    return 2;
  }
  // DDL first, in both modes: idempotent, forward-only, and the agent load has
  // nothing to write into without it. See the header.
  const schemas = await tenantSchemas(url);
  const provisioned = await provisionTenantSchemas(url, schemas);
  console.log(`provisioned ${provisioned.length} tenant schema(s) (idempotent DDL, outside the data transaction)`);

  return runTransform({ wave: "W1-tenants", argv, body: transformTenantAgents, selfCheck: tenantsSelfCheck });
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await main());
}
