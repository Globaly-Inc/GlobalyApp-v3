// Loads V1 reference data into V3 (plan M1), in FK-safe order and remapping
// every uuid primary key onto V3's serials.
//
//   node database/scripts/import-v1-reference.mjs               # dry run (default)
//   node database/scripts/import-v1-reference.mjs --apply       # write
//   node database/scripts/import-v1-reference.mjs --self-check  # pure-fn asserts
//
// Order: degree_levels, areas_of_study, issuing_organizations, service_categories,
// business_categories -> fee_types, business_category_default_services,
// core_field_settings -> schema_fields -> accreditations + scope countries.
//
// public is canonical. superadmin.{degree_levels,fee_types,accreditations} are a
// separate, differently shaped copy owned by the extraction pipeline; this script
// reports the divergence and does not touch them.
//
// Idempotent: every table upserts on its natural key (slug / lower(name) /
// composite), so a second --apply inserts nothing.

import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

import { buildCountryResolver, normalizeCountry } from "./recon-v2-users.mjs";
import { mapFieldType, parseArgs, printList, upsertBy, withMigration } from "./migrate-lib.mjs";

// ── Pure helpers (covered by --self-check) ──────────────────────────────────

/**
 * V1 core_field_settings are platform-wide "core" fields with no owning row,
 * while V3 schema_fields is polymorphic and needs (entity_id, entity_type).
 * Entity id 0 is the sentinel for "core field, not scoped to a category row" —
 * it satisfies NOT NULL, matches no category, and is reversible.
 */
export const CORE_FIELD_ENTITY_ID = 0;

export function toSchemaField(row) {
  return {
    entity_id: CORE_FIELD_ENTITY_ID,
    entity_type: row.entity_type,
    is_default: true,
    label: row.label,
    key: row.field_key,
    type: mapFieldType(row.field_type),
    is_required: row.is_required === true,
    filterable: row.is_filterable === true,
    options: row.options === null || row.options === undefined ? null : JSON.stringify(row.options),
  };
}

/** V1 accreditations.status feeds a CHECK constraint in V3. */
export function normalizeStatus(status) {
  const allowed = ["pending", "approved", "rejected"];
  const v = typeof status === "string" ? status.trim().toLowerCase() : "";
  return allowed.includes(v) ? v : null;
}

// ── Simple lookup tables ────────────────────────────────────────────────────

/** Load a V1 table into V3 keyed on `matchColumn`, returning uuid -> V3 id. */
async function loadLookup(v1, v3, { table, columns, matchColumn, report }) {
  const { rows } = await v1.query(`SELECT id::text AS uuid, ${columns.join(", ")} FROM public.${table}`);
  const idByUuid = new Map();
  for (const row of rows) {
    const values = Object.fromEntries(columns.map((c) => [c, row[c] ?? null]));
    const { id, inserted } = await upsertBy(v3, `public.${table}`, { [matchColumn]: row[matchColumn] }, values);
    idByUuid.set(row.uuid, id);
    tally(report, table, inserted);
  }
  return idByUuid;
}

// ── Tables needing more than a column copy ──────────────────────────────────

async function loadFeeTypes(v1, v3, businessIdByV1, report) {
  const { rows } = await v1.query(
    `SELECT id::text AS uuid, name, slug, business_id::text AS v1_business_id, status, is_global, sort_order
       FROM public.fee_types ORDER BY sort_order, name`,
  );
  for (const row of rows) {
    let businessId = null;
    if (row.v1_business_id) {
      businessId = businessIdByV1.get(row.v1_business_id) ?? null;
      if (businessId === null) {
        report.orphanedBusinessRefs.push({ table: "fee_types", name: row.name, v1_business_id: row.v1_business_id });
      }
    }
    const status = normalizeStatus(row.status);
    if (status === null) report.unmappedStatuses.push({ table: "fee_types", name: row.name, status: row.status });

    const { inserted } = await upsertBy(
      v3,
      "public.fee_types",
      { "lower(name)": row.name.toLowerCase() },
      {
        name: row.name,
        slug: row.slug,
        business_id: businessId,
        status: status ?? "pending",
        is_global: row.is_global === true,
        sort_order: row.sort_order ?? 0,
      },
    );
    tally(report, "fee_types", inserted);
  }
}

async function loadDefaultServices(v1, v3, businessCatIds, serviceCatIds, report) {
  const { rows } = await v1.query(
    `SELECT business_category_id::text AS bc, service_category_id::text AS sc
       FROM public.business_category_default_services`,
  );
  for (const row of rows) {
    const bc = businessCatIds.get(row.bc);
    const sc = serviceCatIds.get(row.sc);
    if (bc === undefined || sc === undefined) {
      report.danglingJunctions.push({ table: "business_category_default_services", ...row });
      continue;
    }
    const res = await v3.query(
      `INSERT INTO public.business_category_default_services (business_category_id, service_category_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [bc, sc],
    );
    tally(report, "business_category_default_services", res.rowCount === 1);
  }
}

async function loadSchemaFields(v1, v3, report) {
  const { rows } = await v1.query(
    `SELECT field_key, label, field_type, is_required, is_filterable, is_visible,
            options, sort_order, entity_type, integrations, section
       FROM public.core_field_settings ORDER BY entity_type, sort_order, field_key`,
  );
  for (const row of rows) {
    const field = toSchemaField(row);
    report.fieldTypes.add(`${row.field_type} -> ${field.type}`);
    const { inserted } = await upsertBy(
      v3,
      "public.schema_fields",
      { entity_id: field.entity_id, entity_type: field.entity_type, key: field.key },
      field,
    );
    tally(report, "schema_fields", inserted);
  }
  // Columns with nowhere to land in schema_fields.
  report.droppedFields.push(
    "core_field_settings.is_visible", "core_field_settings.sort_order",
    "core_field_settings.integrations", "core_field_settings.section",
    "core_field_settings.updated_at",
  );
}

async function loadAccreditations(v1, v3, orgIdByName, businessIdByV1, resolveCountry, report) {
  const { rows } = await v1.query(
    `SELECT id::text AS uuid, name, issuing_organization, website, description,
            business_id::text AS v1_business_id, is_global, status, sort_order, scope_countries
       FROM public.accreditations ORDER BY sort_order, name`,
  );

  for (const row of rows) {
    let businessId = null;
    if (row.v1_business_id) {
      businessId = businessIdByV1.get(row.v1_business_id) ?? null;
      if (businessId === null) {
        // The business was never migrated. Do not dangle the FK and do not drop
        // the row — widen it to global scope and name it in the report.
        report.orphanedBusinessRefs.push({
          table: "accreditations", name: row.name, v1_business_id: row.v1_business_id,
          resolution: "business_id NULLed -> global scope",
        });
      }
    }

    const orgId = row.issuing_organization
      ? orgIdByName.get(normalizeCountry(row.issuing_organization)) ?? null
      : null;
    if (row.issuing_organization && orgId === null) {
      report.unresolvedOrganizations.push({ accreditation: row.name, organization: row.issuing_organization });
    }

    const status = normalizeStatus(row.status);
    if (status === null) report.unmappedStatuses.push({ table: "accreditations", name: row.name, status: row.status });

    const { id, inserted } = await upsertBy(
      v3,
      "public.accreditations",
      { "lower(name)": row.name.toLowerCase() },
      {
        name: row.name,
        issuing_organization_id: orgId,
        website: row.website ?? null,
        description: row.description ?? null,
        business_id: businessId,
        is_global: row.is_global === true,
        status: status ?? "pending",
        sort_order: row.sort_order ?? 0,
      },
    );
    tally(report, "accreditations", inserted);

    // Rewrite the scope set from source: idempotent and picks up V1 removals.
    await v3.query(`DELETE FROM public.accreditation_scope_countries WHERE accreditation_id = $1`, [id]);
    for (const country of row.scope_countries ?? []) {
      const countryId = resolveCountry(country);
      if (countryId === null) {
        report.unresolvedScopeCountries.push({ accreditation: row.name, value: country });
        continue;
      }
      await v3.query(
        `INSERT INTO public.accreditation_scope_countries (accreditation_id, country_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [id, countryId],
      );
      tally(report, "accreditation_scope_countries", true);
    }
  }
}

/** superadmin keeps its own copies for the extraction pipeline. Report, never merge. */
async function reportSuperadminDivergence(v3, report) {
  for (const table of ["degree_levels", "fee_types", "accreditations"]) {
    const { rows } = await v3.query(
      `SELECT count(*)::int AS n,
              (SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
                 FROM information_schema.columns
                WHERE table_schema = 'superadmin' AND table_name = $1) AS columns
         FROM superadmin.${table}`,
      [table],
    );
    const pub = await v3.query(
      `SELECT (SELECT count(*)::int FROM public.${table}) AS n,
              (SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
                 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = $1) AS columns`,
      [table],
    );
    report.superadminDivergence.push({
      table,
      superadmin: { rows: rows[0].n, columns: rows[0].columns },
      public: { rows: pub.rows[0].n, columns: pub.rows[0].columns },
    });
  }
}

function tally(report, table, inserted) {
  report.counts[table] = report.counts[table] ?? { source: 0, inserted: 0, updated: 0 };
  report.counts[table].source++;
  report.counts[table][inserted ? "inserted" : "updated"]++;
}

// ── Self-check ──────────────────────────────────────────────────────────────

function selfCheck() {
  const field = toSchemaField({
    field_key: "study_level", label: "Study Level", field_type: "multi-select",
    is_required: true, is_filterable: false, entity_type: "business", options: ["a", "b"],
  });
  assert.equal(field.key, "study_level");
  assert.equal(field.type, "multi_select"); // the only V1 type V3 spells differently
  assert.equal(field.is_required, true);
  assert.equal(field.filterable, false);
  assert.equal(field.entity_id, 0);
  assert.equal(field.entity_type, "business");
  assert.equal(field.options, '["a","b"]');
  assert.equal(toSchemaField({ field_key: "k", label: "L", field_type: "text", entity_type: "user" }).options, null);
  assert.equal(mapFieldType("db_country"), "db_country"); // unknown types pass through

  assert.equal(normalizeStatus("approved"), "approved");
  assert.equal(normalizeStatus(" Pending "), "pending");
  assert.equal(normalizeStatus("archived"), null); // would violate the CHECK
  assert.equal(normalizeStatus(null), null);

  console.log("self-check: all assertions passed");
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfCheck) return selfCheck();

  const report = {
    counts: {},
    orphanedBusinessRefs: [],
    unresolvedOrganizations: [],
    unresolvedScopeCountries: [],
    unmappedStatuses: [],
    danglingJunctions: [],
    droppedFields: [],
    superadminDivergence: [],
    fieldTypes: new Set(),
  };

  await withMigration({ apply: args.apply, label: "V1 -> V3 reference data import" }, async (v1, v3) => {
    // uuid -> V3 id for the businesses that actually made it across.
    const { rows: businesses } = await v3.query(
      `SELECT id, meta->>'v1_business_id' AS v1_id FROM public.businesses WHERE meta ? 'v1_business_id'`,
    );
    const businessIdByV1 = new Map(businesses.map((b) => [b.v1_id, b.id]));

    const { rows: countries } = await v3.query(`SELECT id, name, iso2, iso3 FROM public.countries`);
    const resolveCountry = buildCountryResolver(countries);

    // 1-5: plain lookups, no FKs of their own.
    await loadLookup(v1, v3, { table: "degree_levels", columns: ["name", "slug", "sort_order", "is_active"], matchColumn: "slug", report });
    await loadLookup(v1, v3, { table: "areas_of_study", columns: ["name", "slug", "sort_order", "is_active"], matchColumn: "slug", report });
    await loadLookup(v1, v3, { table: "issuing_organizations", columns: ["name", "logo_url", "website"], matchColumn: "name", report });
    const serviceCatIds = await loadLookup(v1, v3, {
      table: "service_categories",
      columns: ["slug", "name", "description", "icon", "is_active", "sort_order"],
      matchColumn: "slug", report,
    });
    const businessCatIds = await loadLookup(v1, v3, {
      table: "business_categories",
      columns: ["slug", "name", "description", "icon", "is_active", "sort_order"],
      matchColumn: "slug", report,
    });
    report.droppedFields.push(
      "service_categories.schema_fields (jsonb; V3 uses the schema_fields table)",
      "business_categories.schema_fields (jsonb; V3 uses the schema_fields table)",
    );

    // 6-7: rows with FKs into the above.
    await loadFeeTypes(v1, v3, businessIdByV1, report);
    await loadDefaultServices(v1, v3, businessCatIds, serviceCatIds, report);

    // 8: core field settings -> polymorphic schema_fields.
    await loadSchemaFields(v1, v3, report);

    // 9: accreditations + scope junction.
    const { rows: orgs } = await v3.query(`SELECT id, name FROM public.issuing_organizations`);
    const orgIdByName = new Map(orgs.map((o) => [normalizeCountry(o.name), o.id]));
    await loadAccreditations(v1, v3, orgIdByName, businessIdByV1, resolveCountry, report);

    await reportSuperadminDivergence(v3, report);
  });

  console.log("\ntable                                source  inserted  updated");
  for (const [table, c] of Object.entries(report.counts)) {
    console.log(`  ${table.padEnd(34)} ${String(c.source).padStart(5)} ${String(c.inserted).padStart(9)} ${String(c.updated).padStart(8)}`);
  }

  printList("ORPHANED business references", report.orphanedBusinessRefs,
    (r) => `${r.table}: "${r.name}" v1_business_id=${r.v1_business_id}${r.resolution ? ` (${r.resolution})` : ""}`);
  printList("unresolved issuing organizations (FK left NULL)", report.unresolvedOrganizations,
    (r) => `${r.accreditation}: "${r.organization}"`);
  printList("UNRESOLVED scope countries (no junction row)", report.unresolvedScopeCountries,
    (r) => `${r.accreditation}: "${r.value}"`);
  printList("unmapped statuses (defaulted to pending)", report.unmappedStatuses,
    (r) => `${r.table} "${r.name}": ${r.status}`);
  printList("dangling junction rows (not loaded)", report.danglingJunctions);
  printList("field type mappings", [...report.fieldTypes], (t) => t);
  printList("V1 fields with no V3 column (dropped)", report.droppedFields, (f) => f);

  console.log("\npublic vs superadmin (public is canonical; superadmin left untouched):");
  for (const d of report.superadminDivergence) {
    console.log(`  ${d.table}`);
    console.log(`    public     rows=${d.public.rows}  [${d.public.columns}]`);
    console.log(`    superadmin rows=${d.superadmin.rows}  [${d.superadmin.columns}]`);
  }

  if (args.json) console.log(JSON.stringify({ ...report, fieldTypes: [...report.fieldTypes] }, null, 2));
}

// Only run when invoked directly — the tests import the pure helpers above.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
