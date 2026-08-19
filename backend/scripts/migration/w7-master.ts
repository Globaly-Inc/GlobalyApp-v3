/**
 * W7b — the cross-tenant graph, in master (Part 3 §4 W7, §1.2, §14).
 *
 * Six V1 tables whose whole purpose is to relate a row in MASTER to a row in a
 * TENANT schema, or two different orgs to each other. They land in `public`, never in a tenant schema, and the
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
 *   eligibility_checks             3 -> public.student_eligibility_checks   a student, checked against a service
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
  // §3.5's eligibility checker. Sixth table here rather than in w7-engagement
  // because its shape is this wave's shape, not that one's: one leg in master
  // (platform_users) and one leg pointing at a row inside a tenant schema, which
  // only mig.map_services can resolve — the view this wave already rebuilds.
  "eligibility_checks",
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
 * V1 source table -> the V3 master table it loads into, for the one that is renamed.
 * `eligibility_checks` becomes `student_eligibility_checks`, following the naming
 * V3 already uses for the student-owned master tables (`student_favorites`,
 * `student_job_applications`). Declared as data so the self-check reads it rather
 * than hard-coding the exception.
 */
export const TARGET_TABLE: Readonly<Record<string, string>> = {
  eligibility_checks: "student_eligibility_checks",
};

/**
 * Defect D8's guard for the eligibility load, declared as DATA.
 *
 * Both of a check's legs are NOT NULL, so it may only load once both parents have.
 * Named here rather than inline for the reason ORG_REFS is: the self-check asserts
 * on a value, and a transpiler is free to reshape a function body (or drop the
 * comment above a call) in ways a scrape cannot survive.
 *
 * `business_services` is a TENANT table, so its target is the union across every
 * provisioned schema — one guard, all tenants, resolved at call time.
 */
export const ELIGIBILITY_PARENTS: readonly { label: string; stagingTable: string; targetFilter?: string }[] = [
  { label: "business_services", stagingTable: "business_services" },
  { label: "platform_users", stagingTable: "auth_users", targetFilter: "deleted_at IS NULL" },
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
  spec: {
    table: string;
    /** The V1 staging table, when it is not named the same as the V3 target (see TARGET_TABLE). */
    source?: string;
    select: Record<string, string>;
    joins?: string;
    where?: string;
    params?: readonly unknown[];
  },
): Promise<number> {
  const columns = Object.keys(spec.select).sort();
  const updates = columns.filter((c) => c !== "v1_id");
  return execWrite(
    ctx,
    `public.${spec.table}`,
    `INSERT INTO public.${quoteIdent(spec.table)} (${columns.map(quoteIdent).join(", ")})
     SELECT ${columns.map((c) => `${spec.select[c]} AS ${quoteIdent(c)}`).join(", ")}
       FROM ${STAGING_SCHEMA}.${quoteIdent(spec.source ?? spec.table)} s
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

  // ── eligibility_checks -> public.student_eligibility_checks (§3.5, wave D) ──
  // UNBLOCKED 2026-08-18. The ledger read "MISSING in V3 ... No V3 table"; wave D
  // shipped globalyapp/20260818_350_student_eligibility_checks.ts, so per §4's
  // closing rule the entry flips to transform and its 3 rows load here.
  //
  // platform_user_id and service_id are both NOT NULL, so a row whose student or
  // service did not migrate is unloadable: reported, then skipped by the WHERE /
  // the inner join. Defect D8 is answered by the guard below plus loadMaster's
  // upsert-on-v1_id, NOT by conflict-swallowing: the guard refuses to run at all
  // when the services this stands on have not landed, instead of writing orphans
  // that no report ever names.
  await assertParentCounts(
    ctx,
    "public.student_eligibility_checks",
    ELIGIBILITY_PARENTS.map((p) => ({
      ...p,
      targetTable:
        p.stagingTable === "business_services"
          ? unionAcrossSchemas(schemas, "business_services")
          : "public.platform_users",
    })),
  );
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "eligibility_checks",
    targetTable: "public.student_eligibility_checks",
    column: "platform_user_id",
    reasonCode: "unresolved_user",
    sql: `SELECT s.id::text, 'student ' || s.student_id::text || ' has no public.platform_users row'
            FROM ${STAGING_SCHEMA}.eligibility_checks s
           WHERE ${USER_ID("s.student_id")} IS NULL`,
  });
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "eligibility_checks",
    targetTable: "public.student_eligibility_checks",
    column: "service_id",
    reasonCode: "unresolved_parent",
    sql: `SELECT s.id::text, 'service ' || s.service_id::text || ' did not migrate to any tenant business_services'
            FROM ${STAGING_SCHEMA}.eligibility_checks s
           WHERE NOT EXISTS (SELECT 1 FROM mig.map_services ms WHERE ms.v1_id = s.service_id)`,
  });
  // V1's `eligibility_result` enum values and V3's CHECK are the same three strings,
  // so `result` copies verbatim. A fourth value would violate the CHECK and fail the
  // wave, which is the correct outcome: NULLing a verdict would leave a row that
  // claims nothing.
  await loadMaster(ctx, {
    table: "student_eligibility_checks",
    source: "eligibility_checks",
    joins: `JOIN mig.map_services ms ON ms.v1_id = s.service_id`,
    where: `${USER_ID("s.student_id")} IS NOT NULL`,
    select: {
      v1_id: "s.id",
      platform_user_id: USER_ID("s.student_id"),
      service_id: "ms.id",
      result: "s.result",
      // jsonb on both sides, holding RENDERED SENTENCES rather than data — V1 wrote
      // human strings ("Minimum GPA: 3 (your GPA: 2)") and the page prints each with
      // a tick or a cross. Copied byte-for-byte; re-deriving them from V3's rule
      // engine would change what 3 migrated rows say.
      met_requirements: "coalesce(s.met_requirements, '[]'::jsonb)",
      unmet_requirements: "coalesce(s.unmet_requirements, '[]'::jsonb)",
      notes: "s.notes",
      created_at: "s.created_at",
      // V1 had no updated_at. Stamped from created_at, not now(), so a re-run is
      // idempotent in VALUE as well as in row count.
      updated_at: "s.created_at",
    },
  });

  ctx.report.notes.push("cross-tenant graph landed in public — never in a tenant schema (§1.2, §14)");
  ctx.report.notes.push(
    "eligibility_checks unblocked: 3 rows -> public.student_eligibility_checks (§3.5, wave D). " +
      "Master, not tenant — the row links a platform user to a tenant-owned service (§1.2).",
  );
}

export function masterSelfCheck(): void {
  // §1.2 / §14: master, never tenant. A cross-tenant FK inside one tenant's schema
  // gives the other tenant a leg it cannot read. The transpiler is free to
  // normalise quotes and whitespace, so the scrape does too.
  const body = transformMaster.toString().replace(/'/g, '"').replace(/\s+/g, " ");
  assert.equal(W7_MASTER_SOURCE_TABLES.length, 6);
  for (const t of W7_MASTER_SOURCE_TABLES) {
    // Five of the six keep their V1 name; eligibility_checks is the one rename
    // (V3 prefixes the student-owned master tables — student_favorites,
    // student_job_applications), so the scrape checks the TARGET name.
    const target = TARGET_TABLE[t] ?? t;
    assert.ok(new RegExp(`table: ?"${target}"`).test(body), `${t} must be loaded by this wave as ${target}`);
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
  // Asserted on the resolver's VALUE, not on a scraped body: a transpiler is free to
  // keep or strip the comment right above the call, and a check a comment can flip
  // is not a check.
  assert.ok(SERVICE_CATEGORY_ID("x").includes("public.service_categories"), "§15 decision 3: the public vocabulary");
  assert.ok(
    !SERVICE_CATEGORY_ID("x").includes("business_categories"),
    "resolving against the wrong vocabulary grants the wrong permissions",
  );

  // The two tenant-uuid tables resolve through the mig views, because V3 minted its
  // own uuids and no static SQL can chase a schema name it reads from a column.
  assert.ok(
    body.includes("mig.map_services"),
    "service_branch_sharing resolves its tenant service uuid through mig.map_services",
  );
  assert.ok(
    body.includes("mig.map_study_options"),
    "service_study_option_branches resolves through mig.map_study_options",
  );
  assert.ok(
    body.includes("ms.v1_id = s.service_id"),
    "the join is on the V1 uuid, which is the only key both sides share",
  );

  // §3.5's eligibility checks: master placement, and both legs resolved or skipped.
  assert.ok(
    W7_MASTER_SOURCE_TABLES.includes("eligibility_checks"),
    "eligibility_checks is this wave's sixth table — its V3 target shipped, so it is no longer blocked",
  );
  assert.ok(
    body.includes("public.student_eligibility_checks"),
    "the target is the MASTER table, never a tenant one: the row's legs straddle master and a tenant schema (§1.2)",
  );
  assert.ok(
    body.includes("ms.v1_id = s.service_id"),
    "a check's service is a tenant uuid V3 minted, so it resolves through mig.map_services like the other two",
  );
  // Defect D8, asserted on VALUES rather than on a scraped body: whether a comment
  // survives is a transpiler's choice, and a check a comment can flip is not a check.
  // The guard is a call with the target table as its first argument, and the load
  // goes through loadMaster — whose one INSERT is an upsert on v1_id, never a
  // conflict-swallowing DO NOTHING.
  // Defect D8, asserted on VALUES rather than on a scraped body: whether a comment
  // or a call's spacing survives is a transpiler's choice, and a check a transpiler
  // can flip is not a check.
  assert.equal(ELIGIBILITY_PARENTS.length, 2, "a check has two legs and both must have landed before it loads");
  assert.deepEqual(
    ELIGIBILITY_PARENTS.map((p) => p.stagingTable).sort(),
    ["auth_users", "business_services"],
    "the guard covers the student AND the service — a row missing either is unloadable, not an orphan",
  );
  assert.ok(
    body.includes("ELIGIBILITY_PARENTS"),
    "the guard is not decorative: the load must actually call assertParentCounts with it",
  );
  assert.ok(
    /updated_at: ?"s\.created_at"/.test(body),
    "V1 has no updated_at; stamping now() would make a re-run non-idempotent in value",
  );

  console.log("w7-master self-check: ok");
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await runTransform({ wave: "W7-master", body: transformMaster, selfCheck: masterSelfCheck }));
}
