// Two things the promote pipeline needs from every tenant catalog:
//
// 1. An idempotency key for extraction-sourced rows.
//    The catalog already carries `v1_id` — the key the V1 loader dedupes on.
//    Reusing it for extraction rows would overload one column with two unrelated
//    provenances and let a V1 service and an extracted service collide on a uuid
//    that means different things in each system. So extraction gets its own
//    nullable column, `extraction_source_id`, holding the staging row's uuid.
//
//    Uniqueness differs by table on purpose:
//      - business_services: UNIQUE(extraction_source_id) — one staged course
//        promotes to exactly one live service.
//      - service_fees / service_intakes / service_eligibility_requirements:
//        UNIQUE(service_id, extraction_source_id) — staging shares one fee or
//        requirement across many courses via a junction, and the live tables put
//        service_id on the row, so one staged row legitimately becomes N live
//        rows, one per service.
//      - service_study_options / service_study_units: UNIQUE(extraction_source_id)
//        — these live tables have no service_id; the junction carries the link
//        and already has its own (service_id, target) unique.
//
// 2. The projection triggers.
//    See globalyapp/20260817_010_catalog_services.ts for why the master-side
//    projection is trigger-maintained. business_services drives identity;
//    service_fees and service_intakes drive the fee-range and intake facets, so
//    all three refresh it. The other children are not filterable facets, so they
//    do not need a trigger — add one here if a facet starts depending on them.
//
// Requires public.catalog_project_service() to exist, i.e. the globalyapp
// migrations must be applied before tenant migrations (Makefile order).

import type { Knex } from "knex";

const PER_SERVICE_UNIQUE = ["service_fees", "service_intakes", "service_eligibility_requirements"] as const;
const GLOBALLY_UNIQUE = ["business_services", "service_study_options", "service_study_units"] as const;

const TRIGGERS = [
  { table: "business_services", fn: "catalog_project_from_service" },
  { table: "service_fees", fn: "catalog_project_from_child" },
  { table: "service_intakes", fn: "catalog_project_from_child" },
] as const;

export async function up(knex: Knex): Promise<void> {
  for (const table of [...GLOBALLY_UNIQUE, ...PER_SERVICE_UNIQUE]) {
    await knex.schema.alterTable(table, (t) => {
      t.uuid("extraction_source_id").nullable();
    });
  }

  for (const table of GLOBALLY_UNIQUE) {
    await knex.schema.alterTable(table, (t) => {
      t.unique(["extraction_source_id"], { indexName: `${table}_extraction_source_unique` });
    });
  }

  for (const table of PER_SERVICE_UNIQUE) {
    await knex.schema.alterTable(table, (t) => {
      t.unique(["service_id", "extraction_source_id"], { indexName: `${table}_extraction_source_unique` });
    });
  }

  for (const { table, fn } of TRIGGERS) {
    await knex.raw(`
      CREATE TRIGGER catalog_project_${table}
        AFTER INSERT OR UPDATE OR DELETE ON "${table}"
        FOR EACH ROW EXECUTE FUNCTION public.${fn}()
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const { table } of TRIGGERS) {
    await knex.raw(`DROP TRIGGER IF EXISTS catalog_project_${table} ON "${table}"`);
  }

  for (const table of [...GLOBALLY_UNIQUE, ...PER_SERVICE_UNIQUE]) {
    await knex.schema.alterTable(table, (t) => {
      t.dropUnique([], `${table}_extraction_source_unique`);
      t.dropColumn("extraction_source_id");
    });
  }
}
