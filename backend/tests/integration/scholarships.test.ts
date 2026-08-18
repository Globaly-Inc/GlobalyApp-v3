// Scholarships (Wave G1) — public directory, admin moderation, business submission.
//
// The table, the admin CRUD routes and the public reads come from PR #57. This
// suite covers what G1 adds on top: the submission → pending → approved/rejected
// lifecycle (which neither V1 nor V2 has), the eligibility criteria and facets
// V2's contract includes, the view-count endpoint, and the leak boundary that
// moderation created — review_status and friends must never reach a visitor.
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
    const scholarshipsPublicModule = (await import("../../src/modules/scholarships/index.js")).default;
    const { businessScholarshipsModule } = await import("../../src/modules/scholarships/index.js");
    const monitoringModule = (await import("../../src/modules/superadmin/monitoring/index.js")).default;

    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    await app.register(requestContextPlugin);
    await app.register(async (scoped) => {
      await scoped.register(authPlugin);
      await scoped.register(tenantPlugin);
      await scoped.register(businessScholarshipsModule);
      await scoped.register(monitoringModule, { prefix: "/api/v3/admin/monitoring" });
    });
    await app.register(scholarshipsPublicModule);
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

    // admin_users.id is a real FK from admin_audit_logs, which the moderation
    // routes write — a made-up id fails the insert, not the moderation logic.
    const [admin] = await masterKnex("superadmin.admin_users")
      .insert({ platform_user_id: ownerUser, role: "super_admin" })
      .returning(["id"]);

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

    const sign = (claims: Record<string, unknown>) =>
      jwt.sign({ email: "sch@vitest.local", ...claims }, config.JWT_SECRET as string);

    adminToken = sign({ sub: String(admin.id), type: "admin", role: "super_admin" });
    bizToken = sign({ sub: String(ownerUser), type: "platform_user", orgId: biz.schema_name });
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
      coverage_amount: 15000,
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

  // ── admin moderation lifecycle (G1 addition — V1/V2 have none) ────────────

  describe("moderation", () => {
    it("a newly submitted scholarship is pending and unpublished", async () => {
      const row = await createViaAdmin();
      expect(row.review_status).toBe("pending");
      expect(row.is_published).toBe(false);
      // Slug is generated by the shared org trigger, not supplied by the caller.
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

    it("approve defaults to publishing when no body is sent", async () => {
      const row = await createViaAdmin();
      const res = await app.inject({
        method: "POST",
        url: `${ADMIN}/${row.id}/approve`,
        headers: auth(adminToken),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().is_published).toBe(true);
    });

    it("reject works with no note", async () => {
      const row = await createViaAdmin();
      const res = await app.inject({
        method: "POST",
        url: `${ADMIN}/${row.id}/reject`,
        headers: auth(adminToken),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().review_status).toBe("rejected");
      expect(res.json().review_note).toBeNull();
    });

    it("unpublishing an approved listing leaves it approved", async () => {
      const row = await createViaAdmin();
      await post(`${ADMIN}/${row.id}/approve`, adminToken, { publish: true });
      const res = await patch(`${ADMIN}/${row.id}/publish`, adminToken, { is_published: false });
      expect(res.json().is_published).toBe(false);
      expect(res.json().review_status).toBe("approved");
    });

    it("delete is a soft delete, and drops the row from the public list", async () => {
      const row = await createViaAdmin({ title: `Doomed ${runId}` });
      await post(`${ADMIN}/${row.id}/approve`, adminToken, { publish: true });
      const del = await app.inject({
        method: "DELETE",
        url: `${ADMIN}/${row.id}`,
        headers: auth(adminToken),
      });
      expect(del.statusCode).toBe(204);
      const stored = await masterKnex("scholarships").where({ id: row.id }).first();
      expect(stored).toBeTruthy();
      expect(stored.deleted_at).toBeTruthy();
      expect((await get(`${PUBLIC}?q=Doomed ${runId}`)).json().data).toHaveLength(0);
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
      const owners: number[] = res.json().data.map((s: { owner_org_id: number }) => s.owner_org_id);
      expect(new Set(owners)).toEqual(new Set([bizId]));
    });

    it("a business cannot publish or self-approve its own submission", async () => {
      const res = await post(BUSINESS, bizToken, {
        title: `Sneaky ${runId}`,
        is_published: true,
        review_status: "approved",
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().is_published).toBe(false);
      expect(res.json().review_status).toBe("pending");
    });

    it("a business cannot edit another org's listing", async () => {
      const foreign = await createViaAdmin({
        title: `Foreign ${runId}`,
        owner_org_type: "institution",
        owner_org_id: 1,
      });
      const res = await patch(`${BUSINESS}/${foreign.id}`, bizToken, { title: `Hijacked ${runId}` });
      // 404, not 403 — a 403 would confirm the row exists.
      expect(res.statusCode).toBe(404);
    });

    it("a business edits its own listing", async () => {
      const created = await post(BUSINESS, bizToken, { title: `Editable ${runId}` });
      const id = created.json().id;
      const res = await patch(`${BUSINESS}/${id}`, bizToken, {
        title: `Edited ${runId}`,
        provider_name: "New Provider",
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().title).toBe(`Edited ${runId}`);
      expect(res.json().provider_name).toBe("New Provider");
      // An edit must not be a way to re-parent or self-approve.
      expect(res.json().owner_org_id).toBe(bizId);
      expect(res.json().review_status).toBe("pending");
    });

    it("ignores an attempt to re-parent a listing through an edit", async () => {
      const created = await post(BUSINESS, bizToken, { title: `Reparent ${runId}` });
      const id = created.json().id;
      const res = await patch(`${BUSINESS}/${id}`, bizToken, {
        owner_org_type: "institution",
        owner_org_id: 1,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().owner_org_type).toBe("business");
      expect(res.json().owner_org_id).toBe(bizId);
    });

    it("rejects a javascript: URL rather than storing it for an href", async () => {
      const res = await post(BUSINESS, bizToken, {
        title: `XSS ${runId}`,
        application_url: "javascript:alert(1)",
      });
      expect(res.statusCode).toBe(400);
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

    it("lists only published rows", async () => {
      const res = await get(`${PUBLIC}?q=Published Award ${runId}`);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].title).toBe(`Published Award ${runId}`);
      expect(body.meta).toMatchObject({ page: 1, total: 1 });
    });

    it("never returns an unpublished or rejected row", async () => {
      expect((await get(`${PUBLIC}?q=Hidden Award ${runId}`)).json().data).toHaveLength(0);
    });

    it("filters by country", async () => {
      expect((await get(`${PUBLIC}?country=Nepal&q=Published Award ${runId}`)).json().meta.total).toBe(1);
      expect((await get(`${PUBLIC}?country=Peru&q=Published Award ${runId}`)).json().meta.total).toBe(0);
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

    it("resolves the detail by slug, with its eligibility criteria", async () => {
      await masterKnex("scholarship_eligibility_criteria").insert({
        scholarship_id: published.id,
        criteria_type: "gpa_minimum",
        label: "Minimum GPA",
        value: "3.5",
        sort_order: 0,
      });
      const res = await get(`${PUBLIC}/${published.slug}`);
      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe(published.id);
      expect(res.json().criteria).toHaveLength(1);
      expect(res.json().criteria[0].label).toBe("Minimum GPA");
    });

    it("404s an unpublished detail rather than revealing it", async () => {
      const draft = await createViaAdmin({ title: `Draft ${runId}` });
      expect((await get(`${PUBLIC}/${draft.slug}`)).statusCode).toBe(404);
    });

    it("bumps the view count through its own endpoint, not through the GET", async () => {
      const before = (await get(`${PUBLIC}/${published.slug}`)).json().view_count;
      // The read alone must not write — the page is served from a revalidated cache.
      expect((await get(`${PUBLIC}/${published.slug}`)).json().view_count).toBe(before);

      const res = await post(`${PUBLIC}/${published.slug}/view`);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
      expect((await get(`${PUBLIC}/${published.slug}`)).json().view_count).toBe(before + 1);
    });

    it("does not bump the view count of an unpublished row", async () => {
      const draft = await createViaAdmin({ title: `Uncounted ${runId}` });
      await post(`${PUBLIC}/${draft.slug}/view`);
      const stored = await masterKnex("scholarships").where({ id: draft.id }).first();
      expect(stored.view_count).toBe(0);
    });

    it("leaks no admin-only field on the list or the detail", async () => {
      const list = await get(`${PUBLIC}?q=Published Award ${runId}`);
      const detail = await get(`${PUBLIC}/${published.slug}`);
      for (const field of ADMIN_ONLY_FIELDS) {
        expect(Object.keys(list.json().data[0])).not.toContain(field);
        expect(Object.keys(detail.json())).not.toContain(field);
      }
    });
  });

  // ── admin listing ─────────────────────────────────────────────────────────

  describe("admin listing", () => {
    it("includes unpublished rows and accepts q as well as search", async () => {
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
      expect(statuses.length).toBeGreaterThan(0);
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
