/**
 * W7b — the cross-tenant graph, in master (Part 3 §4 W7, §1.2, §14).
 *
 * Five V1 tables whose whole purpose is to relate TWO different orgs, or one org's
 * service to another org. They land in `public`, never in a tenant schema, and the
 * reason is structural rather than stylistic: a cross-tenant FK cannot live inside
 * one tenant's schema. Put service_branch_sharing in Curtin's schema and the row
 * that shares a Curtin course with APIC has one leg in a schema APIC cannot read.
 * §14 records the branch-placement deviation for exactly this: `business_branches`
 * (the tenant table) shipped tenant-scoped because a business's own branch rows are
 * tenant-local — and W7's SHARING tables must not follow it in there.
 *
 *   business_branches             27 -> public.business_branches            parent/child org graph
 *   representations               10 -> public.representations              agent <-> institution
 *   service_branch_sharing       169 -> public.service_branch_sharing       a service, shared to a branch org
 *   service_study_option_branches 19 -> public.service_study_option_branches
 *   business_allowed_categories   34 -> public.business_allowed_categories  which categories an org may sell
 *
 * Every one of them went POLYMORPHIC in V3: `parent_org_type`/`parent_org_id`,
 * `owner_org_type`/`owner_org_id`, and so on. That is B2's institutions split
 * showing through — a V1 business uuid resolves into public.businesses OR
 * public.institutions, so a bare business_id column could not express half of this
 * graph. Resolution goes through w7-orgs' ORGS union, and a reference that resolves
 * to neither table leaves BOTH columns unset and the row skipped: a half-resolved
 * polymorphic reference points at whatever org happens to hold that id in the other
 * table, which is a wrong row rather than a missing one.
 *
 * Two of the five carry a TENANT uuid: service_branch_sharing.service_id and
 * service_study_option_branches.study_option_id point at rows inside the owner's
 * schema, and the uuid V3 assigned is not V1's. No static SQL expression can chase a
 * schema name it only learns from a column, so both resolve through mig.map_services
 * / mig.map_study_options — the views w7-services rebuilds over every tenant schema
 * on each run, and the same views mapping.json compares through. Those two therefore
 * depend on w7-services having run.
 *
 * Usage:
 *   node --import tsx scripts/migration/w7-master.ts --self-check
 *   node --import tsx scripts/migration/w7-master.ts             # dry run
 *   node --import tsx scripts/migration/w7-master.ts --apply
 */

import assert from "node:assert/strict";

import { SERVICE_CATEGORY_ID } from "./w4-extraction.js";
import { ensureServiceMaps, unionAcrossSchemas } from "./w7-services.js";
import { ORG_ID, ORG_TYPE, USER_ID, tenantSchemas } from "./w7-orgs.js";
import {
  assertParentCounts,
  clearReport,
  execWrite,
  quoteIdent,
  reportUnresolvedQuery,
  runTransform,
  STAGING_SCHEMA,
  type TransformContext,
} from "./lib.js";

/** Every V1 table this wave reads, so a re-run replaces its verdict rather than appending one. */
export const W7_MASTER_SOURCE_TABLES: readonly string[] = [
  "business_branches",
  "representations",
  "service_branch_sharing",
  "service_study_option_branches",
  "business_allowed_categories",
];

/**
 * The org references each master table has to resolve, and what fails when one
 * does not. Named as data so the self-check asserts on a value rather than
 * scraping a function body, and so a reference added later cannot be forgotten by
 * the skip reporter.
 *
 * Every one of these is NOT NULL on the V3 side, so an unresolved reference makes
 * the row unloadable — reported and skipped, never half-resolved.
 */
export const ORG_REFS: readonly { table: string; column: string; target: string; label: string }[] = [
  { table: "business_branches", column: "parent_business_id", target: "parent_org_id", label: "parent business" },
  { table: "business_branches", column: "child_business_id", target: "child_org_id", label: "child business" },
  { table: "representations", column: "agent_id", target: "agent_org_id", label: "agent" },
  { table: "representations", column: "institution_id", target: "institution_org_id", label: "institution" },
  { table: "service_branch_sharing", column: "branch_business_id", target: "branch_org_id", label: "branch business" },
  {
    table: "service_study_option_branches",
    column: "branch_business_id",
    target: "branch_org_id",
    label: "branch business",
  },
  { table: "business_allowed_categories", column: "business_id", target: "owner_org_id", label: "owner business" },
];

/**
 * One master table, loaded in a single statement, keyed on v1_id.
 *
 * v1_id carries the V1 uuid and has a UNIQUE index on all five targets, so a
 * second run converges on the rows the first one wrote. The PAIR uniques
 * (parent+child, service+branch, …) are a second constraint the load must respect
 * rather than upsert on: two V1 rows collapsing onto one pair would be a
 * duplicate_natural_key, and V1 has none.
 */
async function loadMaster(
  ctx: TransformContext,
  spec: { table: string; select: Record<string, string>; joins?: string; where?: string; params?: readonly unknown[] },
): Promise<number> {
  const columns = Object.keys(spec.select).sort();
  const updates = columns.filter((c) => c !== "v1_id");
  return execWrite(
    ctx,
    `public.${spec.table}`,
    `INSERT INTO public.${quoteIdent(spec.table)} (${columns.map(quoteIdent).join(", ")})
     SELECT ${columns.map((c) => `${spec.select[c]} AS ${quoteIdent(c)}`).join(", ")}
       FROM ${STAGING_SCHEMA}.${quoteIdent(spec.table)} s
       ${spec.joins ?? ""}
      ${spec.where ? `WHERE ${spec.where}` : ""}
     ON CONFLICT (v1_id) DO UPDATE SET
       ${updates.map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`).join(", ")}`,
    spec.params ?? [],
  );
}

/** Both legs of a polymorphic org reference resolved, or the row does not load. */
const RESOLVED = (col: string): string => `${ORG_ID(col)} IS NOT NULL`;

export async function transformMaster(ctx: TransformContext, allowedCodes: ReadonlySet<string>): Promise<void> {
  await clearReport(ctx, W7_MASTER_SOURCE_TABLES);
  const schemas = await tenantSchemas(ctx.db);
  // Rebuilt here as well as in w7-services, so a standalone run of this wave
  // (dry or applied) resolves tenant uuids against the schema list as it is now.
  await ensureServiceMaps(ctx, schemas);

  // Every org reference that does not resolve, reported before anything loads.
  for (const ref of ORG_REFS) {
    await reportUnresolvedQuery(ctx, allowedCodes, {
      sourceTable: ref.table,
      targetTable: `public.${ref.table}`,
      column: ref.target,
      reasonCode: "unresolved_business",
      sql: `SELECT s.id::text, '${ref.label} ' || s.${quoteIdent(ref.column)}::text || ' has no V3 business or institution'
              FROM ${STAGING_SCHEMA}.${quoteIdent(ref.table)} s
             WHERE ${ORG_ID(`s.${quoteIdent(ref.column)}`)} IS NULL`,
    });
  }

  // ── business_branches: the parent/child org graph (§14) ────────────────────
  await loadMaster(ctx, {
    table: "business_branches",
    where: `${RESOLVED("s.parent_business_id")} AND ${RESOLVED("s.child_business_id")}`,
    select: {
      v1_id: "s.id",
      parent_org_type: ORG_TYPE("s.parent_business_id"),
      parent_org_id: ORG_ID("s.parent_business_id"),
      child_org_type: ORG_TYPE("s.child_business_id"),
      child_org_id: ORG_ID("s.child_business_id"),
      branch_type: "s.branch_type",
      created_at: "coalesce(s.created_at, now())",
    },
  });

  // ── representations: agent <-> institution ─────────────────────────────────
  // initiated_by / responded_by are nullable platform_users FKs: an actor who did
  // not migrate leaves the column NULL and the representation itself intact — the
  // relationship is the record, not who clicked the button.
  for (const column of ["initiated_by", "responded_by"] as const) {
    await reportUnresolvedQuery(ctx, allowedCodes, {
      sourceTable: "representations",
      targetTable: "public.representations",
      column,
      reasonCode: "unresolved_user",
      sql: `SELECT s.id::text, '${column} ' || s.${column}::text || ' has no public.platform_users row'
              FROM ${STAGING_SCHEMA}.representations s
             WHERE s.${column} IS NOT NULL AND ${USER_ID(`s.${column}`)} IS NULL`,
    });
  }
  await loadMaster(ctx, {
    table: "representations",
    where: `${RESOLVED("s.agent_id")} AND ${RESOLVED("s.institution_id")}`,
    select: {
      v1_id: "s.id",
      agent_org_type: ORG_TYPE("s.agent_id"),
      agent_org_id: ORG_ID("s.agent_id"),
      institution_org_type: ORG_TYPE("s.institution_id"),
      institution_org_id: ORG_ID("s.institution_id"),
      status: "coalesce(s.status, 'pending')",
      initiated_by: USER_ID("s.initiated_by"),
      regions: "s.regions",
      services: "s.services",
      contract_url: "s.contract_url",
      valid_from: "s.valid_from",
      valid_until: "s.valid_until",
      notes: "s.notes",
      responded_by: USER_ID("s.responded_by"),
      responded_at: "s.responded_at",
      created_at: "s.created_at",
      updated_at: "s.updated_at",
    },
  });

  // ── business_allowed_categories ───────────────────────────────────────────
  // V1's `category_id` is a SERVICE category uuid, not a business one (all 34 rows
  // resolve in v1_staging.service_categories and none in business_categories), and
  // V3 names the column service_category_id accordingly. Resolving it against the
  // wrong vocabulary would silently grant the wrong permissions.
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "business_allowed_categories",
    targetTable: "public.business_allowed_categories",
    column: "service_category_id",
    reasonCode: "unresolved_category",
    sql: `SELECT s.id::text, 'category ' || s.category_id::text || ' has no public.service_categories row'
            FROM ${STAGING_SCHEMA}.business_allowed_categories s
           WHERE ${SERVICE_CATEGORY_ID("s.category_id")} IS NULL`,
  });
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "business_allowed_categories",
    targetTable: "public.business_allowed_categories",
    column: "granted_by",
    reasonCode: "unresolved_user",
    sql: `SELECT s.id::text, 'granted_by ' || s.granted_by::text || ' has no public.platform_users row'
            FROM ${STAGING_SCHEMA}.business_allowed_categories s
           WHERE s.granted_by IS NOT NULL AND ${USER_ID("s.granted_by")} IS NULL`,
  });
  await loadMaster(ctx, {
    table: "business_allowed_categories",
    where: `${RESOLVED("s.business_id")} AND ${SERVICE_CATEGORY_ID("s.category_id")} IS NOT NULL`,
    select: {
      v1_id: "s.id",
      owner_org_type: ORG_TYPE("s.business_id"),
      owner_org_id: ORG_ID("s.business_id"),
      service_category_id: SERVICE_CATEGORY_ID("s.category_id"),
      granted_by: USER_ID("s.granted_by"),
      created_at: "s.created_at",
    },
  });

  // ── the two that carry a tenant uuid ──────────────────────────────────────
  // These hang off rows w7-services wrote, so the D8 guard runs first, counted
  // across every tenant schema at once.
  await assertParentCounts(ctx, "public.service_branch_sharing", [
    {
      label: "business_services",
      stagingTable: "business_services",
      targetTable: unionAcrossSchemas(schemas, "business_services"),
    },
  ]);
  await assertParentCounts(ctx, "public.service_study_option_branches", [
    {
      label: "service_study_options",
      stagingTable: "service_study_options",
      targetTable: unionAcrossSchemas(schemas, "service_study_options"),
    },
  ]);

  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "service_branch_sharing",
    targetTable: "public.service_branch_sharing",
    column: "shared_by",
    reasonCode: "unresolved_user",
    sql: `SELECT s.id::text, 'shared_by ' || s.shared_by::text || ' has no public.platform_users row'
            FROM ${STAGING_SCHEMA}.service_branch_sharing s
           WHERE s.shared_by IS NOT NULL AND ${USER_ID("s.shared_by")} IS NULL`,
  });

  // The owner is the row's own service (or study option), and mig.map_services /
  // mig.map_study_options carry that row's V3 uuid from whichever tenant schema
  // holds it — so both load in ONE statement instead of once per schema. No static
  // SQL expression can chase a schema name it only learns from a column, which is
  // exactly why those views exist.
  await loadMaster(ctx, {
    table: "service_branch_sharing",
    joins: `JOIN ${STAGING_SCHEMA}.business_services p ON p.id = s.service_id
            JOIN mig.map_services ms ON ms.v1_id = s.service_id`,
    where: RESOLVED("s.branch_business_id"),
    select: {
      v1_id: "s.id",
      service_id: "ms.id",
      owner_org_type: ORG_TYPE("p.business_id"),
      owner_org_id: ORG_ID("p.business_id"),
      branch_org_type: ORG_TYPE("s.branch_business_id"),
      branch_org_id: ORG_ID("s.branch_business_id"),
      scope: "s.scope",
      shared_by: USER_ID("s.shared_by"),
      shared_at: "coalesce(s.shared_at, now())",
    },
  });

  await loadMaster(ctx, {
    table: "service_study_option_branches",
    joins: `JOIN ${STAGING_SCHEMA}.service_study_options o2 ON o2.id = s.study_option_id
            JOIN mig.map_study_options mo ON mo.v1_id = s.study_option_id`,
    where: RESOLVED("s.branch_business_id"),
    select: {
      v1_id: "s.id",
      study_option_id: "mo.id",
      owner_org_type: ORG_TYPE("o2.business_id"),
      owner_org_id: ORG_ID("o2.business_id"),
      branch_org_type: ORG_TYPE("s.branch_business_id"),
      branch_org_id: ORG_ID("s.branch_business_id"),
      created_at: "coalesce(s.created_at, now())",
    },
  });

  ctx.report.notes.push("cross-tenant graph landed in public — never in a tenant schema (§1.2, §14)");
}

export function masterSelfCheck(): void {
  // §1.2 / §14: master, never tenant. A cross-tenant FK inside one tenant's schema
  // gives the other tenant a leg it cannot read. The transpiler is free to
  // normalise quotes and whitespace, so the scrape does too.
  const body = transformMaster.toString().replace(/'/g, '"').replace(/\s+/g, " ");
  assert.equal(W7_MASTER_SOURCE_TABLES.length, 5);
  for (const t of W7_MASTER_SOURCE_TABLES) {
    assert.ok(new RegExp(`table: ?"${t}"`).test(body), `${t} must be loaded by this wave`);
  }
  assert.ok(
    !/\{tenant\}|\{\{schema\}\}/.test(body),
    "the cross-tenant tables never land in a tenant schema (§1.2, §14 branch-placement deviation)",
  );

  // Every polymorphic reference is resolved on BOTH legs or the row is skipped: a
  // type without an id (or vice versa) points at whatever org holds that id in the
  // other table.
  assert.ok(RESOLVED("x").includes(ORG_ID("x")), "the guard and the value use the same resolver");
  for (const ref of ORG_REFS) {
    assert.ok(W7_MASTER_SOURCE_TABLES.includes(ref.table), `${ref.table} is not one of this wave's tables`);
    assert.ok(ref.target.endsWith("_org_id"), `${ref.column} must land on a polymorphic org column`);
  }
  assert.equal(ORG_REFS.filter((r) => r.table === "business_branches").length, 2, "the branch graph has two org legs");
  assert.equal(ORG_REFS.filter((r) => r.table === "representations").length, 2, "a representation has two org legs");

  // business_allowed_categories.category_id is a SERVICE category (all 34 V1 rows
  // resolve there, none in business_categories); the V3 column says so too.
  assert.ok(body.includes("service_categories"), "allowed categories resolve against service_categories");
  assert.ok(
    !body.includes("business_categories"),
    "resolving against the wrong vocabulary grants the wrong permissions",
  );
  assert.ok(SERVICE_CATEGORY_ID("x").includes("public.service_categories"), "§15 decision 3: the public vocabulary");

  // The two tenant-uuid tables resolve through the mig views, because V3 minted its
  // own uuids and no static SQL can chase a schema name it reads from a column.
  assert.ok(body.includes("mig.map_services"), "service_branch_sharing resolves its tenant service uuid through mig.map_services");
  assert.ok(body.includes("mig.map_study_options"), "service_study_option_branches resolves through mig.map_study_options");
  assert.ok(body.includes("ms.v1_id = s.service_id"), "the join is on the V1 uuid, which is the only key both sides share");

  console.log("w7-master self-check: ok");
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await runTransform({ wave: "W7-master", body: transformMaster, selfCheck: masterSelfCheck }));
}
