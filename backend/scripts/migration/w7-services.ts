/**
 * W7a — the tenant services family (Part 3 §4 W7, build wave C1's schema).
 *
 * The bulk of W7 and the reason it was blocked: 402 business_services plus ~1,900
 * rows across nine children and five junctions, all of it tenant-local, spread
 * across 20 tenant schemas.
 *
 * TWO CONSTRAINTS EARLIER WAVES ESTABLISHED, AND WHY EACH ONE MATTERS.
 *
 *   1. {tenant}.business_services.id IS THE UUID. C1 dropped the thin table's
 *      serial id and renamed `uuid` to `id`, because the uuid was already the
 *      external identity (schema_field_values.entity_id, the master cross-tenant
 *      tables, every child and junction). `v1_id` is a SEPARATE nullable-unique
 *      column and it is this loader's idempotency key. So V1's business_services.id
 *      is written into v1_id, NEVER into id, and every child and junction resolves
 *      its parent through v1_id -> id. Writing the V1 uuid into `id` would look
 *      right and quietly fuse two different identities. All fourteen tables carry
 *      a v1_id UNIQUE index for exactly this reason.
 *
 *   2. THE OWNER IS AN ORG, NOT A BUSINESS. W1 split V1's 55 businesses into 16
 *      public.businesses and 39 public.institutions, and 14 of those institutions
 *      own 363 of the 402 services. Resolution goes through w7-orgs' ORGS union,
 *      and the 14 institutions get a tenant schema minted and provisioned by
 *      `w7-orgs.ts --provision` before this wave runs.
 *
 * `branches` is here too and is NOT the cross-tenant graph: V1 `branches` is the
 * physical campus (name, country, city, address) and belongs inside the tenant, on
 * business_branches, whose natural key is `uuid` rather than a v1_id column. V1's
 * `business_branches` — the parent/child org graph — is master and lives in
 * w7-master.ts.
 *
 * Reference ids resolve against the `public` vocabularies (§15 decision 3), never
 * the superadmin copies. `business_services.embedding` is not carried: V1 stores
 * text @1536 (OpenAI), V3 declares vector(3072) and wave E1 re-embeds — a vector
 * from another model is incomparable, so a widened copy would be silently wrong
 * rather than loudly missing. `service_fee_items` has no V3 table and 0 V1 rows;
 * it stays `blocked` in mapping.json rather than `drop`, because the omission is a
 * shape decision and a row appearing at cutover must be a stop-and-classify.
 *
 * The five junctions load LAST, each behind assertParentCounts (defect D8), with
 * the parent count taken across every tenant schema at once — a per-schema
 * assertion would compare a global staging count against one schema's slice and
 * pass on nonsense.
 *
 * Usage:
 *   node --import tsx scripts/migration/w7-services.ts --self-check
 *   node --import tsx scripts/migration/w7-services.ts             # dry run
 *   node --import tsx scripts/migration/w7-services.ts --apply
 */

import assert from "node:assert/strict";

import { DEGREE_LEVEL_ID, SERVICE_CATEGORY_ID } from "./w4-extraction.js";
import {
  ORGS,
  ORG_ID,
  ORG_SCHEMA,
  ORG_TYPE,
  assertTenantTables,
  ensureTenantSchemas,
  tenantSchemas,
  type TenantSchema,
} from "./w7-orgs.js";
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

// ── Reference resolvers (§15 decision 3: `public`, never the superadmin copies) ──

/** V1 areas_of_study uuid -> public.areas_of_study serial, via the slug W2 keyed on. */
export const AREA_OF_STUDY_ID = (col: string): string =>
  `(SELECT pa.id FROM ${STAGING_SCHEMA}.areas_of_study a
      JOIN public.areas_of_study pa ON pa.slug = a.slug AND pa.deleted_at IS NULL
     WHERE a.id = ${col})`;

/**
 * V1 accreditations uuid -> public.accreditations serial.
 *
 * W2 loaded accreditations on `name` as the natural key (unique on both sides,
 * 30/30), so this must join on the same key or W2 and W7 would disagree about
 * what an accreditation is.
 */
export const ACCREDITATION_ID = (col: string): string =>
  `(SELECT pa.id FROM ${STAGING_SCHEMA}.accreditations va
      JOIN public.accreditations pa ON pa.name = va.name AND pa.deleted_at IS NULL
     WHERE va.id = ${col})`;

/** Within one tenant schema: V1 service uuid -> the V3 business_services.id uuid. */
export const SERVICE_ID = (schema: string, col: string): string =>
  `(SELECT bs.id FROM ${quoteIdent(schema)}."business_services" bs WHERE bs.v1_id = ${col})`;

/** Within one tenant schema: V1 child uuid -> the V3 child id, through v1_id. */
export const CHILD_ID = (schema: string, table: string, col: string): string =>
  `(SELECT c.id FROM ${quoteIdent(schema)}.${quoteIdent(table)} c WHERE c.v1_id = ${col})`;

/**
 * Every tenant table across every provisioned schema, as one derived table.
 *
 * Defect D8's guard compares a staging count against a target count, and the
 * target of a tenant table is 20 tables, not one. Built once and reused so the
 * five junction assertions cannot drift apart.
 */
export const unionAcrossSchemas = (schemas: readonly TenantSchema[], table: string): string =>
  schemas.length === 0
    ? `(SELECT NULL::uuid AS id WHERE false) u`
    : `(${schemas.map((s) => `SELECT id FROM ${quoteIdent(s.schema)}.${quoteIdent(table)}`).join(" UNION ALL ")}) u`;

// ── What this wave reads ────────────────────────────────────────────────────

/** The nine tenant-local roots and children, in dependency order. */
export const TENANT_TABLES: readonly string[] = [
  "business_services",
  "service_fees",
  "service_fee_structures",
  "service_fee_installments",
  "service_intakes",
  "service_eligibility_requirements",
  "service_study_options",
  "service_study_units",
  "branches",
];

/** The five junctions, each with the non-service parent it also hangs off (D8). */
export const JUNCTIONS: readonly {
  table: string;
  parent: { label: string; stagingTable: string; tenantTable: string };
}[] = [
  {
    table: "service_fee_assignments",
    parent: {
      label: "service_fees",
      stagingTable: "service_fees",
      tenantTable: "service_fees",
    },
  },
  {
    table: "service_eligibility_assignments",
    parent: {
      label: "service_eligibility_requirements",
      stagingTable: "service_eligibility_requirements",
      tenantTable: "service_eligibility_requirements",
    },
  },
  {
    table: "service_study_option_assignments",
    parent: {
      label: "service_study_options",
      stagingTable: "service_study_options",
      tenantTable: "service_study_options",
    },
  },
  {
    table: "service_study_unit_assignments",
    parent: {
      label: "service_study_units",
      stagingTable: "service_study_units",
      tenantTable: "service_study_units",
    },
  },
  {
    table: "service_accreditation_assignments",
    parent: {
      label: "accreditations",
      stagingTable: "accreditations",
      tenantTable: "",
    },
  },
];

/** Every V1 table this wave reads, so a re-run replaces its verdict rather than appending one. */
export const W7_SERVICE_SOURCE_TABLES: readonly string[] = [...TENANT_TABLES, ...JUNCTIONS.map((j) => j.table)];

/**
 * Source columns deliberately not carried, per table. Each one is declared in
 * mapping.json `dropped[]` with a written reason, which is where Gate 2 enforces
 * that a drop was a decision rather than an oversight.
 */
export const NEVER_COPIED: Readonly<Record<string, readonly string[]>> = {
  // V1 text @1536 (OpenAI) vs V3 vector(3072). Wave E1 re-embeds.
  business_services: ["embedding"],
};

// ── The per-schema loaders ──────────────────────────────────────────────────

/**
 * One tenant table, loaded for one schema, keyed on v1_id.
 *
 * `select` maps target column -> SQL over the source alias `s`; `$1` is always the
 * owning V1 business uuid. Written this way rather than through w4's copyTable()
 * because almost every column here is a rename or a remap, so an "intersect the
 * two column lists" copier would carry three columns and override eleven.
 */
export interface TenantSpec {
  /** Staging table name; also the tenant table name unless `targetTable` says otherwise. */
  table: string;
  targetTable?: string;
  /** Restricts the source to this schema's owner. `$1` is the tenant schema name. */
  where: string;
  /** The natural key this upsert converges on — v1_id everywhere but business_branches. */
  conflict: string;
  /** Target column -> SQL over the source alias `s`. */
  select: Record<string, string>;
}

async function loadTenantTable(ctx: TransformContext, schema: string, spec: TenantSpec): Promise<number> {
  const target = `${quoteIdent(schema)}.${quoteIdent(spec.targetTable ?? spec.table)}`;
  const columns = Object.keys(spec.select).sort();
  const updates = columns.filter((c) => c !== spec.conflict);
  return execWrite(
    ctx,
    `"{{schema}}".${spec.targetTable ?? spec.table}`,
    `INSERT INTO ${target} (${columns.map(quoteIdent).join(", ")})
     SELECT ${columns.map((c) => `${spec.select[c]} AS ${quoteIdent(c)}`).join(", ")}
       FROM ${STAGING_SCHEMA}.${quoteIdent(spec.table)} s
      WHERE ${spec.where}
     ON CONFLICT (${quoteIdent(spec.conflict)}) DO UPDATE SET
       ${updates.map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`).join(", ")}`,
    [schema],
  );
}

/** The service's own tenant, expressed as a filter on the source alias `s`. */
const OWNED_BY = `s.business_id = (SELECT o.v1_business_id FROM ${ORGS} o WHERE o.schema_name = $1)`;

/** A child's tenant, reached through its service. */
const CHILD_OF_OWNED = `EXISTS (SELECT 1 FROM ${STAGING_SCHEMA}.business_services p
    WHERE p.id = s.service_id
      AND p.business_id = (SELECT o.v1_business_id FROM ${ORGS} o WHERE o.schema_name = $1))`;

export function serviceSpecs(schema: string): TenantSpec[] {
  return [
    {
      table: "business_services",
      where: OWNED_BY,
      conflict: "v1_id",
      select: {
        v1_id: "s.id",
        service_category_id: SERVICE_CATEGORY_ID("s.category_id"),
        name: "s.name",
        slug: "s.slug",
        description: "s.description",
        overview: "s.overview",
        price: "s.price",
        price_currency: "s.price_currency",
        price_type: "s.price_type",
        duration_value: "s.duration_value",
        duration_unit: "s.duration_unit",
        image_url: "s.image_url",
        brochure_url: "s.brochure_url",
        tags: "s.tags",
        study_mode: "s.study_mode",
        degree_level_id: DEGREE_LEVEL_ID("s.degree_level_id"),
        area_of_study_id: AREA_OF_STUDY_ID("s.area_of_study_id"),
        awarded_by_org_type: ORG_TYPE("s.awarded_by_business_id"),
        awarded_by_org_id: ORG_ID("s.awarded_by_business_id"),
        is_published: "coalesce(s.is_published, false)",
        is_featured: "coalesce(s.is_featured, false)",
        gallery_urls: "coalesce(s.gallery_urls, '[]'::jsonb)",
        public_visibility: "coalesce(s.public_visibility, '{}'::jsonb)",
        category_specific_data: "coalesce(s.category_specific_data, '{}'::jsonb)",
        created_at: "s.created_at",
        updated_at: "s.updated_at",
      },
    },
    {
      table: "service_fees",
      where: CHILD_OF_OWNED,
      conflict: "v1_id",
      select: {
        v1_id: "s.id",
        service_id: SERVICE_ID(schema, "s.service_id"),
        name: "s.name",
        student_type: "s.student_type",
        period_type: "s.period_type",
        currency: "s.currency",
        total_amount: "s.total_amount",
        installments: "s.installments",
        save_for_reuse: "s.save_for_reuse",
        created_at: "s.created_at",
        updated_at: "s.updated_at",
      },
    },
    {
      table: "service_fee_structures",
      where: CHILD_OF_OWNED,
      conflict: "v1_id",
      select: {
        v1_id: "s.id",
        service_id: SERVICE_ID(schema, "s.service_id"),
        name: "s.name",
        applicable_to: "s.applicable_to",
        period: "s.period",
        currency: "s.currency",
        created_at: "s.created_at",
        updated_at: "s.updated_at",
      },
    },

    // Installments hang off a fee STRUCTURE, not a service, so the tenant filter
    // goes one hop further out.
    {
      table: "service_fee_installments",
      where: `EXISTS (SELECT 1 FROM ${STAGING_SCHEMA}.service_fee_structures fs
                      JOIN ${STAGING_SCHEMA}.business_services p ON p.id = fs.service_id
                     WHERE fs.id = s.fee_structure_id
                       AND p.business_id = (SELECT o.v1_business_id FROM ${ORGS} o WHERE o.schema_name = $1))`,
      conflict: "v1_id",
      select: {
        v1_id: "s.id",
        fee_structure_id: CHILD_ID(schema, "service_fee_structures", "s.fee_structure_id"),
        sort_order: "coalesce(s.sort_order, 0)",
        created_at: "s.created_at",
      },
    },
    {
      table: "service_intakes",
      where: CHILD_OF_OWNED,
      conflict: "v1_id",
      select: {
        v1_id: "s.id",
        service_id: SERVICE_ID(schema, "s.service_id"),
        intake_name: "s.intake_name",
        start_date: "s.start_date",
        end_date: "s.end_date",
        orientation_date: "s.orientation_date",
        admission_deadline: "s.admission_deadline",
        intake_month: "s.intake_month",
        intake_year: "s.intake_year",
        save_for_reuse: "s.save_for_reuse",
        created_at: "s.created_at",
        updated_at: "s.updated_at",
      },
    },
    {
      table: "service_eligibility_requirements",
      where: CHILD_OF_OWNED,
      conflict: "v1_id",
      select: {
        v1_id: "s.id",
        service_id: SERVICE_ID(schema, "s.service_id"),
        name: "s.name",
        applicable_to: "s.applicable_to",
        min_degree_level: "s.min_degree_level",
        min_score_percent: "s.min_score_percent",
        min_score_grade: "s.min_score_grade",
        min_grading_system: "s.min_grading_system",
        min_scores: "coalesce(s.min_scores, '[]'::jsonb)",
        description: "s.description",
        academic_tests: "s.academic_tests",
        language_tests: "s.language_tests",
        applicable_countries: "coalesce(s.applicable_countries, '{}'::text[])",
        save_for_reuse: "s.save_for_reuse",
        created_at: "s.created_at",
        updated_at: "s.updated_at",
      },
    },

    // The two reusable libraries. V1 keys them on business_id directly — they are
    // not attached to a service — so the tenant filter is the owner, and the
    // business_id column itself is dropped: inside a tenant schema it would be a
    // constant repeated on every row.
    {
      table: "service_study_options",
      where: OWNED_BY,
      conflict: "v1_id",
      select: {
        v1_id: "s.id",
        study_mode: "s.study_mode",
        study_load: "s.study_load",
        duration_value: "s.duration_value",
        duration_unit: "s.duration_unit",
        applicable_to: "s.applicable_to",
        save_for_reuse: "coalesce(s.save_for_reuse, false)",
        created_at: "coalesce(s.created_at, now())",
        updated_at: "coalesce(s.updated_at, now())",
      },
    },
    {
      table: "service_study_units",
      where: OWNED_BY,
      conflict: "v1_id",
      select: {
        v1_id: "s.id",
        unit_code: "s.unit_code",
        unit_name: "s.unit_name",
        credit_points: "s.credit_points",
        description: "s.description",
        created_at: "s.created_at",
        updated_at: "s.updated_at",
      },
    },

    // V1 `branches` -> the tenant business_branches, whose natural key is `uuid`
    // (there is no v1_id column here): the V1 branch uuid IS the external identity
    // the tenant table already exposes.
    {
      table: "branches",
      targetTable: "business_branches",
      where: OWNED_BY,
      conflict: "uuid",
      select: {
        uuid: "s.id",
        name: "s.name",
        country: "s.country",
        state: "s.state",
        city: "s.city",
        address: "s.address",
        phone: "s.phone",
        email: "s.email",
        is_primary: "coalesce(s.is_primary, false)",
        created_at: "s.created_at",
        updated_at: "s.updated_at",
      },
    },
  ];
}

export function junctionSpecs(schema: string): TenantSpec[] {
  return [
    {
      table: "service_fee_assignments",
      where: CHILD_OF_OWNED,
      conflict: "v1_id",
      select: {
        v1_id: "s.id",
        service_id: SERVICE_ID(schema, "s.service_id"),
        service_fee_id: CHILD_ID(schema, "service_fees", "s.service_fee_id"),
        created_at: "s.created_at",
      },
    },
    {
      table: "service_eligibility_assignments",
      where: CHILD_OF_OWNED,
      conflict: "v1_id",
      select: {
        v1_id: "s.id",
        service_id: SERVICE_ID(schema, "s.service_id"),
        eligibility_requirement_id: CHILD_ID(
          schema,
          "service_eligibility_requirements",
          "s.eligibility_requirement_id",
        ),
        created_at: "s.created_at",
      },
    },
    {
      table: "service_study_option_assignments",
      where: CHILD_OF_OWNED,
      conflict: "v1_id",
      select: {
        v1_id: "s.id",
        service_id: SERVICE_ID(schema, "s.service_id"),
        study_option_id: CHILD_ID(schema, "service_study_options", "s.study_option_id"),
        created_at: "coalesce(s.created_at, now())",
      },
    },
    {
      table: "service_study_unit_assignments",
      where: CHILD_OF_OWNED,
      conflict: "v1_id",
      select: {
        v1_id: "s.id",
        service_id: SERVICE_ID(schema, "s.service_id"),
        study_unit_id: CHILD_ID(schema, "service_study_units", "s.study_unit_id"),
        unit_type: "s.unit_type",
        created_at: "s.created_at",
      },
    },

    // accreditation_id is NOT NULL and points at the public vocabulary, so an
    // accreditation that did not migrate makes the row unloadable — skipped and
    // reported, never attached to some other accreditation to satisfy the FK.
    {
      table: "service_accreditation_assignments",
      where: `${CHILD_OF_OWNED} AND ${ACCREDITATION_ID("s.accreditation_id")} IS NOT NULL`,
      conflict: "v1_id",
      select: {
        v1_id: "s.id",
        service_id: SERVICE_ID(schema, "s.service_id"),
        accreditation_id: ACCREDITATION_ID("s.accreditation_id"),
        registration_number: "s.registration_number",
        created_at: "s.created_at",
      },
    },
  ];
}

// ── The wave ────────────────────────────────────────────────────────────────

export async function transformServices(ctx: TransformContext, allowedCodes: ReadonlySet<string>): Promise<void> {
  await clearReport(ctx, W7_SERVICE_SOURCE_TABLES);
  const schemas = await tenantSchemas(ctx.db);

  // Anything whose owner has no provisioned tenant schema has nowhere to go. Zero
  // rows today (w7-orgs --provision mints one for all 20 owners), but the guard is
  // what keeps a future unprovisioned owner from being silently dropped.
  for (const table of ["business_services", "service_study_options", "service_study_units", "branches"]) {
    await reportUnresolvedQuery(ctx, allowedCodes, {
      sourceTable: table,
      targetTable: `{tenant}.${table}`,
      column: "business_id",
      reasonCode: "unresolved_business",
      sql: `SELECT s.id::text, 'owner ' || s.business_id::text || ' has no provisioned tenant schema'
              FROM ${STAGING_SCHEMA}.${quoteIdent(table)} s
             WHERE ${ORG_SCHEMA("s.business_id")} IS NULL`,
    });
  }

  // Reference ids the V3 schema declares NULLABLE: the row still loads, the
  // reference lands NULL, and the report says which one and why. Reported rather
  // than shrugged off, because "this service lost its degree level" has to be a
  // query, not an archaeology exercise.
  const nullableRefs: {
    column: string;
    resolver: (c: string) => string;
    source: string;
    reason: string;
  }[] = [
    {
      column: "service_category_id",
      resolver: SERVICE_CATEGORY_ID,
      source: "s.category_id",
      reason: "unresolved_category",
    },
    {
      column: "degree_level_id",
      resolver: DEGREE_LEVEL_ID,
      source: "s.degree_level_id",
      reason: "unresolved_parent",
    },
    {
      column: "area_of_study_id",
      resolver: AREA_OF_STUDY_ID,
      source: "s.area_of_study_id",
      reason: "unresolved_parent",
    },
  ];
  for (const ref of nullableRefs) {
    await reportUnresolvedQuery(ctx, allowedCodes, {
      sourceTable: "business_services",
      targetTable: "{tenant}.business_services",
      column: ref.column,
      reasonCode: ref.reason,
      sql: `SELECT s.id::text, '${ref.column} ' || ${ref.source}::text || ' did not resolve against the public vocabulary'
              FROM ${STAGING_SCHEMA}.business_services s
             WHERE ${ref.source} IS NOT NULL AND ${ref.resolver(ref.source)} IS NULL`,
    });
  }

  // awarded_by_business_id -> (awarded_by_org_type, awarded_by_org_id). An
  // awarding body that never migrated leaves BOTH columns NULL — a half-resolved
  // polymorphic reference is worse than an absent one.
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "business_services",
    targetTable: "{tenant}.business_services",
    column: "awarded_by_org_id",
    reasonCode: "unresolved_business",
    sql: `SELECT s.id::text, 'awarding body ' || s.awarded_by_business_id::text || ' has no V3 business or institution'
            FROM ${STAGING_SCHEMA}.business_services s
           WHERE s.awarded_by_business_id IS NOT NULL AND ${ORG_ID("s.awarded_by_business_id")} IS NULL`,
  });

  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "service_accreditation_assignments",
    targetTable: "{tenant}.service_accreditation_assignments",
    column: "accreditation_id",
    reasonCode: "unresolved_parent",
    sql: `SELECT s.id::text, 'accreditation ' || s.accreditation_id::text || ' has no public.accreditations row'
            FROM ${STAGING_SCHEMA}.service_accreditation_assignments s
           WHERE ${ACCREDITATION_ID("s.accreditation_id")} IS NULL`,
  });

  // ── roots and children, per tenant ────────────────────────────────────────
  for (const t of schemas) {
    await assertTenantTables(ctx.db, t.schema, [
      ...TENANT_TABLES.filter((x) => x !== "branches"),
      "business_branches",
      ...JUNCTIONS.map((j) => j.table),
    ]);
    for (const spec of serviceSpecs(t.schema)) await loadTenantTable(ctx, t.schema, spec);
  }

  // ── the five junctions, last, behind the D8 guard ─────────────────────────
  // Counted across every tenant schema at once: the staging table is global, so
  // comparing it against one schema's slice would pass on nonsense.
  for (const j of JUNCTIONS) {
    const parents = [
      {
        label: "business_services",
        stagingTable: "business_services",
        targetTable: unionAcrossSchemas(schemas, "business_services"),
      },
      j.parent.tenantTable
        ? {
            label: j.parent.label,
            stagingTable: j.parent.stagingTable,
            targetTable: unionAcrossSchemas(schemas, j.parent.tenantTable),
          }
        : {
            label: j.parent.label,
            stagingTable: j.parent.stagingTable,
            targetTable: "public.accreditations",
            targetFilter: "deleted_at IS NULL",
          },
    ];
    await assertParentCounts(ctx, `{tenant}.${j.table}`, parents);
  }
  for (const t of schemas) {
    for (const spec of junctionSpecs(t.schema)) await loadTenantTable(ctx, t.schema, spec);
  }

  ctx.report.notes.push(`services family loaded across ${schemas.length} tenant schema(s)`);
}

export function servicesSelfCheck(): void {
  // Constraint 1. The V1 uuid goes to v1_id and nowhere else — writing it into
  // `id` would look right and fuse two identities. Asserted on the spec DATA, not
  // on a scraped function body, so a rename cannot quietly make the check vacuous.
  const specs = [...serviceSpecs("t"), ...junctionSpecs("t")];
  assert.equal(specs.length, 14, "nine roots/children + five junctions");
  assert.equal(new Set(specs.map((x) => x.targetTable ?? x.table)).size, 14, "one spec per tenant table");
  for (const spec of specs) {
    assert.equal(spec.select.id, undefined, `${spec.table}: V1's uuid must never be written into the V3 id`);
    if (spec.conflict === "v1_id") assert.equal(spec.select.v1_id, "s.id", `${spec.table}: v1_id carries the V1 uuid`);
    assert.ok(spec.select[spec.conflict], `${spec.table}: the conflict target must be among the inserted columns`);
    assert.ok(spec.where.includes("$1"), `${spec.table}: every load is scoped to one tenant schema`);
  }
  assert.equal(specs.filter((x) => x.conflict === "v1_id").length, 13, "13 of the 14 tenant tables upsert on v1_id");
  const byUuid = specs.filter((x) => x.conflict !== "v1_id");
  assert.deepEqual(
    byUuid.map((x) => [x.targetTable, x.conflict]),
    [["business_branches", "uuid"]],
    "business_branches is the one tenant table without a v1_id column; its natural key is `uuid`",
  );
  // Every child and junction reaches its parent through v1_id -> id, never by
  // assuming the V1 uuid survived as the V3 id.
  for (const spec of specs.filter((x) => x.select.service_id)) {
    assert.ok(spec.select.service_id.includes("bs.v1_id ="), `${spec.table}: the service FK resolves through v1_id`);
  }

  // Constraint 2. Owners resolve through the ORGS union, so the 14 institutions
  // that hold 363 services are not silently skipped.
  assert.ok(OWNED_BY.includes(ORGS), "the tenant filter resolves the owner through the business+institution union");
  assert.ok(CHILD_OF_OWNED.includes("business_services p"), "a child's tenant is its service's tenant");

  // §15 decision 3 — reference ids against public, never the superadmin copies.
  for (const resolver of [AREA_OF_STUDY_ID, ACCREDITATION_ID]) {
    assert.ok(resolver("x").includes("public."), "reference ids resolve against public");
    assert.ok(!/superadmin\./.test(resolver("x")), "never against the superadmin copies (§15 decision 3)");
    assert.ok(!resolver("x").includes("coalesce"), "an unresolved reference is reported, never defaulted");
  }
  // W2 loaded accreditations on `name`; joining on anything else invents a second
  // opinion about what an accreditation is.
  assert.ok(ACCREDITATION_ID("x").includes("pa.name = va.name"), "accreditations join on the key W2 loaded them under");

  // The embedding is never carried: V1 text @1536 vs V3 vector(3072), wave E1.
  assert.deepEqual(NEVER_COPIED.business_services, ["embedding"]);
  assert.ok(
    !specs.some((x) => Object.keys(x.select).includes("embedding")),
    "no loader may carry an embedding — V1 text @1536 vs V3 vector(3072), wave E1 re-embeds",
  );

  // Five junctions, each naming its second parent for the D8 guard.
  assert.equal(JUNCTIONS.length, 5, "§4 W7: five service junctions, loaded last");
  assert.equal(new Set(JUNCTIONS.map((j) => j.table)).size, 5);
  assert.equal(TENANT_TABLES.length, 9);
  assert.equal(W7_SERVICE_SOURCE_TABLES.length, 14, "every source table is cleared before a re-run");

  // The union guard degenerates safely: no schemas means an empty relation, not
  // broken SQL that would make the D8 assertion throw for the wrong reason.
  assert.ok(unionAcrossSchemas([], "business_services").includes("WHERE false"));
  const two = unionAcrossSchemas(
    [
      { schema: "a", orgType: "business", orgId: 1, v1BusinessId: "x" },
      { schema: 'b"c', orgType: "institution", orgId: 2, v1BusinessId: "y" },
    ],
    "service_fees",
  );
  assert.ok(two.includes("UNION ALL"), "every tenant schema counts toward the parent total");
  assert.ok(two.includes('"b""c"'), "a schema name is quoted, never interpolated raw");

  console.log("w7-services self-check: ok");
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (argv.includes("--self-check")) {
    return runTransform({
      wave: "W7-services",
      argv,
      body: async () => {},
      selfCheck: servicesSelfCheck,
    });
  }
  const url = argv.find((a) => a.startsWith("--url="))?.slice(6) ?? process.env.V3_DATABASE_URL;
  if (!url) {
    console.error("set --url= or V3_DATABASE_URL — the V3 database holding v1_staging");
    return 2;
  }
  // Provisioning is DDL plus a schema_name mint, both idempotent and forward-only,
  // and both run in BOTH modes for the reason w1-tenants gives: a dry run of the
  // services load has nothing to rehearse against if the schema does not exist.
  const provision = await ensureTenantSchemas(url);
  console.error(
    `minted ${provision.minted.length} schema_name(s), provisioned ${provision.provisioned.length} tenant schema(s) ` +
      `(idempotent DDL, outside the data transaction)`,
  );
  if (provision.ownersWithoutOrg.length) {
    console.error(`  ${provision.ownersWithoutOrg.length} V1 owner(s) have no V3 org at all — W1 did not migrate them`);
  }

  return runTransform({
    wave: "W7-services",
    argv,
    body: transformServices,
    selfCheck: servicesSelfCheck,
  });
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await main());
}
