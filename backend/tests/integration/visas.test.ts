// Visas / MARA public directory + the two promote paths (Wave G1).
//
// Contract under test:
//   * V1 RPCs search_visas / get_visa_detail / search_mara_agents /
//     get_mara_agent_detail, as read by usePublicVisas / usePublicMaraAgents,
//     and their V2 restatements in routes/visas.ts and routes/agents.ts.
//   * The promote RPCs §3.4 records as stubbed: promote_visa_to_service and
//     promote_mara_to_business, whose targets (visa_service_details,
//     agent_mara_details) had no V3 migration at all.
//   * The extract launch, which stays a fail-closed 503 (§3.8) — asserted to be
//     503 and not the 400 the current param-name mismatch produces.
//
// A visa is a *service* in a tenant schema, so the promote test provisions a real
// tenant schema. Everything else is master-schema only. No network, no provider.

import Fastify, { type FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dbAvailable, uniqueEmail } from "../helpers/db.js";

const describeDb = describe.skipIf(!dbAvailable);

/**
 * Contact details the staging row holds and the public directory must never
 * surface. V2's agent_mara_details carries none of them by design; this asserts
 * the promote path did not "helpfully" copy them across either.
 */
const MARA_PII_FIELDS = ["email", "phone", "office_address", "confidence_score", "raw_payload"];

describeDb("visas + MARA directory", () => {
  let app: FastifyInstance;
  let masterKnex: Knex;
  let shutdownPools: () => Promise<void>;
  let immigration: typeof import("../../src/modules/superadmin/data-extraction/services/immigration.service.js");

  let runId = "";
  let deptOrgId = 0;
  let deptSchema = "";
  let visaStagedId = "";
  let maraStagedId = "";
  let marn = "";
  let adminId = 0;

  beforeAll(async () => {
    const jwt = (await import("jsonwebtoken")).default;
    ({ masterKnex } = await import("../../src/core/db/master-pool.js"));
    ({ shutdownAll: shutdownPools } = await import("../../src/core/db/pool-manager.js"));
    const { config } = (await import("../../src/config.js")) as unknown as {
      config: Record<string, unknown>;
    };
    immigration = await import(
      "../../src/modules/superadmin/data-extraction/services/immigration.service.js"
    );

    const { errorHandlerPlugin } = await import("../../src/core/plugins/error-handler.plugin.js");
    const { requestContextPlugin } = await import("../../src/core/plugins/request-context.plugin.js");
    const { publicVisasModule } = await import("../../src/modules/visas/index.js");

    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    await app.register(requestContextPlugin);
    await app.register(publicVisasModule);
    await app.ready();

    runId = `${process.pid}${Date.now() % 1_000_000}`;
    marn = `MARN${runId}`;

    // The visa department: an unclaimed institution, which is what V3 uses for a
    // directory org nobody owns (20260816_001_institutions_claimable.ts).
    const [dept] = await masterKnex("institutions")
      .insert({
        institution_name: `Department of Immigration ${runId}`,
        email: uniqueEmail("visas.dept"),
        claim_status: "unclaimed",
        status: "pending",
        is_published: false,
        schema_name: masterKnex.raw("gen_random_uuid()"),
      })
      .returning(["id", "schema_name"]);
    deptOrgId = dept.id;
    deptSchema = dept.schema_name;

    const { provisionBusinessSchema } = await import("../../src/core/business/provisioner.js");
    await provisionBusinessSchema(deptSchema);

    const [visa] = await masterKnex("superadmin.extraction_visas")
      .insert({
        status: "pending",
        country_code: "AU",
        subclass_code: `500-${runId}`,
        visa_stream: "Higher Education",
        category: "Student",
        name: `Student visa ${runId}`,
        description: "Study full time in Australia.",
        duration_months: 60,
        is_permanent: false,
        points_test_required: false,
        english_requirements: JSON.stringify({ ielts: 6.0 }),
        work_rights: JSON.stringify({ hours_per_fortnight: 48 }),
        age_min: 6,
        eligible_nationalities: ["NP", "IN"],
        application_fee_amount: 1600,
        application_fee_currency: "AUD",
        processing_time_min_days: 20,
        processing_time_max_days: 60,
        official_url: "https://immi.example/500",
        source_url: "https://immi.example/500",
        confidence_score: 0.91,
      })
      .returning(["id"]);
    visaStagedId = visa.id;

    const [mara] = await masterKnex("superadmin.extraction_mara_agents")
      .insert({
        status: "pending",
        marn,
        // V1's promote RPC read a `full_name` column that does not exist and
        // raised on every promote (§3.4). The real column is agent_name.
        agent_name: `Agent ${runId}`,
        business_name: `Migration Co ${runId}`,
        registration_status: "Registered",
        registration_date: "2020-01-01",
        expiry_date: "2030-01-01",
        email: `secret.${runId}@example.com`,
        phone: "+61400000000",
        website: "https://migration.example",
        office_address: "1 Secret Lane",
        office_country: "Australia",
        office_state: "NSW",
        office_city: "Sydney",
        practice_areas: ["skilled", "family"],
        languages_spoken: ["English", "Nepali"],
        source_url: "https://mara.example/agent",
        confidence_score: 0.88,
      })
      .returning(["id"]);
    maraStagedId = mara.id;

    // The promote path writes an audit row, and admin_audit_logs.admin_id is a real
    // FK — a made-up id fails the insert, not the promote logic.
    const [adminUser] = await masterKnex("platform_users")
      .insert({ first_name: "Visa", last_name: "Admin", email: uniqueEmail("visas.admin"), account_status: 1 })
      .returning(["id"]);
    const [admin] = await masterKnex("superadmin.admin_users")
      .insert({ platform_user_id: adminUser.id, role: "super_admin" })
      .returning(["id"]);
    adminId = admin.id;
    void jwt;
    void config;
  });

  afterAll(async () => {
    await masterKnex?.("superadmin.extraction_visas").where({ id: visaStagedId }).del();
    await masterKnex?.("superadmin.extraction_mara_agents").where({ id: maraStagedId }).del();
    await app?.close();
    await shutdownPools?.();
    await masterKnex?.destroy();
  });

  const get = (url: string) => app.inject({ method: "GET", url });

  // ── promote: staging → live catalog ───────────────────────────────────────

  describe("promote_visa_to_service", () => {
    it("creates the tenant service and its visa_service_details row", async () => {
      const result = await immigration.promoteVisa(visaStagedId, "institution", deptOrgId, adminId);
      expect(result.service_id).toMatch(/^[0-9a-f-]{36}$/);

      const detail = await masterKnex("visa_service_details")
        .where({ service_id: result.service_id })
        .first();
      expect(detail).toBeTruthy();
      expect(detail.country_code).toBe("AU");
      expect(detail.subclass_code).toBe(`500-${runId}`);
      expect(detail.schema_name).toBe(deptSchema);
      expect(detail.extraction_source_id).toBe(visaStagedId);

      const service = await masterKnex("business_services")
        .withSchema(deptSchema)
        .where({ id: result.service_id })
        .first();
      expect(service.name).toBe(`Student visa ${runId}`);
      expect(service.is_published).toBe(true);
    });

    it("marks the staged row promoted and records the new service id", async () => {
      const staged = await masterKnex("superadmin.extraction_visas").where({ id: visaStagedId }).first();
      expect(staged.status).toBe("promoted");
      expect(staged.promoted_service_id).toBeTruthy();
    });

    it("is idempotent — a second promote updates in place", async () => {
      const before = await masterKnex("visa_service_details").count({ n: "*" }).first();
      const result = await immigration.promoteVisa(visaStagedId, "institution", deptOrgId, adminId);
      const after = await masterKnex("visa_service_details").count({ n: "*" }).first();
      expect(Number(after!.n)).toBe(Number(before!.n));
      expect(result.service_id).toBeTruthy();
    });

    it("404s an unknown staged id", async () => {
      await expect(
        immigration.promoteVisa("00000000-0000-0000-0000-000000000000", "institution", deptOrgId, adminId),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("404s an unknown target org", async () => {
      await expect(
        immigration.promoteVisa(visaStagedId, "institution", 99_999_999, adminId),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe("promote_mara_to_business", () => {
    it("creates the org from agent_name and its agent_mara_details row", async () => {
      const result = await immigration.promoteMara(maraStagedId, adminId);
      expect(result.org_id).toBeGreaterThan(0);

      const detail = await masterKnex("agent_mara_details").where({ marn }).first();
      expect(detail).toBeTruthy();
      expect(detail.org_id).toBe(result.org_id);
      expect(detail.org_type).toBe(result.org_type);
      expect(detail.registration_status).toBe("Registered");
      expect(detail.languages_spoken).toEqual(["English", "Nepali"]);

      // The V1 bug: its RPC read a non-existent `full_name` and raised every time.
      const org = await masterKnex(
        result.org_type === "business" ? "businesses" : "institutions",
      )
        .where({ id: result.org_id })
        .first();
      expect(org).toBeTruthy();
      const orgName = org.business_name ?? org.institution_name;
      expect(orgName).toContain(runId);
    });

    it("copies no contact PII onto the public detail table", async () => {
      const detail = await masterKnex("agent_mara_details").where({ marn }).first();
      for (const field of MARA_PII_FIELDS) {
        expect(Object.keys(detail)).not.toContain(field);
      }
    });

    it("marks the staged row promoted, leaving promoted_business_id null for an institution", async () => {
      const staged = await masterKnex("superadmin.extraction_mara_agents")
        .where({ id: maraStagedId })
        .first();
      expect(staged.status).toBe("promoted");
      // The staging column FKs public.businesses, so an unclaimed-institution
      // target cannot be recorded there. agent_mara_details carries the link.
      expect(staged.promoted_business_id).toBeNull();
      expect(await masterKnex("agent_mara_details").where({ marn }).first()).toBeTruthy();
    });

    it("is idempotent on the MARN", async () => {
      const before = await masterKnex("agent_mara_details").count({ n: "*" }).first();
      await immigration.promoteMara(maraStagedId, adminId);
      const after = await masterKnex("agent_mara_details").count({ n: "*" }).first();
      expect(Number(after!.n)).toBe(Number(before!.n));
    });
  });

  // ── the extract launch stays fail-closed ──────────────────────────────────

  describe("extract launch (503 stub)", () => {
    it("visa extract is 503, never a 400 from a mismatched param name", () => {
      expect(() => immigration.extractVisas({ urls: ["https://immi.example"] })).toThrow(
        expect.objectContaining({ statusCode: 503 }),
      );
    });

    it("MARA extract is 503", () => {
      expect(() => immigration.extractMara({ urls: ["https://mara.example"] })).toThrow(
        expect.objectContaining({ statusCode: 503 }),
      );
    });
  });

  // ── public visa directory (V1 search_visas / get_visa_detail) ─────────────

  describe("GET /api/v3/visas", () => {
    it("needs no token and returns the V1 summary shape", async () => {
      const res = await get(`/api/v3/visas?q=${runId}`);
      expect(res.statusCode).toBe(200);
      const rows = res.json();
      expect(Array.isArray(rows)).toBe(true);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        subclass_code: `500-${runId}`,
        country_code: "AU",
        category: "Student",
        visa_stream: "Higher Education",
        duration_months: 60,
        is_permanent: false,
        processing_time_min_days: 20,
      });
      expect(rows[0].department_name).toContain(runId);
      expect(typeof rows[0].service_id).toBe("string");
    });

    it("filters by country and category", async () => {
      expect((await get(`/api/v3/visas?q=${runId}&country=au`)).json()).toHaveLength(1);
      expect((await get(`/api/v3/visas?q=${runId}&country=NZ`)).json()).toHaveLength(0);
      expect((await get(`/api/v3/visas?q=${runId}&category=Student`)).json()).toHaveLength(1);
      expect((await get(`/api/v3/visas?q=${runId}&category=Work`)).json()).toHaveLength(0);
    });

    it("matches on subclass code as well as name", async () => {
      expect((await get(`/api/v3/visas?q=500-${runId}`)).json()).toHaveLength(1);
    });

    it("hides a visa whose service is unpublished", async () => {
      const detail = await masterKnex("visa_service_details")
        .where({ extraction_source_id: visaStagedId })
        .first();
      await masterKnex("business_services").withSchema(deptSchema)
        .where({ id: detail.service_id })
        .update({ is_published: false });
      expect((await get(`/api/v3/visas?q=${runId}`)).json()).toHaveLength(0);
      await masterKnex("business_services").withSchema(deptSchema)
        .where({ id: detail.service_id })
        .update({ is_published: true });
      expect((await get(`/api/v3/visas?q=${runId}`)).json()).toHaveLength(1);
    });

    it("returns the detail by (country, subclass)", async () => {
      const res = await get(`/api/v3/visas/AU/500-${runId}`);
      expect(res.statusCode).toBe(200);
      const row = res.json();
      expect(row.overview ?? row.description).toBeTruthy();
      expect(row.english_requirements).toEqual({ ielts: 6.0 });
      expect(row.work_rights).toEqual({ hours_per_fortnight: 48 });
      expect(row.eligible_nationalities).toEqual(["NP", "IN"]);
      expect(row.official_url).toBe("https://immi.example/500");
      expect(row.department_slug).toBeTruthy();
    });

    it("404s an unknown subclass", async () => {
      const res = await get(`/api/v3/visas/AU/nope-${runId}`);
      expect(res.statusCode).toBe(404);
      expect(res.json()).toHaveProperty("error");
    });
  });

  // ── public MARA directory (V1 search_mara_agents / get_mara_agent_detail) ─

  describe("GET /api/v3/migration-agents", () => {
    it("needs no token and returns the V1 summary shape", async () => {
      const res = await get(`/api/v3/migration-agents?q=${runId}`);
      expect(res.statusCode).toBe(200);
      const rows = res.json();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        marn,
        registration_status: "Registered",
        office_state: "NSW",
        office_city: "Sydney",
      });
      expect(rows[0].languages_spoken).toEqual(["English", "Nepali"]);
      expect(rows[0].business_slug).toBeTruthy();
    });

    it("filters by state", async () => {
      expect((await get(`/api/v3/migration-agents?q=${runId}&state=NSW`)).json()).toHaveLength(1);
      expect((await get(`/api/v3/migration-agents?q=${runId}&state=VIC`)).json()).toHaveLength(0);
    });

    it("matches on the MARN itself", async () => {
      expect((await get(`/api/v3/migration-agents?q=${marn}`)).json()).toHaveLength(1);
    });

    it("returns the detail by MARN", async () => {
      const res = await get(`/api/v3/migration-agents/${marn}`);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        marn,
        office_country: "Australia",
        registration_date: "2020-01-01",
        source_url: "https://mara.example/agent",
      });
      expect(res.json().practice_areas).toEqual(["skilled", "family"]);
    });

    it("404s an unknown MARN", async () => {
      expect((await get(`/api/v3/migration-agents/MARN-nope-${runId}`)).statusCode).toBe(404);
    });

    it("leaks no contact PII to an unauthenticated reader", async () => {
      const list = await get(`/api/v3/migration-agents?q=${runId}`);
      const detail = await get(`/api/v3/migration-agents/${marn}`);
      for (const field of [...MARA_PII_FIELDS, "website"]) {
        expect(Object.keys(list.json()[0])).not.toContain(field);
        expect(Object.keys(detail.json())).not.toContain(field);
      }
      expect(JSON.stringify(detail.json())).not.toContain("secret.");
      expect(JSON.stringify(detail.json())).not.toContain("+61400000000");
    });
  });
});
