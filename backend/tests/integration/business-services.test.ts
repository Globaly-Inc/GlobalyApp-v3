// Tenant service catalog: CRUD, child collections, shared assignment junctions,
// plus the superadmin oversight surface over the same tables.
//
// Two businesses are provisioned from scratch in beforeAll (own schemas, own
// migrations) so a sibling suite wiping the database cannot leave this one
// depending on stale rows.
//
// Tenant isolation is the load-bearing assertion here. req.db is search_path
// scoped to the caller's schema, so business B's token pointed at one of A's
// uuids must 404 — never read, never write, never delete. Every route that
// takes a service id is asserted, not just the list.

import Fastify, { type FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dbAvailable, uniqueEmail } from "../helpers/db.js";

const describeDb = describe.skipIf(!dbAvailable);

const BASE = "/api/v3/businesses/services";
const ADMIN_BASE = "/api/v3/admin/platform/businesses";
const GHOST = "00000000-0000-0000-0000-000000000000";

describeDb("business services", () => {
  let app: FastifyInstance;
  let adminApp: FastifyInstance;
  let masterKnex: Knex;
  let shutdownPools: () => Promise<void>;

  let tokenA = "";
  let tokenB = "";
  let tokenNoOrg = "";
  let adminToken = "";
  let schemaA = "";
  let schemaB = "";
  let businessAId = 0;
  let categoryId: number | null = null;
  let degreeLevelId: number | null = null;
  let accreditationId = 0;
  let schemaFieldId = 0;

  beforeAll(async () => {
    const jwt = (await import("jsonwebtoken")).default;
    ({ masterKnex } = await import("../../src/core/db/master-pool.js"));
    ({ shutdownAll: shutdownPools } = await import("../../src/core/db/pool-manager.js"));
    const { config } = (await import("../../src/config.js")) as unknown as { config: Record<string, string> };
    const { provisionBusinessSchema } = await import("../../src/core/business/provisioner.js");

    const { errorHandlerPlugin } = await import("../../src/core/plugins/error-handler.plugin.js");
    const { requestContextPlugin } = await import("../../src/core/plugins/request-context.plugin.js");
    const { authPlugin } = await import("../../src/core/plugins/auth.plugin.js");
    const { tenantPlugin } = await import("../../src/core/plugins/tenant.plugin.js");
    const businessesModule = (await import("../../src/modules/businesses/index.js")).default;
    const adminBusinessServicesModule = (
      await import("../../src/modules/superadmin/platform/business-services/index.js")
    ).default;

    const build = async (register: (scope: FastifyInstance) => Promise<void>) => {
      const instance = Fastify({ logger: false });
      await instance.register(errorHandlerPlugin);
      await instance.register(requestContextPlugin);
      await instance.register(async (scope) => {
        await scope.register(authPlugin);
        await scope.register(tenantPlugin);
        await register(scope);
      });
      await instance.ready();
      return instance;
    };

    app = await build(async (scope) => {
      await scope.register(businessesModule);
    });
    // ponytail: the admin module is mounted directly rather than through
    // superadminModule — that pulls in data-extraction's Gemini/Crawl4AI clients.
    adminApp = await build(async (scope) => {
      await scope.register(adminBusinessServicesModule, { prefix: ADMIN_BASE.replace("/businesses", "") });
    });

    // ── fixtures ──
    const suffix = `${process.pid}${Date.now() % 1_000_000}`;

    const [user] = await masterKnex("platform_users")
      .insert({
        first_name: "Services",
        last_name: "Tester",
        email: uniqueEmail("services.owner"),
        account_status: 1,
      })
      .returning(["id"]);

    const insertBusiness = async (label: string) => {
      const [row] = await masterKnex("businesses")
        .insert({
          owner_id: user.id,
          subdomain: `svc-${label}-${suffix}`,
          business_name: `Services ${label} ${suffix}`,
          account_status: 1,
          status: "active",
        })
        .returning(["id", "schema_name"]);
      await provisionBusinessSchema(row.schema_name);
      return row;
    };

    const a = await insertBusiness("a");
    const b = await insertBusiness("b");
    schemaA = a.schema_name;
    schemaB = b.schema_name;
    businessAId = a.id;

    const [cat] = await masterKnex("service_categories")
      .insert({ slug: `svc-cat-${suffix}`, name: `Courses ${suffix}` })
      .returning(["id"]);
    categoryId = cat.id;
    const [dl] = await masterKnex("degree_levels")
      .insert({ name: `Bachelor ${suffix}`, slug: `bachelor-${suffix}` })
      .returning(["id"]);
    degreeLevelId = dl.id;
    const [acc] = await masterKnex("accreditations")
      .insert({ name: `CRICOS ${suffix}`, is_global: true, status: "approved" })
      .returning(["id"]);
    accreditationId = acc.id;
    const [field] = await masterKnex("schema_fields")
      .insert({
        entity_id: categoryId,
        entity_type: "service_categories",
        label: "Delivery",
        key: `delivery_${suffix}`,
        type: "text",
      })
      .returning(["id"]);
    schemaFieldId = field.id;

    const sign = (claims: Record<string, unknown>) =>
      jwt.sign({ email: "services@vitest.local", ...claims }, config.JWT_SECRET);
    tokenA = sign({ sub: String(user.id), type: "platform_user", orgId: schemaA });
    tokenB = sign({ sub: String(user.id), type: "platform_user", orgId: schemaB });
    tokenNoOrg = sign({ sub: String(user.id), type: "platform_user" });
    adminToken = sign({ sub: "1", type: "admin_user", role: "super_admin" });
  });

  afterAll(async () => {
    await app?.close();
    await adminApp?.close();
    await shutdownPools?.();
    // Two fresh tenant schemas per run would otherwise pile up in the test DB.
    for (const schema of [schemaA, schemaB]) {
      if (schema) await masterKnex?.raw(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
    }
    await masterKnex?.destroy();
  });

  // ── helpers ──

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const get = (url: string, token: string) => app.inject({ method: "GET", url, headers: auth(token) });
  const post = (url: string, token: string, payload?: unknown) =>
    app.inject({ method: "POST", url, headers: auth(token), payload: (payload ?? {}) as object });
  const patch = (url: string, token: string, payload: unknown) =>
    app.inject({ method: "PATCH", url, headers: auth(token), payload: payload as object });
  const del = (url: string, token: string) => app.inject({ method: "DELETE", url, headers: auth(token) });

  let n = 0;
  async function createService(token: string, overrides: Record<string, unknown> = {}) {
    n += 1;
    const res = await post(BASE, token, {
      name: `Service ${n} ${Date.now()}`,
      service_category_id: categoryId,
      degree_level_id: degreeLevelId,
      ...overrides,
    });
    expect(res.statusCode, res.body).toBe(201);
    return res.json();
  }

  // ── guards ────────────────────────────────────────────────────────────────

  describe("guards", () => {
    it("rejects an unauthenticated request", async () => {
      const res = await app.inject({ method: "GET", url: BASE });
      expect(res.statusCode).toBe(401);
    });

    it("rejects a token with no business context", async () => {
      const res = await get(BASE, tokenNoOrg);
      expect(res.statusCode).toBe(403);
    });
  });

  // ── CRUD ──────────────────────────────────────────────────────────────────

  describe("crud", () => {
    it("creates, reads back with children, and lists", async () => {
      const created = await createService(tokenA, { description: "hello", price: 1234.5 });
      expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(created.is_published).toBe(false);

      const one = await get(`${BASE}/${created.id}`, tokenA);
      expect(one.statusCode).toBe(200);
      const body = one.json();
      expect(body.name).toBe(created.name);
      expect(body.children).toMatchObject({
        fees: [],
        fee_structures: [],
        intakes: [],
        eligibility: [],
        assignments: expect.anything(),
      });

      const list = await get(`${BASE}?limit=100`, tokenA);
      expect(list.statusCode).toBe(200);
      expect(list.json().data.some((s: { id: string }) => s.id === created.id)).toBe(true);
    });

    it("updates a service", async () => {
      const svc = await createService(tokenA);
      const res = await patch(`${BASE}/${svc.id}`, tokenA, { name: "Renamed", is_featured: true });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ name: "Renamed", is_featured: true });
    });

    it("filters by category, degree level, and search", async () => {
      const tag = `filter-${Date.now()}`;
      const svc = await createService(tokenA, { name: `${tag} target` });
      const byCategory = await get(`${BASE}?service_category_id=${categoryId}&search=${tag}&limit=100`, tokenA);
      expect(byCategory.json().data.map((s: { id: string }) => s.id)).toEqual([svc.id]);
      const byDegree = await get(`${BASE}?degree_level_id=${degreeLevelId}&search=${tag}&limit=100`, tokenA);
      expect(byDegree.json().data.map((s: { id: string }) => s.id)).toEqual([svc.id]);
      const wrongCategory = await get(`${BASE}?service_category_id=999999&search=${tag}&limit=100`, tokenA);
      expect(wrongCategory.json().data).toHaveLength(0);
    });

    it("404s an unknown id", async () => {
      expect((await get(`${BASE}/${GHOST}`, tokenA)).statusCode).toBe(404);
    });

    it("400s a malformed id", async () => {
      expect((await get(`${BASE}/not-a-uuid`, tokenA)).statusCode).toBe(400);
    });

    it("soft deletes: the row survives but every read excludes it", async () => {
      const svc = await createService(tokenA);
      const removed = await del(`${BASE}/${svc.id}`, tokenA);
      expect(removed.statusCode).toBe(200);

      expect((await get(`${BASE}/${svc.id}`, tokenA)).statusCode).toBe(404);
      const list = await get(`${BASE}?limit=100`, tokenA);
      expect(list.json().data.some((s: { id: string }) => s.id === svc.id)).toBe(false);

      // Still on disk, with deleted_at set — never hard-deleted.
      const { createSchemaKnex } = await import("../../src/core/db/knex.js");
      const tenant = createSchemaKnex(schemaA, { min: 0, max: 1 });
      try {
        const row = await tenant("business_services").where({ id: svc.id }).first();
        expect(row).toBeTruthy();
        expect(row.deleted_at).not.toBeNull();
      } finally {
        await tenant.destroy();
      }

      // Deleting twice is a 404, not a second write.
      expect((await del(`${BASE}/${svc.id}`, tokenA)).statusCode).toBe(404);
    });

    it("rejects invalid bodies", async () => {
      expect((await post(BASE, tokenA, { name: "" })).statusCode).toBe(400);
      expect((await post(BASE, tokenA, {})).statusCode).toBe(400);
      expect((await post(BASE, tokenA, { name: "x", price: -5 })).statusCode).toBe(400);
      // Unknown keys are a 400, not a silently ignored field.
      expect((await post(BASE, tokenA, { name: "x", nonsense: 1 })).statusCode).toBe(400);
      // Polymorphic awarding body: type without id is meaningless.
      expect((await post(BASE, tokenA, { name: "x", awarded_by_org_type: "business" })).statusCode).toBe(400);
      const svc = await createService(tokenA);
      expect((await patch(`${BASE}/${svc.id}`, tokenA, {})).statusCode).toBe(400);
    });
  });

  // ── publish transitions ───────────────────────────────────────────────────

  describe("publish", () => {
    it("publishes, filters by published, and unpublishes", async () => {
      const svc = await createService(tokenA);

      const published = await post(`${BASE}/${svc.id}/publish`, tokenA);
      expect(published.statusCode).toBe(200);
      expect(published.json().is_published).toBe(true);

      const onlyPublished = await get(`${BASE}?is_published=true&limit=100`, tokenA);
      expect(onlyPublished.json().data.some((s: { id: string }) => s.id === svc.id)).toBe(true);
      const onlyDrafts = await get(`${BASE}?is_published=false&limit=100`, tokenA);
      expect(onlyDrafts.json().data.some((s: { id: string }) => s.id === svc.id)).toBe(false);

      // Idempotent: publishing twice stays published.
      expect((await post(`${BASE}/${svc.id}/publish`, tokenA)).json().is_published).toBe(true);

      const unpublished = await post(`${BASE}/${svc.id}/unpublish`, tokenA);
      expect(unpublished.json().is_published).toBe(false);
      const drafts = await get(`${BASE}?is_published=false&limit=100`, tokenA);
      expect(drafts.json().data.some((s: { id: string }) => s.id === svc.id)).toBe(true);
    });

    it("refuses to publish a soft-deleted service", async () => {
      const svc = await createService(tokenA);
      await del(`${BASE}/${svc.id}`, tokenA);
      expect((await post(`${BASE}/${svc.id}/publish`, tokenA)).statusCode).toBe(404);
    });
  });

  // ── pagination ────────────────────────────────────────────────────────────

  describe("pagination", () => {
    it("walks the page edges without overlap or gaps", async () => {
      const tag = `page-${Date.now()}`;
      const ids: string[] = [];
      for (let i = 0; i < 5; i += 1) {
        const svc = await createService(tokenA, { name: `${tag} ${i}` });
        ids.push(svc.id);
      }

      const p1 = await get(`${BASE}?search=${tag}&page=1&limit=2`, tokenA);
      expect(p1.json().meta).toMatchObject({ page: 1, limit: 2, total: 5, totalPages: 3 });
      expect(p1.json().data).toHaveLength(2);

      const p3 = await get(`${BASE}?search=${tag}&page=3&limit=2`, tokenA);
      expect(p3.json().data).toHaveLength(1);

      // Past the end: empty page, honest total.
      const p4 = await get(`${BASE}?search=${tag}&page=4&limit=2`, tokenA);
      expect(p4.json().data).toHaveLength(0);
      expect(p4.json().meta.total).toBe(5);

      const seen = [
        ...p1.json().data,
        ...(await get(`${BASE}?search=${tag}&page=2&limit=2`, tokenA)).json().data,
        ...p3.json().data,
      ].map((s: { id: string }) => s.id);
      expect(new Set(seen).size).toBe(5);
      expect([...seen].sort()).toEqual([...ids].sort());
    });

    it("rejects an out-of-range limit", async () => {
      expect((await get(`${BASE}?limit=101`, tokenA)).statusCode).toBe(400);
      expect((await get(`${BASE}?page=0`, tokenA)).statusCode).toBe(400);
    });
  });

  // ── child collections ─────────────────────────────────────────────────────

  describe("child collections", () => {
    it("round-trips a fee: create, list, patch, soft delete", async () => {
      const svc = await createService(tokenA);

      const created = await post(`${BASE}/${svc.id}/fees`, tokenA, {
        name: "Tuition",
        student_type: "international",
        currency: "AUD",
        total_amount: 32000,
        installments: [{ label: "Sem 1", amount: 16000 }],
      });
      expect(created.statusCode, created.body).toBe(201);
      const fee = created.json();
      expect(Number(fee.total_amount)).toBe(32000);
      expect(fee.installments).toEqual([{ label: "Sem 1", amount: 16000 }]);

      expect((await get(`${BASE}/${svc.id}/fees`, tokenA)).json()).toHaveLength(1);

      const patched = await patch(`${BASE}/${svc.id}/fees/${fee.id}`, tokenA, { name: "Tuition 2026" });
      expect(patched.json().name).toBe("Tuition 2026");

      expect((await del(`${BASE}/${svc.id}/fees/${fee.id}`, tokenA)).statusCode).toBe(200);
      expect((await get(`${BASE}/${svc.id}/fees`, tokenA)).json()).toHaveLength(0);
      expect((await del(`${BASE}/${svc.id}/fees/${fee.id}`, tokenA)).statusCode).toBe(404);
    });

    it("round-trips a fee structure and its installments", async () => {
      const svc = await createService(tokenA);
      const structure = (
        await post(`${BASE}/${svc.id}/fee-structures`, tokenA, { name: "Standard", period: "Per Year" })
      ).json();

      const inst = await post(`${BASE}/${svc.id}/fee-structures/${structure.id}/installments`, tokenA, {
        sort_order: 1,
      });
      expect(inst.statusCode, inst.body).toBe(201);

      const listed = await get(`${BASE}/${svc.id}/fee-structures/${structure.id}/installments`, tokenA);
      expect(listed.json()).toHaveLength(1);

      expect(
        (await del(`${BASE}/${svc.id}/fee-structures/${structure.id}/installments/${inst.json().id}`, tokenA))
          .statusCode,
      ).toBe(200);
      expect((await get(`${BASE}/${svc.id}/fee-structures/${structure.id}/installments`, tokenA)).json()).toHaveLength(0);

      // A structure belonging to another service is not addressable through this one.
      const other = await createService(tokenA);
      expect(
        (await get(`${BASE}/${other.id}/fee-structures/${structure.id}/installments`, tokenA)).statusCode,
      ).toBe(404);
    });

    it("round-trips intakes and eligibility requirements", async () => {
      const svc = await createService(tokenA);

      const intake = await post(`${BASE}/${svc.id}/intakes`, tokenA, {
        intake_name: "Feb 2026",
        start_date: "2026-02-02",
        intake_month: 2,
        intake_year: 2026,
      });
      expect(intake.statusCode, intake.body).toBe(201);
      expect((await get(`${BASE}/${svc.id}/intakes`, tokenA)).json()).toHaveLength(1);
      expect((await post(`${BASE}/${svc.id}/intakes`, tokenA, { intake_month: 13 })).statusCode).toBe(400);

      const elig = await post(`${BASE}/${svc.id}/eligibility`, tokenA, {
        name: "Academic",
        applicable_to: "international",
        degree_level_id: degreeLevelId,
        applicable_countries: ["NP", "IN"],
        language_tests: [{ test: "IELTS", score: 6.5 }],
      });
      expect(elig.statusCode, elig.body).toBe(201);
      expect(elig.json().applicable_countries).toEqual(["NP", "IN"]);
      expect(elig.json().language_tests).toEqual([{ test: "IELTS", score: 6.5 }]);
    });

    it("keeps the reusable library (study options / units) per tenant", async () => {
      const option = await post(`${BASE}/library/study-options`, tokenA, {
        name: "Full time on campus",
        study_mode: "on_campus",
        study_load: "full_time",
        duration_value: 24,
        save_for_reuse: true,
      });
      expect(option.statusCode, option.body).toBe(201);
      expect((await post(`${BASE}/library/study-options`, tokenA, { study_mode: "teleport" })).statusCode).toBe(400);

      const unit = await post(`${BASE}/library/study-units`, tokenA, {
        unit_code: "ICT101",
        unit_name: "Intro to IT",
        credit_points: 12,
      });
      expect(unit.statusCode, unit.body).toBe(201);
      const unitId = unit.json().id;

      const mine = await get(`${BASE}/library/study-units`, tokenA);
      expect(mine.json().some((u: { id: string }) => u.id === unitId)).toBe(true);
      // B's library is its own.
      const theirs = await get(`${BASE}/library/study-units`, tokenB);
      expect(theirs.json().some((u: { id: string }) => u.id === unitId)).toBe(false);

      const renamed = await patch(`${BASE}/library/study-units/${unitId}`, tokenA, { unit_name: "IT Basics" });
      expect(renamed.json().unit_name).toBe("IT Basics");
      expect((await del(`${BASE}/library/study-units/${unitId}`, tokenA)).statusCode).toBe(200);
      expect((await del(`${BASE}/library/study-units/${unitId}`, tokenA)).statusCode).toBe(404);
      // B cannot reach A's library row either.
      expect((await patch(`${BASE}/library/study-options/${option.json().id}`, tokenB, { name: "x" })).statusCode).toBe(404);
    });

    it("404s a child collection hung off an unknown service", async () => {
      expect((await get(`${BASE}/${GHOST}/fees`, tokenA)).statusCode).toBe(404);
      expect((await post(`${BASE}/${GHOST}/fees`, tokenA, { total_amount: 1 })).statusCode).toBe(404);
    });
  });

  // ── assignment junctions ──────────────────────────────────────────────────

  describe("assignments", () => {
    it("shares one fee across two services", async () => {
      const first = await createService(tokenA);
      const second = await createService(tokenA);
      const fee = (
        await post(`${BASE}/${first.id}/fees`, tokenA, { total_amount: 100, save_for_reuse: true })
      ).json();

      const a1 = await post(`${BASE}/${first.id}/assignments/fees`, tokenA, { service_fee_id: fee.id });
      const a2 = await post(`${BASE}/${second.id}/assignments/fees`, tokenA, { service_fee_id: fee.id });
      expect(a1.statusCode, a1.body).toBe(201);
      expect(a2.statusCode, a2.body).toBe(201);

      const onFirst = await get(`${BASE}/${first.id}/assignments/fees`, tokenA);
      const onSecond = await get(`${BASE}/${second.id}/assignments/fees`, tokenA);
      expect(onFirst.json().map((r: { service_fee_id: string }) => r.service_fee_id)).toEqual([fee.id]);
      expect(onSecond.json().map((r: { service_fee_id: string }) => r.service_fee_id)).toEqual([fee.id]);

      // The same pair twice is a conflict, not a duplicate row.
      expect((await post(`${BASE}/${second.id}/assignments/fees`, tokenA, { service_fee_id: fee.id })).statusCode).toBe(409);

      // Unassigning from one leaves the other intact.
      expect((await del(`${BASE}/${second.id}/assignments/fees/${fee.id}`, tokenA)).statusCode).toBe(200);
      expect((await get(`${BASE}/${second.id}/assignments/fees`, tokenA)).json()).toHaveLength(0);
      expect((await get(`${BASE}/${first.id}/assignments/fees`, tokenA)).json()).toHaveLength(1);
      expect((await del(`${BASE}/${second.id}/assignments/fees/${fee.id}`, tokenA)).statusCode).toBe(404);
    });

    it("tombstones only the junction, and re-assigning revives it", async () => {
      const svc = await createService(tokenA);
      const owner = await createService(tokenA);
      const fee = (await post(`${BASE}/${owner.id}/fees`, tokenA, { total_amount: 7 })).json();

      expect((await post(`${BASE}/${svc.id}/assignments/fees`, tokenA, { service_fee_id: fee.id })).statusCode).toBe(201);
      expect((await del(`${BASE}/${svc.id}/assignments/fees/${fee.id}`, tokenA)).statusCode).toBe(200);

      // The shared entity itself is untouched by unassigning.
      expect((await get(`${BASE}/${owner.id}/fees`, tokenA)).json().some((f: { id: string }) => f.id === fee.id)).toBe(true);

      // Re-assigning must revive the tombstone, not trip (service_id, target) UNIQUE.
      const again = await post(`${BASE}/${svc.id}/assignments/fees`, tokenA, { service_fee_id: fee.id });
      expect(again.statusCode, again.body).toBe(201);
      expect((await get(`${BASE}/${svc.id}/assignments/fees`, tokenA)).json()).toHaveLength(1);

      // …and exactly one junction row exists on disk, revived rather than duplicated.
      const { createSchemaKnex } = await import("../../src/core/db/knex.js");
      const tenant = createSchemaKnex(schemaA, { min: 0, max: 1 });
      try {
        const rows = await tenant("service_fee_assignments").where({ service_id: svc.id, service_fee_id: fee.id });
        expect(rows).toHaveLength(1);
        expect(rows[0].deleted_at).toBeNull();
      } finally {
        await tenant.destroy();
      }
    });

    it("shares one eligibility requirement across two services", async () => {
      const first = await createService(tokenA);
      const second = await createService(tokenA);
      const req = (
        await post(`${BASE}/${first.id}/eligibility`, tokenA, { name: "Shared", save_for_reuse: true })
      ).json();

      expect(
        (await post(`${BASE}/${second.id}/assignments/eligibility`, tokenA, { eligibility_requirement_id: req.id }))
          .statusCode,
      ).toBe(201);
      expect((await get(`${BASE}/${second.id}/assignments/eligibility`, tokenA)).json()).toHaveLength(1);
    });

    it("assigns study options, study units with a unit type, and a master accreditation", async () => {
      const svc = await createService(tokenA);
      const unit = (await post(`${BASE}/library/study-units`, tokenA, { unit_name: "Networks" })).json();
      const option = (
        await post(`${BASE}/library/study-options`, tokenA, { study_mode: "online" })
      ).json();

      expect(
        (await post(`${BASE}/${svc.id}/assignments/study-options`, tokenA, { study_option_id: option.id })).statusCode,
      ).toBe(201);

      const assigned = await post(`${BASE}/${svc.id}/assignments/study-units`, tokenA, {
        study_unit_id: unit.id,
        unit_type: "elective",
      });
      expect(assigned.statusCode, assigned.body).toBe(201);
      expect(assigned.json().unit_type).toBe("elective");
      expect(
        (await post(`${BASE}/${svc.id}/assignments/study-units`, tokenA, { study_unit_id: unit.id, unit_type: "wishful" }))
          .statusCode,
      ).toBe(400);

      const acc = await post(`${BASE}/${svc.id}/assignments/accreditations`, tokenA, {
        accreditation_id: accreditationId,
        registration_number: "CRICOS-123",
      });
      expect(acc.statusCode, acc.body).toBe(201);
      expect((await get(`${BASE}/${svc.id}/assignments/accreditations`, tokenA)).json()).toHaveLength(1);
      // A master-schema id that does not exist is reported, not stored.
      expect((await post(`${BASE}/${svc.id}/assignments/accreditations`, tokenA, { accreditation_id: 999_999 })).statusCode).toBe(404);
      expect((await del(`${BASE}/${svc.id}/assignments/accreditations/${accreditationId}`, tokenA)).statusCode).toBe(200);
      expect((await del(`${BASE}/${svc.id}/assignments/accreditations/not-a-number`, tokenA)).statusCode).toBe(400);
    });

    it("refuses to assign a target that lives in another tenant", async () => {
      const mine = await createService(tokenA);
      const theirs = await createService(tokenB);
      const theirFee = (await post(`${BASE}/${theirs.id}/fees`, tokenB, { total_amount: 5 })).json();
      const res = await post(`${BASE}/${mine.id}/assignments/fees`, tokenA, { service_fee_id: theirFee.id });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── tenant isolation ──────────────────────────────────────────────────────

  describe("tenant isolation", () => {
    it("hides business A's services from business B's list", async () => {
      const mine = await createService(tokenA);
      const list = await get(`${BASE}?limit=100`, tokenB);
      expect(list.statusCode).toBe(200);
      expect(list.json().data.some((s: { id: string }) => s.id === mine.id)).toBe(false);
    });

    it("404s every read and mutation of another tenant's service", async () => {
      const mine = await createService(tokenA);
      const fee = (await post(`${BASE}/${mine.id}/fees`, tokenA, { total_amount: 10 })).json();
      const structure = (await post(`${BASE}/${mine.id}/fee-structures`, tokenA, { name: "S" })).json();
      const installment = (
        await post(`${BASE}/${mine.id}/fee-structures/${structure.id}/installments`, tokenA, { sort_order: 0 })
      ).json();
      const intake = (await post(`${BASE}/${mine.id}/intakes`, tokenA, { intake_name: "Feb" })).json();
      const elig = (await post(`${BASE}/${mine.id}/eligibility`, tokenA, { name: "E" })).json();
      await post(`${BASE}/${mine.id}/assignments/fees`, tokenA, { service_fee_id: fee.id });

      // Every route that takes a service id, exercised with the wrong tenant's token.
      const attempts: Array<[string, Promise<{ statusCode: number }>]> = [
        ["GET one", get(`${BASE}/${mine.id}`, tokenB)],
        ["PATCH", patch(`${BASE}/${mine.id}`, tokenB, { name: "hijacked" })],
        ["DELETE", del(`${BASE}/${mine.id}`, tokenB)],
        ["POST publish", post(`${BASE}/${mine.id}/publish`, tokenB)],
        ["POST unpublish", post(`${BASE}/${mine.id}/unpublish`, tokenB)],
        ["GET fees", get(`${BASE}/${mine.id}/fees`, tokenB)],
        ["POST fee", post(`${BASE}/${mine.id}/fees`, tokenB, { total_amount: 1 })],
        ["PATCH fee", patch(`${BASE}/${mine.id}/fees/${fee.id}`, tokenB, { name: "hijacked" })],
        ["DELETE fee", del(`${BASE}/${mine.id}/fees/${fee.id}`, tokenB)],
        ["GET fee-structures", get(`${BASE}/${mine.id}/fee-structures`, tokenB)],
        ["POST fee-structure", post(`${BASE}/${mine.id}/fee-structures`, tokenB, { name: "x" })],
        ["PATCH fee-structure", patch(`${BASE}/${mine.id}/fee-structures/${structure.id}`, tokenB, { name: "hijacked" })],
        ["DELETE fee-structure", del(`${BASE}/${mine.id}/fee-structures/${structure.id}`, tokenB)],
        ["GET intakes", get(`${BASE}/${mine.id}/intakes`, tokenB)],
        ["POST intake", post(`${BASE}/${mine.id}/intakes`, tokenB, { intake_name: "x" })],
        ["PATCH intake", patch(`${BASE}/${mine.id}/intakes/${intake.id}`, tokenB, { intake_name: "hijacked" })],
        ["DELETE intake", del(`${BASE}/${mine.id}/intakes/${intake.id}`, tokenB)],
        ["GET eligibility", get(`${BASE}/${mine.id}/eligibility`, tokenB)],
        ["POST eligibility", post(`${BASE}/${mine.id}/eligibility`, tokenB, { name: "x" })],
        ["PATCH eligibility", patch(`${BASE}/${mine.id}/eligibility/${elig.id}`, tokenB, { name: "hijacked" })],
        ["DELETE eligibility", del(`${BASE}/${mine.id}/eligibility/${elig.id}`, tokenB)],
        ["GET installments", get(`${BASE}/${mine.id}/fee-structures/${structure.id}/installments`, tokenB)],
        ["POST installment", post(`${BASE}/${mine.id}/fee-structures/${structure.id}/installments`, tokenB, { sort_order: 0 })],
        ["DELETE installment", del(`${BASE}/${mine.id}/fee-structures/${structure.id}/installments/${installment.id}`, tokenB)],
        ["GET assignments", get(`${BASE}/${mine.id}/assignments/fees`, tokenB)],
        ["POST assignment", post(`${BASE}/${mine.id}/assignments/fees`, tokenB, { service_fee_id: fee.id })],
        ["DELETE assignment", del(`${BASE}/${mine.id}/assignments/fees/${fee.id}`, tokenB)],
      ];

      for (const [label, pending] of attempts) {
        const res = await pending;
        expect(res.statusCode, `${label} must not reach another tenant`).toBe(404);
      }

      // Nothing was written, renamed, appended, or deleted on A's side.
      const after = await get(`${BASE}/${mine.id}`, tokenA);
      expect(after.statusCode).toBe(200);
      expect(after.json().name).toBe(mine.name);
      expect(after.json().deleted_at ?? null).toBeNull();
      expect(after.json().children.fees).toHaveLength(1);
      expect(after.json().children.fees[0].name ?? null).toBeNull();
      expect(after.json().children.fee_structures).toHaveLength(1);
      expect(after.json().children.fee_structures[0].name).toBe("S");
      expect(after.json().children.intakes).toHaveLength(1);
      expect(after.json().children.intakes[0].intake_name).toBe("Feb");
      expect(after.json().children.eligibility).toHaveLength(1);
      expect(after.json().children.eligibility[0].name).toBe("E");
      expect(after.json().children.assignments.fees).toHaveLength(1);
    });
  });

  // ── dynamic per-category field values ─────────────────────────────────────

  describe("field values", () => {
    it("upserts and reads back a service's category-specific fields", async () => {
      const svc = await createService(tokenA);

      expect((await get(`${BASE}/${svc.id}/field-values`, tokenA)).json()).toHaveLength(0);

      const put = await app.inject({
        method: "PUT",
        url: `${BASE}/${svc.id}/field-values`,
        headers: auth(tokenA),
        payload: { values: [{ schema_field_id: schemaFieldId, value: "online" }] },
      });
      expect(put.statusCode, put.body).toBe(200);
      expect(put.json()).toEqual([{ schema_field_id: schemaFieldId, value: "online" }]);

      // Upsert, not insert: the same field twice keeps one row with the new value.
      await app.inject({
        method: "PUT",
        url: `${BASE}/${svc.id}/field-values`,
        headers: auth(tokenA),
        payload: { values: [{ schema_field_id: schemaFieldId, value: "on campus" }] },
      });
      expect((await get(`${BASE}/${svc.id}/field-values`, tokenA)).json()).toEqual([
        { schema_field_id: schemaFieldId, value: "on campus" },
      ]);

      // Another tenant cannot read or write them.
      expect((await get(`${BASE}/${svc.id}/field-values`, tokenB)).statusCode).toBe(404);
      const hijack = await app.inject({
        method: "PUT",
        url: `${BASE}/${svc.id}/field-values`,
        headers: auth(tokenB),
        payload: { values: [{ schema_field_id: schemaFieldId, value: "hijacked" }] },
      });
      expect(hijack.statusCode).toBe(404);
    });
  });

  // ── superadmin oversight ──────────────────────────────────────────────────

  describe("admin oversight", () => {
    const adminGet = (url: string) =>
      adminApp.inject({ method: "GET", url, headers: auth(adminToken) });

    it("lists and reads one business's services with children", async () => {
      const svc = await createService(tokenA, { name: `Oversight ${Date.now()}` });
      await post(`${BASE}/${svc.id}/intakes`, tokenA, { intake_name: "Jul 2026" });

      const list = await adminGet(`${ADMIN_BASE}/${businessAId}/services`);
      expect(list.statusCode, list.body).toBe(200);
      expect(list.json().some((s: { id: string }) => s.id === svc.id)).toBe(true);

      const one = await adminGet(`${ADMIN_BASE}/${businessAId}/services/${svc.id}`);
      expect(one.statusCode, one.body).toBe(200);
      expect(one.json().children.intakes).toHaveLength(1);

      const search = await adminGet(`${ADMIN_BASE}/${businessAId}/services/search?search=Oversight&limit=10`);
      expect(search.json().data.some((s: { id: string }) => s.id === svc.id)).toBe(true);
    });

    it("creates, updates, sets field values, and soft deletes into the tenant schema", async () => {
      const inject = (method: string, url: string, payload?: unknown) =>
        adminApp.inject({ method, url, headers: auth(adminToken), payload: payload as object });

      const base = `${ADMIN_BASE}/${businessAId}/services`;
      const created = await inject("POST", base, { name: `Admin made ${Date.now()}`, service_category_id: categoryId });
      expect(created.statusCode, created.body).toBe(201);
      const id = created.json().id;

      const patched = await inject("PATCH", `${base}/${id}`, { description: "reviewed by admin" });
      expect(patched.statusCode, patched.body).toBe(200);
      expect(patched.json().description).toBe("reviewed by admin");

      const fields = await inject("PUT", `${base}/${id}/field-values`, {
        values: [{ schema_field_id: schemaFieldId, value: "admin set" }],
      });
      expect(fields.statusCode, fields.body).toBe(200);
      expect((await adminGet(`${base}/${id}/field-values`)).json()).toEqual([
        { schema_field_id: schemaFieldId, value: "admin set" },
      ]);

      expect((await inject("DELETE", `${base}/${id}`)).statusCode).toBe(204);
      // The tenant sees the same soft delete.
      expect((await get(`${BASE}/${id}`, tokenA)).statusCode).toBe(404);
    });

    it("404s an unknown business and an unknown service", async () => {
      expect((await adminGet(`${ADMIN_BASE}/99999999/services`)).statusCode).toBe(404);
      expect((await adminGet(`${ADMIN_BASE}/${businessAId}/services/${GHOST}`)).statusCode).toBe(404);
    });
  });
});
