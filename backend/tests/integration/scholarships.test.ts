// Scholarships (Wave G1) — public directory, admin moderation, business submission.
//
// The contract under test is V2's apps/core-api/src/routes/scholarships.ts (list,
// facets, detail+criteria, view bump) plus the submission→pending→approved/rejected
// lifecycle G1 adds on top, which neither V1 nor V2 has.
//
// Runs entirely offline: one master-schema table family, no tenant schemas, no
// broker, no provider. Fixtures carry a per-run suffix because the test database
// persists between runs and the public list is global by construction.

import Fastify, { type FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dbAvailable, uniqueEmail } from "../helpers/db.js";

const describeDb = describe.skipIf(!dbAvailable);

/** Fields only an admin may ever see. A public response containing any of these is a leak. */
const ADMIN_ONLY_FIELDS = [
  "review_status",
  "review_note",
  "reviewed_by",
  "reviewed_at",
  "created_by",
  "source_sheet",
  "deleted_at",
  "is_published",
];

describeDb("scholarships", () => {
  let app: FastifyInstance;
  let masterKnex: Knex;
  let shutdownPools: () => Promise<void>;

  let runId = "";
  let ownerUser = 0;
  let bizId = 0;
  let bizSchema = "";
  let adminToken = "";
  let bizToken = "";
  let outsiderToken = "";

  beforeAll(async () => {
    const jwt = (await import("jsonwebtoken")).default;
    ({ masterKnex } = await import("../../src/core/db/master-pool.js"));
    ({ shutdownAll: shutdownPools } = await import("../../src/core/db/pool-manager.js"));
    const { config } = (await import("../../src/config.js")) as unknown as {
      config: Record<string, unknown>;
    };

    const { errorHandlerPlugin } = await import("../../src/core/plugins/error-handler.plugin.js");
    const { requestContextPlugin } = await import("../../src/core/plugins/request-context.plugin.js");
    const { authPlugin } = await import("../../src/core/plugins/auth.plugin.js");
    const { tenantPlugin } = await import("../../src/core/plugins/tenant.plugin.js");
    const scholarshipsModule = (await import("../../src/modules/scholarships/index.js")).default;
    const { publicScholarshipsModule } = await import("../../src/modules/scholarships/index.js");

    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    await app.register(requestContextPlugin);
    await app.register(async (scoped) => {
      await scoped.register(authPlugin);
      await scoped.register(tenantPlugin);
      await scoped.register(scholarshipsModule);
    });
    await app.register(publicScholarshipsModule);
    await app.ready();

    runId = `${process.pid}${Date.now() % 1_000_000}`;

    const [user] = await masterKnex("platform_users")
      .insert({
        first_name: "Sch",
        last_name: "Owner",
        email: uniqueEmail("scholarships.owner"),
        account_status: 1,
      })
      .returning(["id"]);
    ownerUser = user.id;

    const [biz] = await masterKnex("businesses")
      .insert({
        owner_id: ownerUser,
        subdomain: `sch-${runId}`,
        business_name: `Scholarship Provider ${runId}`,
        account_status: 1,
        status: "verified",
        is_published: true,
      })
      .returning(["id", "schema_name"]);
    bizId = biz.id;
    bizSchema = biz.schema_name;

    const sign = (claims: Record<string, unknown>) =>
      jwt.sign({ email: "sch@vitest.local", ...claims }, config.JWT_SECRET as string);

    adminToken = sign({ sub: "1", type: "admin", role: "super_admin" });
    bizToken = sign({ sub: String(ownerUser), type: "platform_user", orgId: bizSchema });
    outsiderToken = sign({ sub: String(ownerUser), type: "platform_user" });
  });

  afterAll(async () => {
    await masterKnex?.("scholarships").where("title", "like", `%${runId}%`).del();
    await app?.close();
    await shutdownPools?.();
    await masterKnex?.destroy();
  });

  // ── helpers ───────────────────────────────────────────────────────────────

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const get = (url: string, token?: string) =>
    app.inject({ method: "GET", url, headers: token ? auth(token) : {} });
  const post = (url: string, token?: string, payload?: unknown) =>
    app.inject({
      method: "POST",
      url,
      headers: token ? auth(token) : {},
      payload: (payload ?? {}) as object,
    });
  const patch = (url: string, token: string, payload: unknown) =>
    app.inject({ method: "PATCH", url, headers: auth(token), payload: payload as object });

  const ADMIN = "/api/v3/admin/monitoring/scholarships";
  const PUBLIC = "/api/v3/scholarships";
  const BUSINESS = "/api/v3/business/scholarships";

  let created = 0;

  async function createViaAdmin(overrides: Record<string, unknown> = {}) {
    const res = await post(ADMIN, adminToken, {
      title: `Merit Award ${runId} #${(created += 1)}`,
      provider_name: `Provider ${runId}`,
      country: "Australia",
      city: "Sydney",
      basis: "merit",
      coverage_type: "full_tuition",
      coverage_amount: "15000.00",
      coverage_currency: "AUD",
      degree_levels: ["bachelor"],
      deadline: "2027-06-30",
      owner_org_type: "business",
      owner_org_id: bizId,
      ...overrides,
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  // ── admin moderation lifecycle ────────────────────────────────────────────

  describe("moderation", () => {
    it("a newly submitted scholarship is pending and unpublished", async () => {
      const row = await createViaAdmin();
      expect(row.review_status).toBe("pending");
      expect(row.is_published).toBe(false);
      expect(row.slug).toMatch(/-s\d+$/);
    });

    it("approve publishes it", async () => {
      const row = await createViaAdmin();
      const res = await post(`${ADMIN}/${row.id}/approve`, adminToken, { publish: true });
      expect(res.statusCode).toBe(200);
      expect(res.json().review_status).toBe("approved");
      expect(res.json().is_published).toBe(true);
      expect(res.json().reviewed_at).toBeTruthy();
    });

    it("approve without publish leaves it approved but hidden", async () => {
      const row = await createViaAdmin();
      const res = await post(`${ADMIN}/${row.id}/approve`, adminToken, { publish: false });
      expect(res.json().review_status).toBe("approved");
      expect(res.json().is_published).toBe(false);
    });

    it("reject records the note and unpublishes", async () => {
      const row = await createViaAdmin();
      await post(`${ADMIN}/${row.id}/approve`, adminToken, { publish: true });
      const res = await post(`${ADMIN}/${row.id}/reject`, adminToken, { note: "Provider unverified" });
      expect(res.statusCode).toBe(200);
      expect(res.json().review_status).toBe("rejected");
      expect(res.json().is_published).toBe(false);
      expect(res.json().review_note).toBe("Provider unverified");
    });

    it("a rejected scholarship cannot be published", async () => {
      const row = await createViaAdmin();
      await post(`${ADMIN}/${row.id}/reject`, adminToken, { note: "no" });
      const res = await patch(`${ADMIN}/${row.id}/publish`, adminToken, { is_published: true });
      expect(res.statusCode).toBe(400);
    });

    it("featuring is independent of moderation", async () => {
      const row = await createViaAdmin();
      await post(`${ADMIN}/${row.id}/approve`, adminToken, { publish: true });
      const res = await patch(`${ADMIN}/${row.id}/feature`, adminToken, { is_featured: true });
      expect(res.json().is_featured).toBe(true);
    });

    it("404s an unknown id", async () => {
      const res = await post(`${ADMIN}/99999999/approve`, adminToken, {});
      expect(res.statusCode).toBe(404);
    });
  });

  // ── route auth ────────────────────────────────────────────────────────────

  describe("auth", () => {
    it("admin routes reject an anonymous caller", async () => {
      expect((await get(ADMIN)).statusCode).toBe(401);
    });

    it("admin routes reject a signed-in non-admin", async () => {
      expect((await get(ADMIN, outsiderToken)).statusCode).toBe(403);
    });

    it("business submission requires a business context", async () => {
      const res = await post(BUSINESS, outsiderToken, { title: `X ${runId}` });
      expect(res.statusCode).toBe(403);
    });

    it("public browse needs no token", async () => {
      expect((await get(PUBLIC)).statusCode).toBe(200);
    });
  });

  // ── business submission ───────────────────────────────────────────────────

  describe("submission", () => {
    it("a business submits its own listing, which lands pending", async () => {
      const res = await post(BUSINESS, bizToken, {
        title: `Business Submitted ${runId}`,
        country: "Australia",
        basis: "need",
      });
      expect(res.statusCode).toBe(201);
      const row = res.json();
      expect(row.review_status).toBe("pending");
      expect(row.is_published).toBe(false);
      expect(row.owner_org_type).toBe("business");
      expect(row.owner_org_id).toBe(bizId);
    });

    it("a business lists only its own scholarships", async () => {
      const res = await get(BUSINESS, bizToken);
      expect(res.statusCode).toBe(200);
      const ids: number[] = res.json().data.map((s: { owner_org_id: number }) => s.owner_org_id);
      expect(new Set(ids)).toEqual(new Set([bizId]));
    });

    it("a business cannot publish its own submission", async () => {
      const res = await post(BUSINESS, bizToken, {
        title: `Sneaky ${runId}`,
        is_published: true,
        review_status: "approved",
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().is_published).toBe(false);
      expect(res.json().review_status).toBe("pending");
    });
  });

  // ── public directory (V2 contract) ────────────────────────────────────────

  describe("public directory", () => {
    let published: Record<string, unknown>;

    beforeAll(async () => {
      published = await createViaAdmin({ title: `Published Award ${runId}`, country: "Nepal" });
      await post(`${ADMIN}/${published.id}/approve`, adminToken, { publish: true });
      const hidden = await createViaAdmin({ title: `Hidden Award ${runId}`, country: "Nepal" });
      await post(`${ADMIN}/${hidden.id}/reject`, adminToken, { note: "spam" });
    });

    it("lists only published rows, in V2's envelope", async () => {
      const res = await get(`${PUBLIC}?q=Published Award ${runId}`);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty("scholarships");
      expect(body).toHaveProperty("total");
      expect(body).toHaveProperty("page");
      expect(body).toHaveProperty("limit");
      expect(body.scholarships).toHaveLength(1);
      expect(body.scholarships[0].title).toBe(`Published Award ${runId}`);
    });

    it("never returns an unpublished or rejected row", async () => {
      const res = await get(`${PUBLIC}?q=Hidden Award ${runId}`);
      expect(res.json().scholarships).toHaveLength(0);
    });

    it("filters by country", async () => {
      const res = await get(`${PUBLIC}?country=Nepal&q=Published Award ${runId}`);
      expect(res.json().total).toBe(1);
      const none = await get(`${PUBLIC}?country=Peru&q=Published Award ${runId}`);
      expect(none.json().total).toBe(0);
    });

    it("returns the facet shape the V1 facets_scholarships RPC returned", async () => {
      const res = await get(`${PUBLIC}/facets?q=Published Award ${runId}`);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBe(1);
      expect(body.countries).toEqual([{ value: "Nepal", count: 1 }]);
      expect(body.bases).toEqual([{ value: "merit", count: 1 }]);
      expect(body.degree_levels).toEqual([{ value: "bachelor", count: 1 }]);
    });

    it("resolves the detail by slug and by id, with criteria", async () => {
      await masterKnex("scholarship_eligibility_criteria").insert({
        scholarship_id: published.id,
        criteria_type: "gpa_minimum",
        label: "Minimum GPA",
        value: "3.5",
        sort_order: 0,
      });
      for (const key of [published.slug, published.id]) {
        const res = await get(`${PUBLIC}/${key}`);
        expect(res.statusCode).toBe(200);
        expect(res.json().id).toBe(published.id);
        expect(res.json().criteria).toHaveLength(1);
        expect(res.json().criteria[0].label).toBe("Minimum GPA");
      }
    });

    it("404s an unpublished detail rather than revealing it", async () => {
      const draft = await createViaAdmin({ title: `Draft ${runId}` });
      const res = await get(`${PUBLIC}/${draft.slug}`);
      expect(res.statusCode).toBe(404);
    });

    it("bumps the view count, and only for published rows", async () => {
      const before = await get(`${PUBLIC}/${published.slug}`);
      const res = await post(`${PUBLIC}/${published.slug}/view`);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
      const after = await get(`${PUBLIC}/${published.slug}`);
      expect(after.json().view_count).toBe(before.json().view_count + 1);
    });

    it("leaks no admin-only field on the list or the detail", async () => {
      const list = await get(`${PUBLIC}?q=Published Award ${runId}`);
      const detail = await get(`${PUBLIC}/${published.slug}`);
      for (const field of ADMIN_ONLY_FIELDS) {
        expect(Object.keys(list.json().scholarships[0])).not.toContain(field);
        expect(Object.keys(detail.json())).not.toContain(field);
      }
    });
  });

  // ── admin listing ─────────────────────────────────────────────────────────

  describe("admin listing", () => {
    it("returns the shared paginated envelope and includes unpublished rows", async () => {
      const res = await get(`${ADMIN}?q=${runId}&limit=100`, adminToken);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.meta).toMatchObject({ page: 1, limit: 100 });
      expect(body.data.some((s: { review_status: string }) => s.review_status === "pending")).toBe(true);
      expect(body.data.some((s: { review_status: string }) => s.review_status === "rejected")).toBe(true);
    });

    it("filters by review_status", async () => {
      const res = await get(`${ADMIN}?q=${runId}&review_status=rejected&limit=100`, adminToken);
      const statuses = res.json().data.map((s: { review_status: string }) => s.review_status);
      expect(new Set(statuses)).toEqual(new Set(["rejected"]));
    });

    it("reports moderation stats", async () => {
      const res = await get(`${ADMIN}/stats`, adminToken);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      for (const key of ["total", "published", "pending", "approved", "rejected", "featured"]) {
        expect(typeof body[key]).toBe("number");
      }
    });
  });
});
