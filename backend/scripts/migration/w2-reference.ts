/**
 * W2 — reference data (Part 3 §4 W2, §15 decision 3).
 *
 * Every table here has a natural key that already exists on both sides, so the
 * whole wave is slug- or name-keyed upserts and a second run is a no-op. The
 * canonical home is `public`, not superadmin.reference_tables (§15 decision 3).
 *
 * Load order is a dependency order, not a preference:
 *   degree_levels, areas_of_study, issuing_organizations, service_categories,
 *   business_categories            independent
 *   schema_fields                  -> both category tables (entity_id is their serial)
 *   test_provider_logos            independent
 *   fee_types                      -> mig.map_businesses (one V1 row is owned)
 *   business_category_default_services  -> both category tables (junction, D8)
 *   accreditations                 -> issuing_organizations
 *   accreditation_scope_countries  -> accreditations + mig.map_countries
 *
 * The wave ends with a repair, not a load: W1 wrote businesses.business_category_id
 * while public.business_categories was still empty, so every one of the 16 got
 * NULL. This wave is what makes those ids resolvable, so this wave is what
 * re-resolves them. Same shape as the §8 country-FK repair — idempotent, and the
 * row count it changes is the signal.
 *
 * Usage:
 *   node --import tsx scripts/migration/w2-reference.ts --self-check
 *   node --import tsx scripts/migration/w2-reference.ts             # dry run
 *   node --import tsx scripts/migration/w2-reference.ts --apply
 */

import assert from "node:assert/strict";

import {
  assertParentCounts,
  assertTargetColumns,
  clearReport,
  execWrite,
  normKeySql,
  reportUnresolvedQuery,
  runTransform,
  type TransformContext,
} from "./lib.js";

/** Free-text issuing organisation -> the FK, on the same natural key W2 loads it under. */
const ISSUING_ORG_ID = `(SELECT io.id FROM public.issuing_organizations io
                          WHERE lower(btrim(io.name)) = lower(btrim(ac.issuing_organization)))`;

/**
 * A V1 business uuid -> the V3 serial, through the resolver view W1 materialised.
 * An accreditation or fee type owned by a business that became an INSTITUTION
 * (unclaimed) has no businesses row to hang off — that is reported, not NULLed
 * quietly, because "global" and "owned by a business we lost" are different
 * facts about a fee.
 */
const BUSINESS_ID = (col: string): string =>
  `(SELECT mb.business_id FROM mig.map_businesses mb WHERE mb.v1_business_id = ${col})`;

/**
 * The jsonb keys public.schema_fields has a column for. Anything else in a V1
 * field definition (today: `step`, on one number field) is reason-coded rather
 * than folded into `options`, which V3 documents as the select/multi-select
 * choice list and nothing else.
 */
const SCHEMA_FIELD_KEYS = ["key", "label", "type", "required", "filterable", "options"] as const;

/**
 * V1's field definitions live as a jsonb array on the category row, so the
 * expansion is `jsonb_array_elements` WITH ORDINALITY: the ordinal is what makes
 * "which of two same-key definitions wins" a decision rather than a race.
 */
const FIELDS_OF = (v1Table: string): string => `
  SELECT s.slug,
         f.v AS def,
         f.v->>'key' AS field_key,
         row_number() OVER (PARTITION BY s.slug, f.v->>'key' ORDER BY f.ord) AS rn
    FROM v1_staging.${v1Table} s
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(s.schema_fields) = 'array' THEN s.schema_fields ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS f(v, ord)
   WHERE btrim(coalesce(f.v->>'key', '')) <> ''
     AND btrim(coalesce(f.v->>'label', '')) <> ''
     AND btrim(coalesce(f.v->>'type', '')) <> ''
`;

/**
 * §15: `core_field_settings` is dropped (platform-global, no V3 entity to hang
 * off), and the field definitions that DO fit V3's per-entity shape are the ones
 * already attached to a category — business_categories.schema_fields and
 * service_categories.schema_fields, both of which have a real entity id.
 *
 * Everything a definition carries that V3 has no column for is reported, not
 * folded in: a `step` quietly stuffed into `options` is a select list with a
 * number in it, and the first UI that renders it says so.
 */
async function loadSchemaFields(
  ctx: TransformContext,
  allowedCodes: ReadonlySet<string>,
  entity: { v1Table: string; v3Table: string; entityType: string },
): Promise<void> {
  const fields = FIELDS_OF(entity.v1Table);
  const source = `${entity.v1Table}.schema_fields`;

  // A category whose slug did not reach V3 takes its fields with it. Impossible
  // as long as the category load above ran — which is exactly why it is checked
  // rather than assumed.
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: entity.v1Table,
    targetTable: "public.schema_fields",
    column: "entity_id",
    reasonCode: "unresolved_category",
    sql: `SELECT x.slug || '|' || x.field_key,
                 'category "' || x.slug || '" has no public.${entity.v3Table} row, so its schema field has no entity_id'
            FROM (${fields}) x
           WHERE x.rn = 1
             AND NOT EXISTS (SELECT 1 FROM public.${entity.v3Table} c WHERE c.slug = x.slug AND c.deleted_at IS NULL)`,
  });

  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: entity.v1Table,
    targetTable: "public.schema_fields",
    column: "key",
    reasonCode: "duplicate_natural_key",
    sql: `SELECT x.slug || '|' || x.field_key,
                 'category "' || x.slug || '" defines the field key twice; the first definition in the array wins'
            FROM (${fields}) x WHERE x.rn > 1`,
  });

  // schema_fields has a column for six jsonb keys. A seventh is a field V3
  // cannot express — reported so a future schema change can find it, never
  // dropped on the floor and never smuggled into `options`.
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: entity.v1Table,
    targetTable: "public.schema_fields",
    column: "schema_fields",
    reasonCode: "no_v3_column",
    sql: `SELECT x.slug || '|' || x.field_key || '#' || k.key,
                 'public.schema_fields has no column for "' || k.key || '" (value ' || (x.def->k.key)::text || ')'
            FROM (${fields}) x
            CROSS JOIN LATERAL jsonb_object_keys(x.def) AS k(key)
           WHERE x.rn = 1 AND k.key <> ALL ($1::text[])`,
    params: [[...SCHEMA_FIELD_KEYS]],
  });

  await execWrite(
    ctx,
    `public.schema_fields (${entity.entityType})`,
    `INSERT INTO public.schema_fields (entity_id, entity_type, is_default, label, key, type, is_required, filterable, options)
     SELECT c.id, $1, false, x.def->>'label', x.field_key,
            CASE WHEN x.def->>'type' = 'multi-select' THEN 'multi_select' ELSE x.def->>'type' END,
            coalesce((x.def->>'required')::boolean, false),
            coalesce((x.def->>'filterable')::boolean, false),
            x.def->'options'
       FROM (${fields}) x
       JOIN public.${entity.v3Table} c ON c.slug = x.slug AND c.deleted_at IS NULL
      WHERE x.rn = 1
     ON CONFLICT (entity_id, entity_type, key) DO UPDATE SET
       is_default = EXCLUDED.is_default, label = EXCLUDED.label, type = EXCLUDED.type,
       is_required = EXCLUDED.is_required, filterable = EXCLUDED.filterable,
       options = EXCLUDED.options, updated_at = now()`,
    [entity.entityType],
  );

  ctx.report.notes.push(`${source} expanded into public.schema_fields as entity_type='${entity.entityType}'`);
}

export async function transformReference(ctx: TransformContext, allowedCodes: ReadonlySet<string>): Promise<void> {
  await clearReport(ctx, [
    "fee_types", "accreditations", "business_category_default_services",
    "service_categories", "business_categories", "test_provider_logos",
  ]);

  // ── independent reference tables ───────────────────────────────────────────
  await assertTargetColumns(ctx.db, "public", "degree_levels", ["name", "slug", "sort_order", "is_active"]);
  await execWrite(
    ctx,
    "public.degree_levels",
    `INSERT INTO public.degree_levels (name, slug, sort_order, is_active)
     SELECT d.name, d.slug, coalesce(d.sort_order, 0), coalesce(d.is_active, true)
       FROM v1_staging.degree_levels d
     ON CONFLICT (slug) DO UPDATE SET
       name = EXCLUDED.name, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active, updated_at = now()`,
  );

  await assertTargetColumns(ctx.db, "public", "areas_of_study", ["name", "slug", "sort_order", "is_active"]);
  await execWrite(
    ctx,
    "public.areas_of_study",
    `INSERT INTO public.areas_of_study (name, slug, sort_order, is_active)
     SELECT a.name, a.slug, coalesce(a.sort_order, 0), coalesce(a.is_active, true)
       FROM v1_staging.areas_of_study a
     ON CONFLICT (slug) DO UPDATE SET
       name = EXCLUDED.name, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active, updated_at = now()`,
  );

  await assertTargetColumns(ctx.db, "public", "issuing_organizations", ["name", "logo_url", "website"]);
  await execWrite(
    ctx,
    "public.issuing_organizations",
    `INSERT INTO public.issuing_organizations (name, logo_url, website)
     SELECT o.name, o.logo_url, o.website FROM v1_staging.issuing_organizations o
     ON CONFLICT (name) DO UPDATE SET
       logo_url = EXCLUDED.logo_url, website = EXCLUDED.website, updated_at = now()`,
  );

  await assertTargetColumns(ctx.db, "public", "service_categories", ["slug", "name", "description", "icon", "is_active", "sort_order"]);
  await execWrite(
    ctx,
    "public.service_categories",
    `INSERT INTO public.service_categories (slug, name, description, icon, is_active, sort_order)
     SELECT s.slug, s.name, s.description, coalesce(nullif(btrim(s.icon), ''), 'Package'),
            coalesce(s.is_active, true), coalesce(s.sort_order, 0)
       FROM v1_staging.service_categories s
     ON CONFLICT (slug) DO UPDATE SET
       name = EXCLUDED.name, description = EXCLUDED.description, icon = EXCLUDED.icon,
       is_active = EXCLUDED.is_active, sort_order = EXCLUDED.sort_order, updated_at = now()`,
  );

  await assertTargetColumns(ctx.db, "public", "business_categories", ["slug", "name", "description", "icon", "is_active", "sort_order"]);
  await execWrite(
    ctx,
    "public.business_categories",
    `INSERT INTO public.business_categories (slug, name, description, icon, is_active, sort_order)
     SELECT b.slug, b.name, b.description, b.icon, coalesce(b.is_active, true), coalesce(b.sort_order, 0)
       FROM v1_staging.business_categories b
     ON CONFLICT (slug) DO UPDATE SET
       name = EXCLUDED.name, description = EXCLUDED.description, icon = EXCLUDED.icon,
       is_active = EXCLUDED.is_active, sort_order = EXCLUDED.sort_order, updated_at = now()`,
  );

  // ── schema_fields, from the jsonb already attached to the categories ───────
  // Runs AFTER both category tables, because entity_id is the V3 category's
  // serial and there is no other way to know it.
  await assertTargetColumns(ctx.db, "public", "schema_fields", [
    "entity_id", "entity_type", "is_default", "label", "key", "type", "is_required", "filterable", "options",
  ]);
  await loadSchemaFields(ctx, allowedCodes, {
    v1Table: "business_categories",
    v3Table: "business_categories",
    entityType: "business_categories",
  });
  await loadSchemaFields(ctx, allowedCodes, {
    v1Table: "service_categories",
    v3Table: "service_categories",
    entityType: "service_categories",
  });

  // ── test_provider_logos ────────────────────────────────────────────────────
  // §15: the 10 reference rows behind the test pickers get their own small
  // public table (20260817_200_test_provider_logos.ts). logo_url is carried
  // VERBATIM — those are supabase.co objects, and W6's storage rehost is what
  // rewrites them once each has an uploaded_files row.
  await assertTargetColumns(ctx.db, "public", "test_provider_logos", [
    "v1_id", "test_type", "category", "logo_url", "sort_order",
  ]);

  const LOGOS = `
    SELECT l.id, btrim(l.test_type) AS test_type, l.category, l.logo_url, coalesce(l.sort_order, 0) AS sort_order,
           row_number() OVER (PARTITION BY lower(btrim(l.test_type)) ORDER BY l.created_at, l.id) AS rn
      FROM v1_staging.test_provider_logos l
     WHERE btrim(coalesce(l.test_type, '')) <> ''`;

  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "test_provider_logos",
    targetTable: "public.test_provider_logos",
    column: "category",
    reasonCode: "invalid_source_data",
    sql: `SELECT g.test_type, 'category "' || coalesce(g.category, '(null)') || '" is not one of language | academic, which V3 CHECKs'
            FROM (${LOGOS}) g WHERE g.rn = 1 AND coalesce(g.category, '') NOT IN ('language', 'academic')`,
  });

  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "test_provider_logos",
    targetTable: "public.test_provider_logos",
    column: "test_type",
    reasonCode: "duplicate_natural_key",
    sql: `SELECT g.test_type, 'V1 lists this test type more than once; the oldest row wins'
            FROM (${LOGOS}) g WHERE g.rn > 1`,
  });

  await execWrite(
    ctx,
    "public.test_provider_logos",
    `INSERT INTO public.test_provider_logos (v1_id, test_type, category, logo_url, sort_order)
     SELECT g.id, g.test_type, g.category, g.logo_url, g.sort_order
       FROM (${LOGOS}) g
      WHERE g.rn = 1 AND g.category IN ('language', 'academic')
     ON CONFLICT (test_type) DO UPDATE SET
       v1_id = EXCLUDED.v1_id, category = EXCLUDED.category, logo_url = EXCLUDED.logo_url,
       sort_order = EXCLUDED.sort_order, updated_at = now()`,
  );

  // ── fee_types ──────────────────────────────────────────────────────────────
  // §15 decision 3: the canonical home is public.fee_types, not
  // superadmin.reference_tables. One V1 row is owned by a business rather than
  // global; if that business did not become a tenant, the ownership is reported.
  await assertTargetColumns(ctx.db, "public", "fee_types", ["name", "slug", "business_id", "status", "is_global", "sort_order"]);
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "fee_types",
    targetTable: "public.fee_types",
    column: "business_id",
    reasonCode: "unresolved_business",
    sql: `SELECT f.slug, 'owning business ' || f.business_id::text || ' did not migrate to public.businesses'
            FROM v1_staging.fee_types f
           WHERE f.business_id IS NOT NULL AND ${BUSINESS_ID("f.business_id")} IS NULL`,
  });

  // fee_types has no plain UNIQUE — its natural key is a PARTIAL expression
  // index on lower(name) for live rows, so the conflict target has to name both
  // the expression and the predicate.
  await execWrite(
    ctx,
    "public.fee_types",
    `INSERT INTO public.fee_types (name, slug, business_id, status, is_global, sort_order)
     SELECT f.name, f.slug, ${BUSINESS_ID("f.business_id")},
            coalesce(f.status, 'pending'), coalesce(f.is_global, false), coalesce(f.sort_order, 0)
       FROM v1_staging.fee_types f
     ON CONFLICT (lower(name)) WHERE deleted_at IS NULL DO UPDATE SET
       slug = EXCLUDED.slug, business_id = EXCLUDED.business_id, status = EXCLUDED.status,
       is_global = EXCLUDED.is_global, sort_order = EXCLUDED.sort_order, updated_at = now()`,
  );

  // ── business_category_default_services (junction, defect D8) ───────────────
  await assertTargetColumns(ctx.db, "public", "business_category_default_services", ["business_category_id", "service_category_id"]);
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "business_category_default_services",
    targetTable: "public.business_category_default_services",
    column: "business_category_id",
    reasonCode: "unresolved_category",
    sql: `SELECT d.id::text, 'business_category ' || d.business_category_id::text || ' or service_category '
                 || d.service_category_id::text || ' did not resolve to a V3 row'
            FROM v1_staging.business_category_default_services d
           WHERE NOT EXISTS (SELECT 1 FROM v1_staging.business_categories vbc
                               JOIN public.business_categories bc ON bc.slug = vbc.slug AND bc.deleted_at IS NULL
                              WHERE vbc.id = d.business_category_id)
              OR NOT EXISTS (SELECT 1 FROM v1_staging.service_categories vsc
                               JOIN public.service_categories sc ON sc.slug = vsc.slug AND sc.deleted_at IS NULL
                              WHERE vsc.id = d.service_category_id)`,
  });

  await assertParentCounts(ctx, "public.business_category_default_services", [
    { label: "business_categories", stagingTable: "business_categories", targetTable: "public.business_categories", targetFilter: "deleted_at IS NULL" },
    { label: "service_categories", stagingTable: "service_categories", targetTable: "public.service_categories", targetFilter: "deleted_at IS NULL" },
  ]);

  await execWrite(
    ctx,
    "public.business_category_default_services",
    `INSERT INTO public.business_category_default_services (business_category_id, service_category_id)
     SELECT bc.id, sc.id
       FROM v1_staging.business_category_default_services d
       JOIN v1_staging.business_categories vbc ON vbc.id = d.business_category_id
       JOIN v1_staging.service_categories vsc ON vsc.id = d.service_category_id
       JOIN public.business_categories bc ON bc.slug = vbc.slug AND bc.deleted_at IS NULL
       JOIN public.service_categories sc ON sc.slug = vsc.slug AND sc.deleted_at IS NULL
     ON CONFLICT (business_category_id, service_category_id) DO NOTHING`,
  );

  // ── accreditations ─────────────────────────────────────────────────────────
  // public.accreditations has no UNIQUE on name, so the natural-key upsert is
  // spelled out: update what matches, insert what does not. Both halves are
  // keyed on lower(btrim(name)), the identity Gate 2 compares on.
  await assertTargetColumns(ctx.db, "public", "accreditations", [
    "name", "issuing_organization_id", "website", "description", "business_id", "is_global", "status", "sort_order",
  ]);

  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "accreditations",
    targetTable: "public.accreditations",
    column: "issuing_organization_id",
    reasonCode: "unresolved_parent",
    sql: `SELECT ac.name, 'issuing organisation "' || ac.issuing_organization || '" has no issuing_organizations row'
            FROM v1_staging.accreditations ac
           WHERE btrim(coalesce(ac.issuing_organization, '')) <> '' AND ${ISSUING_ORG_ID} IS NULL`,
  });

  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "accreditations",
    targetTable: "public.accreditations",
    column: "business_id",
    reasonCode: "unresolved_business",
    sql: `SELECT ac.name, 'owning business ' || ac.business_id::text || ' did not migrate to public.businesses'
            FROM v1_staging.accreditations ac
           WHERE ac.business_id IS NOT NULL AND ${BUSINESS_ID("ac.business_id")} IS NULL`,
  });

  const ACCRED_VALUES = `${ISSUING_ORG_ID}, ac.website, ac.description, ${BUSINESS_ID("ac.business_id")},
                         coalesce(ac.is_global, false), coalesce(ac.status, 'pending'), coalesce(ac.sort_order, 0)`;

  await execWrite(
    ctx,
    "public.accreditations (updated)",
    `UPDATE public.accreditations t
        SET issuing_organization_id = ${ISSUING_ORG_ID}, website = ac.website, description = ac.description,
            business_id = ${BUSINESS_ID("ac.business_id")}, is_global = coalesce(ac.is_global, false),
            status = coalesce(ac.status, 'pending'), sort_order = coalesce(ac.sort_order, 0), updated_at = now()
       FROM v1_staging.accreditations ac
      WHERE t.deleted_at IS NULL AND lower(btrim(t.name)) = lower(btrim(ac.name))`,
  );

  await execWrite(
    ctx,
    "public.accreditations",
    `INSERT INTO public.accreditations (name, issuing_organization_id, website, description, business_id, is_global, status, sort_order)
     SELECT ac.name, ${ACCRED_VALUES}
       FROM v1_staging.accreditations ac
      WHERE NOT EXISTS (SELECT 1 FROM public.accreditations t
                         WHERE t.deleted_at IS NULL AND lower(btrim(t.name)) = lower(btrim(ac.name)))`,
  );

  // ── accreditation_scope_countries ──────────────────────────────────────────
  // V1's text[] of country names becomes join rows. Converging means BOTH
  // directions: add what the source has, and remove what it no longer has —
  // otherwise a scope narrowed in V1 stays wide in V3 forever.
  await assertTargetColumns(ctx.db, "public", "accreditation_scope_countries", ["accreditation_id", "country_id"]);
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "accreditations",
    targetTable: "public.accreditation_scope_countries",
    column: "country_id",
    reasonCode: "unresolved_country",
    sql: `SELECT ac.name, 'scope country "' || sc.v || '" did not resolve to a countries row'
            FROM v1_staging.accreditations ac, unnest(coalesce(ac.scope_countries, '{}'::text[])) AS sc(v)
           WHERE btrim(coalesce(sc.v, '')) <> ''
             AND NOT EXISTS (SELECT 1 FROM mig.map_countries mc WHERE mc.key = ${normKeySql("sc.v")})`,
  });

  await assertParentCounts(ctx, "public.accreditation_scope_countries", [
    { label: "accreditations", stagingTable: "accreditations", targetTable: "public.accreditations", targetFilter: "deleted_at IS NULL" },
    { label: "countries", stagingTable: "countries", targetTable: "public.countries", targetFilter: "deleted_at IS NULL" },
  ]);

  const SCOPE_SOURCE = `
    SELECT t.id AS accreditation_id, mc.id AS country_id
      FROM v1_staging.accreditations ac
      JOIN public.accreditations t ON t.deleted_at IS NULL AND lower(btrim(t.name)) = lower(btrim(ac.name))
      CROSS JOIN LATERAL unnest(coalesce(ac.scope_countries, '{}'::text[])) AS sc(v)
      JOIN mig.map_countries mc ON mc.key = ${normKeySql("sc.v")}`;

  await execWrite(
    ctx,
    "public.accreditation_scope_countries",
    `INSERT INTO public.accreditation_scope_countries (accreditation_id, country_id)
     SELECT DISTINCT accreditation_id, country_id FROM (${SCOPE_SOURCE}) s
     ON CONFLICT (accreditation_id, country_id) DO NOTHING`,
  );

  await execWrite(
    ctx,
    "public.accreditation_scope_countries (pruned)",
    `DELETE FROM public.accreditation_scope_countries x
      WHERE EXISTS (SELECT 1 FROM v1_staging.accreditations ac
                      JOIN public.accreditations t ON t.deleted_at IS NULL AND lower(btrim(t.name)) = lower(btrim(ac.name))
                     WHERE t.id = x.accreditation_id)
        AND NOT EXISTS (SELECT 1 FROM (${SCOPE_SOURCE}) s
                         WHERE s.accreditation_id = x.accreditation_id AND s.country_id = x.country_id)`,
  );

  // ── the repair W2 owes W1 ──────────────────────────────────────────────────
  // W1 loaded businesses before public.business_categories existed, so all 16
  // got a NULL business_category_id. Now that the categories are here, the
  // reference is re-resolved from the V1 uuid through the slug bridge. The count
  // is expected to be non-zero on the FIRST run of this wave and zero on every
  // one after — that is what makes it a repair rather than a load.
  await execWrite(
    ctx,
    "public.businesses (category FK repair)",
    `UPDATE public.businesses t
        SET business_category_id = bc.id, updated_at = now()
       FROM v1_staging.businesses b
       JOIN v1_staging.business_categories vbc ON vbc.id = b.business_category_id
       JOIN public.business_categories bc ON bc.slug = vbc.slug AND bc.deleted_at IS NULL
      WHERE t.meta->>'v1_business_id' = b.id::text
        AND t.business_category_id IS DISTINCT FROM bc.id`,
  );
}

export function referenceSelfCheck(): void {
  // The natural keys this wave upserts on must be the ones Gate 2 compares on,
  // or "idempotent" and "verified" are two different claims about two different
  // keys.
  assert.ok(ISSUING_ORG_ID.includes("lower(btrim("), "issuing organisations resolve case- and space-insensitively");
  assert.ok(BUSINESS_ID("x").includes("mig.map_businesses"), "business references go through the W1 resolver view, never a fresh join");
  assert.ok(normKeySql("x").includes("NFKD"), "scope countries use the shared canonicaliser");

  // A fee or accreditation owned by a business that did not migrate must be
  // reported, not silently promoted to global.
  assert.ok(!BUSINESS_ID("x").includes("coalesce"), "an unresolved owner is NULL + a report, never a default");

  // schema_fields: the six keys V3 has a column for, and nothing else. Growing
  // this list without growing the table is how `step` would end up in `options`.
  assert.deepEqual([...SCHEMA_FIELD_KEYS].sort(), ["filterable", "key", "label", "options", "required", "type"]);
  const fields = FIELDS_OF("service_categories");
  assert.ok(fields.includes("WITH ORDINALITY"), "which of two same-key definitions wins must be a decision, not array order luck");
  assert.ok(fields.includes("jsonb_typeof(s.schema_fields) = 'array'"), "a null or object jsonb must expand to nothing, not throw");
  assert.ok(fields.includes("row_number()"), "a duplicate key must be reported, not silently upserted twice in one statement");

  console.log(`w2-reference self-check: ok — ${SCHEMA_FIELD_KEYS.length} schema_field keys carried`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await runTransform({ wave: "W2-reference", body: transformReference, selfCheck: referenceSelfCheck }));
}
