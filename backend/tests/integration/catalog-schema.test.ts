// Wave B2 schema guard: the claimable-institutions model, the master-side
// cross-tenant tables, and the per-tenant service catalog. Real Postgres —
// the tenant half provisions a throwaway schema and runs the business
// migration set against it, the same path provisionBusinessSchema uses.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dbAvailable } from "../helpers/db.js";

const describeDb = describe.skipIf(!dbAvailable);

const TENANT_TABLES = [
  "business_services",
  "service_fees",
  "service_fee_structures",
  "service_fee_installments",
  "service_intakes",
  "service_eligibility_requirements",
  "service_study_options",
  "service_study_units",
  "service_fee_assignments",
  "service_intake_assignments",
  "service_eligibility_assignments",
  "service_accreditation_assignments",
  "service_study_option_assignments",
  "service_study_unit_assignments",
] as const;

const MASTER_TABLES = [
  "business_branches",
  "representations",
  "service_branch_sharing",
  "service_study_option_branches",
  "business_allowed_categories",
] as const;

describeDb("catalog schema", () => {
  let masterKnex: import("knex").Knex;
  let tenantKnex: import("knex").Knex;
  let schema: string;

  beforeAll(async () => {
    ({ masterKnex } = await import("../../src/core/db/master-pool.js"));
    const { createSchemaKnex } = await import("../../src/core/db/knex.js");

    const [{ uuid }] = (await masterKnex.raw("select gen_random_uuid() as uuid")).rows;
    schema = uuid as string;
    await masterKnex.raw(`CREATE SCHEMA "${schema}"`);

    tenantKnex = createSchemaKnex(schema, { min: 0, max: 1 });
    await tenantKnex.migrate.latest({ directory: "./database/migrations/business", schemaName: schema });
  });

  afterAll(async () => {
    await tenantKnex?.destroy();
    if (schema) await masterKnex.raw(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  });

  it("lets an institution exist unowned", async () => {
    const [row] = await masterKnex("institutions")
      .insert({ institution_name: "Unclaimed College", v1_business_id: masterKnex.raw("gen_random_uuid()") })
      .returning(["id", "claim_status", "platform_user_id", "email", "subdomain"]);

    expect(row.claim_status).toBe("unclaimed");
    expect(row.platform_user_id).toBeNull();
    expect(row.email).toBeNull();
    expect(row.subdomain).toBeNull();

    await expect(
      masterKnex("institutions").where({ id: row.id }).update({ claim_status: "bogus" }),
    ).rejects.toThrow();

    await masterKnex("institutions").where({ id: row.id }).del();
  });

  it("keeps language and academic tests in one table", async () => {
    const { rows } = await masterKnex.raw(`
      select column_default, is_nullable
        from information_schema.columns
       where table_name = 'platform_user_language_tests' and column_name = 'category'
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0].is_nullable).toBe("NO");
    expect(rows[0].column_default).toContain("language");
  });

  it("creates the master-side cross-tenant tables", async () => {
    const { rows } = await masterKnex.raw(
      `select table_name from information_schema.tables
        where table_schema = current_schema() and table_name = ANY(?)`,
      [[...MASTER_TABLES]],
    );
    expect(rows.map((r: { table_name: string }) => r.table_name).sort()).toEqual([...MASTER_TABLES].sort());
  });

  it("creates the full catalog in a freshly provisioned tenant schema", async () => {
    const { rows } = await masterKnex.raw(
      `select table_name from information_schema.tables where table_schema = ? and table_name = ANY(?)`,
      [schema, [...TENANT_TABLES]],
    );
    expect(rows.map((r: { table_name: string }) => r.table_name).sort()).toEqual([...TENANT_TABLES].sort());
  });

  it("cascades child rows and rejects duplicate junction pairs", async () => {
    const [service] = await tenantKnex("business_services")
      .insert({ name: "Bachelor of Testing" })
      .returning("id");
    const [intake] = await tenantKnex("service_intakes")
      .insert({ service_id: service.id, intake_name: "Feb 2026" })
      .returning("id");

    await tenantKnex("service_intake_assignments").insert({ service_id: service.id, intake_id: intake.id });
    await expect(
      tenantKnex("service_intake_assignments").insert({ service_id: service.id, intake_id: intake.id }),
    ).rejects.toThrow();

    await tenantKnex("business_services").where({ id: service.id }).del();
    expect(await tenantKnex("service_intakes").count({ n: "*" })).toEqual([{ n: "0" }]);
    expect(await tenantKnex("service_intake_assignments").count({ n: "*" })).toEqual([{ n: "0" }]);
  });
});
