/**
 * W7 — the org resolver, shared by every W7 transform (Part 3 §4 W7).
 *
 * V1 had ONE `businesses` table with 55 rows. W1 split it in two: 16 rows became
 * public.businesses, the other 39 became public.institutions (build wave B2's
 * nullable-owner + claim_status model). Fourteen of those unclaimed institutions
 * own 363 of V1's 402 business_services, so "resolve a V1 business uuid" in W7
 * means resolving into EITHER table — and V3's cross-tenant tables say so in
 * their shape: `owner_org_type` + `owner_org_id`, never a bare business_id.
 *
 * So this module is the one place that knows the union. Every W7 file resolves
 * through ORG_TYPE / ORG_ID / ORG_SCHEMA rather than repeating the UNION, because
 * three copies of a resolver is three chances for one of them to forget
 * institutions and silently drop 363 services.
 *
 * TENANT SCHEMAS. An unclaimed institution has a `schema_name` column precisely
 * so it can own a tenant schema, but W1 only provisioned the 16 businesses. The
 * 14 institutions that own services need one, and it is minted the way the
 * application mints one — gen_random_uuid() into schema_name (the app's own
 * repo.assignSchemaName), then w1-tenants' provisionTenantSchemas(), which runs
 * database/migrations/business + the roles seeder. Never hand-rolled DDL: a
 * tenant schema that differs from the one V3 creates at signup is a bug that only
 * shows up when a route queries it.
 *
 * Both steps run OUTSIDE the runner's transaction and in BOTH modes, for the same
 * reason w1-tenants provisions in both modes: a dry run of the services load has
 * nothing to rehearse against if the schema does not exist. Both are idempotent
 * and forward-only — a schema_name is minted only where it is NULL, and
 * CREATE SCHEMA IF NOT EXISTS + knex's per-schema migration table make the rest a
 * no-op on a second run.
 *
 * Usage:
 *   node --import tsx scripts/migration/w7-orgs.ts --self-check
 *   node --import tsx scripts/migration/w7-orgs.ts --provision   # DDL, idempotent
 */

import assert from "node:assert/strict";

import pg from "pg";

import { provisionTenantSchemas } from "./w1-tenants.js";
import { MigrationError, STAGING_SCHEMA, quoteIdent } from "./lib.js";

// ── The org union ───────────────────────────────────────────────────────────

/**
 * Every V1 business uuid that has a V3 home, as (org_type, org_id, schema_name).
 *
 * A derived table rather than a view: W7's mappings in mapping.json compare
 * against the same expression, and a resolver that only exists after --apply is a
 * resolver Gate 2 cannot use.
 */
export const ORGS = `(
  SELECT (b.meta->>'v1_business_id')::uuid AS v1_business_id,
         'business'::text                  AS org_type,
         b.id                              AS org_id,
         b.schema_name::text               AS schema_name
    FROM public.businesses b
   WHERE b.deleted_at IS NULL AND b.meta->>'v1_business_id' IS NOT NULL
   UNION ALL
  SELECT i.v1_business_id, 'institution'::text, i.id, i.schema_name::text
    FROM public.institutions i
   WHERE i.deleted_at IS NULL AND i.v1_business_id IS NOT NULL
)`;

/** 'business' | 'institution' for a V1 business uuid; NULL when it did not migrate. */
export const ORG_TYPE = (col: string): string => `(SELECT o.org_type FROM ${ORGS} o WHERE o.v1_business_id = ${col})`;

/** The V3 serial id in whichever table claimed it. */
export const ORG_ID = (col: string): string => `(SELECT o.org_id FROM ${ORGS} o WHERE o.v1_business_id = ${col})`;

/** The tenant schema that holds this org's services. NULL until it is provisioned. */
export const ORG_SCHEMA = (col: string): string => `(SELECT o.schema_name FROM ${ORGS} o WHERE o.v1_business_id = ${col})`;

/**
 * V1 business uuid -> public.businesses.id, and ONLY businesses.
 *
 * Not every V3 table went polymorphic. business_subscriptions, credit_wallets and
 * business_ai_credits all declare `business_id integer NOT NULL REFERENCES
 * public.businesses(id)`, so a row owned by a V1 business that became an
 * institution has no V3 home at all. That is a reason-coded skip
 * (`unresolved_business`), never an institution id smuggled into a businesses FK.
 */
export const BUSINESS_ONLY_ID = (col: string): string =>
  `(SELECT b.id FROM public.businesses b
     WHERE b.deleted_at IS NULL AND b.meta->>'v1_business_id' = ${col}::text)`;

/** V1 auth uuid -> public.platform_users.id, through the W1 identity map. */
export const USER_ID = (col: string): string =>
  `(SELECT mu.platform_user_id FROM mig.map_users mu WHERE mu.v1_user_id = ${col})`;

// ── Tenant schema enumeration + provisioning ────────────────────────────────

/**
 * The V1 businesses that own something W7 puts inside a tenant schema.
 *
 * Services, the two reusable libraries (study options, study units) and the
 * physical branches are all tenant-local, and each names its owner directly. An
 * org that owns none of them needs no schema from this wave.
 */
export const TENANT_OWNER_SQL = `
  SELECT business_id FROM ${STAGING_SCHEMA}.business_services
   UNION
  SELECT business_id FROM ${STAGING_SCHEMA}.service_study_options
   UNION
  SELECT business_id FROM ${STAGING_SCHEMA}.service_study_units
   UNION
  SELECT business_id FROM ${STAGING_SCHEMA}.branches`;

export interface TenantSchema {
  schema: string;
  orgType: string;
  orgId: number;
  v1BusinessId: string;
}

/** Every provisioned tenant schema, with the org it belongs to. */
export async function tenantSchemas(db: pg.ClientBase): Promise<TenantSchema[]> {
  const { rows } = await db.query<{ schema_name: string; org_type: string; org_id: number; v1_business_id: string }>(
    `SELECT o.schema_name, o.org_type, o.org_id, o.v1_business_id::text AS v1_business_id
       FROM ${ORGS} o
      WHERE o.schema_name IS NOT NULL
      ORDER BY o.org_type, o.org_id`,
  );
  return rows.map((r) => ({
    schema: r.schema_name,
    orgType: r.org_type,
    orgId: Number(r.org_id),
    v1BusinessId: r.v1_business_id,
  }));
}

export interface ProvisionResult {
  minted: { orgType: string; orgId: number; schema: string }[];
  provisioned: string[];
  ownersWithoutOrg: string[];
}

/**
 * Give every org that owns tenant data a schema_name, then provision the schemas.
 *
 * Idempotent in both halves: schema_name is minted only where it is NULL, and
 * provisionTenantSchemas() is CREATE SCHEMA IF NOT EXISTS plus knex migrations
 * tracked per schema. Runs outside the data transaction — see the header.
 */
export async function ensureTenantSchemas(url: string): Promise<ProvisionResult> {
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  let minted: ProvisionResult["minted"] = [];
  let ownersWithoutOrg: string[] = [];
  let schemas: string[] = [];
  try {
    // A tenant owner with no V3 org at all is a W1 problem, not a W7 one: minting
    // a schema would not give the rows anywhere to hang. Surfaced, not patched.
    const { rows: orphans } = await db.query<{ business_id: string }>(
      `SELECT DISTINCT t.business_id::text AS business_id
         FROM (${TENANT_OWNER_SQL}) t
        WHERE NOT EXISTS (SELECT 1 FROM ${ORGS} o WHERE o.v1_business_id = t.business_id)`,
    );
    ownersWithoutOrg = orphans.map((r) => r.business_id);

    for (const table of ["businesses", "institutions"] as const) {
      const v1Col = table === "businesses" ? `(b.meta->>'v1_business_id')::uuid` : `b.v1_business_id`;
      const { rows } = await db.query<{ id: number; schema_name: string }>(
        `UPDATE public.${table} b
            SET schema_name = gen_random_uuid(), updated_at = now()
          WHERE b.schema_name IS NULL
            AND b.deleted_at IS NULL
            AND ${v1Col} IN (SELECT business_id FROM (${TENANT_OWNER_SQL}) t)
          RETURNING b.id, b.schema_name::text AS schema_name`,
      );
      minted = [
        ...minted,
        ...rows.map((r) => ({ orgType: table === "businesses" ? "business" : "institution", orgId: Number(r.id), schema: r.schema_name })),
      ];
    }

    schemas = (await tenantSchemas(db)).map((t) => t.schema);
  } finally {
    await db.end().catch(() => {});
  }

  const provisioned = await provisionTenantSchemas(url, schemas);
  return { minted, provisioned, ownersWithoutOrg };
}

/**
 * Assert that a schema really carries the tenant services family before the wave
 * writes a single row. A schema created by an older migration set would otherwise
 * fail 200 statements in, halfway through a 20-schema loop.
 */
export async function assertTenantTables(db: pg.ClientBase, schema: string, tables: readonly string[]): Promise<void> {
  const { rows } = await db.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = $1`,
    [schema],
  );
  const live = new Set(rows.map((r) => r.table_name));
  const missing = tables.filter((t) => !live.has(t));
  if (missing.length) {
    throw new MigrationError(
      `tenant schema ${schema} is missing ${missing.join(", ")} — re-run w7-orgs.ts --provision before loading W7`,
    );
  }
}

// ── Self-check ──────────────────────────────────────────────────────────────

export function orgsSelfCheck(): void {
  // The whole point of this module: BOTH tables, or 363 services lose their owner.
  assert.ok(ORGS.includes("public.businesses"), "the union must reach businesses");
  assert.ok(ORGS.includes("public.institutions"), "the union must reach institutions — 14 of them own 363 services");
  assert.ok(ORGS.includes("'business'::text") && ORGS.includes("'institution'::text"), "org_type is discriminated, not inferred");
  for (const sql of [ORG_TYPE("x"), ORG_ID("x"), ORG_SCHEMA("x")]) {
    assert.ok(sql.includes("v1_business_id = x"), "every resolver keys on the V1 business uuid");
    assert.ok(!sql.includes("coalesce"), "an unresolved org is reported, never defaulted");
  }

  // business_subscriptions / credit_wallets / business_ai_credits FK to
  // public.businesses only. Resolving one of them through ORGS would put an
  // institution id in a businesses FK — a wrong row, not a missing one.
  assert.ok(BUSINESS_ONLY_ID("x").includes("public.businesses"));
  assert.ok(!BUSINESS_ONLY_ID("x").includes("institutions"), "a businesses-only FK must never resolve an institution");
  assert.ok(USER_ID("x").includes("mig.map_users"), "users resolve through the W1 identity map");

  // Four owner sources; dropping one silently leaves an org unprovisioned and its
  // rows homeless.
  for (const t of ["business_services", "service_study_options", "service_study_units", "branches"]) {
    assert.ok(TENANT_OWNER_SQL.includes(`${STAGING_SCHEMA}.${t}`), `${t} owners need a tenant schema`);
  }
  assert.ok(!/UNION\s+ALL/i.test(TENANT_OWNER_SQL), "UNION (not ALL): one schema per owner, however many tables name it");

  assert.equal(quoteIdent("3829ff2a-7ff9-0ffc-0d69-f66ac608cdba"), '"3829ff2a-7ff9-0ffc-0d69-f66ac608cdba"');

  console.log("w7-orgs self-check: ok");
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (argv.includes("--self-check")) {
    orgsSelfCheck();
    return 0;
  }
  if (!argv.includes("--provision")) {
    console.error("nothing to do: pass --self-check or --provision [--url=…]");
    return 2;
  }
  const url = argv.find((a) => a.startsWith("--url="))?.slice(6) ?? process.env.V3_DATABASE_URL;
  if (!url) {
    console.error("set --url= or V3_DATABASE_URL — the V3 database holding v1_staging");
    return 2;
  }
  const result = await ensureTenantSchemas(url);
  console.log(`minted ${result.minted.length} schema_name(s):`);
  for (const m of result.minted) console.log(`  ${m.orgType} ${m.orgId} -> ${m.schema}`);
  console.log(`provisioned ${result.provisioned.length} tenant schema(s) (idempotent DDL, outside any data transaction)`);
  if (result.ownersWithoutOrg.length) {
    console.error(`  ${result.ownersWithoutOrg.length} V1 owner(s) have no V3 org — W1 did not migrate them: ${result.ownersWithoutOrg.join(", ")}`);
    return 1;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await main());
}
