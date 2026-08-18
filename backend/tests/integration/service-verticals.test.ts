// The eight V3-only service verticals — routes, review and promote (Wave G9).
//
// §3.4's last extraction gap row: "Tables + jobs-repo whitelist exist; no
// dedicated routes or UI tabs". Verified true — superadmin/20260812_001..008 are
// referenced by exactly one file (the SERVICE_NAME_TABLES whitelist in
// jobs.repository.ts) and by nothing else in src, tests or the frontend.
//
// There is no V1 or V2 equivalent of these tables, so the contract under test is
// the behaviour of V3's own extraction verticals — the immigration family
// (routes/immigration.routes.ts, Wave G1):
//
//   * list / discard / promote per vertical, super_admin or data_admin only;
//   * the promote target resolved as a polymorphic (org_type, org_id) pair, with
//     the tenant schema provisioned before the transaction;
//   * `extraction_source_id` idempotency, so a second promote updates in place;
//   * every mutation audited against superadmin.admin_users.id — NOT the JWT
//     `sub`, which is a platform_users.id (see shared/admin-id.ts);
//   * scraped contact PII left in staging, the boundary visas.test.ts asserts for
//     MARA agents.
//
// Driven through app.inject rather than the service functions, because the actor
// resolution and the slug whitelist both live at the route boundary.

import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dbAvailable, uniqueEmail } from "../helpers/db.js";
import { createInstitutionTenant, dropTenant, type Tenant } from "../helpers/catalog-fixtures.js";

const describeDb = describe.skipIf(!dbAvailable);

const TAG = `g9${process.pid}`;

/** Contact columns a published catalog row must never carry. */
const CONTACT_PII = ["contact_name", "contact_email", "contact_phone", "contact_whatsapp"];

describeDb("service verticals (accommodation … transport)", () => {
  let app: FastifyInstance;
  let db: Knex;
  let shutdownPools: () => Promise<void>;
  let tenant: Tenant;

  /** superadmin.admin_users.id — what every audit row must record. */
  let adminUsersId = 0;
  /** platform_users.id — what the JWT carries. Must never reach an audit row. */
  let jwtSub = 0;
  let token = "";
  const decoys: number[] = [];

  let jobId = "";
  let accommodationCategoryId = 0;
  const stagedIds: Record<string, string> = {};

  const auth = () => ({ authorization: `Bearer ${token}` });
  const url = (path: string) => `/api/v3/admin/data-extraction${path}`;

  beforeAll(async () => {
    ({ masterKnex: db } = await import("../../src/core/db/master-pool.js"));
    ({ shutdownAll: shutdownPools } = await import("../../src/core/db/pool-manager.js"));
    const { createSchemaKnex } = await import("../../src/core/db/knex.js");
    const jwt = (await import("jsonwebtoken")).default;
    const { config } = await import("../../src/config.js");

    // Force sub !== admin_users.id, so the audit assertions distinguish the two id
    // spaces instead of passing by coincidence.
    for (let i = 0; i < 4; i++) {
      const [decoy] = await db("platform_users")
        .insert({ first_name: "Decoy", last_name: `${i}`, email: uniqueEmail(`g9.decoy${i}`) })
        .returning("id");
      decoys.push(decoy.id);
    }
    const [user] = await db("platform_users")
      .insert({ first_name: "G9", last_name: "Actor", email: uniqueEmail("g9.actor"), account_status: 1 })
      .returning("id");
    jwtSub = Number(user.id);
    const [admin] = await db("superadmin.admin_users")
      .insert({ platform_user_id: user.id, role: "data_admin" })
      .returning("id");
    adminUsersId = Number(admin.id);
    token = jwt.sign(
      { sub: String(jwtSub), type: "admin", role: "data_admin", email: `g9.${TAG}@vitest.local` },
      config.JWT_SECRET,
      { expiresIn: "1h" },
    );

    const Fastify = (await import("fastify")).default;
    const { errorHandlerPlugin } = await import("../../src/core/plugins/error-handler.plugin.js");
    const { authPlugin } = await import("../../src/core/plugins/auth.plugin.js");
    const { requireSuperAdmin } = await import(
      "../../src/modules/superadmin/data-extraction/shared/require-super-admin.js"
    );
    const { serviceVerticalsRoutes } = await import(
      "../../src/modules/superadmin/data-extraction/routes/service-verticals.routes.js"
    );

    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    await app.register(async (scoped) => {
      await scoped.register(authPlugin);
      scoped.register(async (guarded) => {
        guarded.addHook("onRequest", requireSuperAdmin);
        guarded.register(async (mod) => mod.register(serviceVerticalsRoutes), {
          prefix: "/api/v3/admin/data-extraction",
        });
      });
    });
    await app.ready();

    // The eight verticals are keyed on public.service_categories.slug — that is how
    // serviceTableForSlug() already maps a service job to its staging table. The
    // rows are reference data (V1 import), upserted here so the suite does not
    // depend on an import having run.
    const [category] = await db("service_categories")
      .insert({ slug: "accommodation", name: "Accommodation" })
      .onConflict("slug")
      .merge({ name: "Accommodation" })
      .returning("id");
    accommodationCategoryId = Number(category.id);

    tenant = await createInstitutionTenant(db, createSchemaKnex, {
      name: `Vertical Target ${TAG}`,
      website: `https://vertical-${TAG}.example`,
    });

    const [job] = await db("superadmin.extraction_jobs")
      .insert({
        institution_name: `Vertical job ${TAG}`,
        institution_url: `https://vertical-${TAG}.example`,
        service_category_id: accommodationCategoryId,
        status: "completed",
      })
      .returning("id");
    jobId = job.id;

    const [room] = await db("superadmin.extraction_accommodation")
      .insert({
        job_id: jobId,
        status: "pending",
        name: `Sunnyside Student Living ${TAG}`,
        provider_name: "Sunnyside Group",
        type: "student_housing",
        description: "Purpose-built student accommodation near campus.",
        city: "Sydney",
        country_code: "AU",
        price_amount: 320.5,
        price_currency: "AUD",
        price_period: "per_week",
        wifi_included: true,
        amenities: JSON.stringify(["wifi", "aircon"]),
        // Scraped contact details. These must stay here.
        contact_name: "Jane Landlord",
        contact_email: `jane.${TAG}@sunnyside.example`,
        contact_phone: "+61400000000",
        website: "https://sunnyside.example/live",
        source_url: "https://sunnyside.example/live",
        confidence_score: 0.87,
        raw_payload: JSON.stringify({ scraped: "x".repeat(2000) }),
      })
      .returning("id");
    stagedIds.room = room.id;

    const [reject] = await db("superadmin.extraction_accommodation")
      .insert({ job_id: jobId, status: "pending", name: `Rejectable ${TAG}` })
      .returning("id");
    stagedIds.reject = reject.id;

    // One row in a second vertical, so the per-vertical counts are shown to be
    // per-table and not a single shared query.
    const [course] = await db("superadmin.extraction_test_preparation")
      .insert({
        job_id: jobId,
        status: "pending",
        name: `IELTS Intensive ${TAG}`,
        test_type: "IELTS",
        fee_amount: 890,
        fee_currency: "AUD",
        fee_period: "per_course",
      })
      .returning("id");
    stagedIds.testPrep = course.id;
  });

  afterAll(async () => {
    await app?.close();
    if (jobId) {
      await db("superadmin.extraction_accommodation").where({ job_id: jobId }).del();
      await db("superadmin.extraction_test_preparation").where({ job_id: jobId }).del();
      await db("superadmin.extraction_jobs").where({ id: jobId }).del();
    }
    await dropTenant(db, tenant);
    if (adminUsersId) await db("superadmin.admin_audit_logs").where({ admin_id: adminUsersId }).del();
    if (adminUsersId) await db("superadmin.admin_users").where({ id: adminUsersId }).del();
    if (jwtSub) await db("platform_users").where({ id: jwtSub }).del();
    if (decoys.length) await db("platform_users").whereIn("id", decoys).del();
    await shutdownPools?.();
    await db?.destroy();
  });

  // ── registry + list ───────────────────────────────────────────────────────

  it("the fixture actually distinguishes the two id spaces", () => {
    expect(adminUsersId).not.toBe(jwtSub);
  });

  it("lists the eight verticals with per-status counts", async () => {
    const res = await app.inject({ method: "GET", url: url("/service-verticals"), headers: auth() });
    expect(res.statusCode).toBe(200);

    const { verticals } = res.json();
    expect(verticals).toHaveLength(8);
    expect(verticals.map((v: { slug: string }) => v.slug).sort()).toEqual([
      "accommodation",
      "banking",
      "career_services",
      "insurance",
      "test_preparation",
      "translation",
      "transport",
      "visa_services",
    ]);

    const accommodation = verticals.find((v: { slug: string }) => v.slug === "accommodation");
    expect(accommodation.counts.pending).toBeGreaterThanOrEqual(2);
    const banking = verticals.find((v: { slug: string }) => v.slug === "banking");
    expect(banking.counts.pending).toBe(0);
  });

  it("lists one vertical's staged rows", async () => {
    const res = await app.inject({
      method: "GET",
      url: url("/service-verticals/accommodation?status=pending&limit=50"),
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);

    const { rows, vertical } = res.json();
    expect(vertical.slug).toBe("accommodation");
    const row = rows.find((r: { id: string }) => r.id === stagedIds.room);
    expect(row.name).toBe(`Sunnyside Student Living ${TAG}`);
    expect(row.type).toBe("student_housing");
    expect(Number(row.price_amount)).toBe(320.5);
  });

  it("selects columns explicitly — no raw scraper payload on the wire", async () => {
    const res = await app.inject({
      method: "GET",
      url: url("/service-verticals/accommodation"),
      headers: auth(),
    });
    const row = res.json().rows.find((r: { id: string }) => r.id === stagedIds.room);
    expect(row).not.toHaveProperty("raw_payload");
    expect(res.payload).not.toContain("x".repeat(2000));
  });

  it("reads a vertical whose type column is named differently", async () => {
    // extraction_test_preparation has `test_type`, not `type`. A shared column
    // list would select a column that does not exist and 500.
    const res = await app.inject({
      method: "GET",
      url: url("/service-verticals/test_preparation"),
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    const row = res.json().rows.find((r: { id: string }) => r.id === stagedIds.testPrep);
    expect(row.test_type).toBe("IELTS");
  });

  it("400s an unknown vertical rather than interpolating it into SQL", async () => {
    for (const slug of ["extraction_jobs", "accommodation; drop table x", "courses"]) {
      const res = await app.inject({
        method: "GET",
        url: url(`/service-verticals/${encodeURIComponent(slug)}`),
        headers: auth(),
      });
      expect(res.statusCode).toBe(400);
    }
  });

  it("401s without a token and 403s a non-admin role", async () => {
    const anon = await app.inject({ method: "GET", url: url("/service-verticals") });
    expect(anon.statusCode).toBe(401);

    const jwt = (await import("jsonwebtoken")).default;
    const { config } = await import("../../src/config.js");
    const studentToken = jwt.sign(
      { sub: String(decoys[0]), type: "platform_user", email: "student@vitest.local" },
      config.JWT_SECRET,
      { expiresIn: "1h" },
    );
    const forbidden = await app.inject({
      method: "GET",
      url: url("/service-verticals"),
      headers: { authorization: `Bearer ${studentToken}` },
    });
    expect(forbidden.statusCode).toBe(403);
  });

  // ── discard ───────────────────────────────────────────────────────────────

  it("discards a staged row and audits it against admin_users.id", async () => {
    const res = await app.inject({
      method: "POST",
      url: url(`/service-verticals/accommodation/${stagedIds.reject}/discard`),
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().updated).toBe(true);

    const staged = await db("superadmin.extraction_accommodation")
      .where({ id: stagedIds.reject })
      .first("status");
    expect(staged!.status).toBe("discarded");

    const rows = await db("superadmin.admin_audit_logs")
      .where({ action: "SERVICE_VERTICAL_DISCARD", entity_id: stagedIds.reject })
      .select("admin_id");
    expect(rows).toHaveLength(1);
    expect(rows[0].admin_id).toBe(adminUsersId);
    expect(rows[0].admin_id).not.toBe(jwtSub);
  });

  it("404s a discard of an unknown staged id", async () => {
    const res = await app.inject({
      method: "POST",
      url: url("/service-verticals/accommodation/00000000-0000-0000-0000-000000000000/discard"),
      headers: auth(),
    });
    expect(res.statusCode).toBe(404);
  });

  // ── promote ───────────────────────────────────────────────────────────────

  it("promotes a staged row into the tenant catalog", async () => {
    const res = await app.inject({
      method: "POST",
      url: url(`/service-verticals/accommodation/${stagedIds.room}/promote`),
      headers: auth(),
      payload: { target_org_type: "institution", target_org_id: tenant.orgId },
    });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.schema_name).toBe(tenant.schema);
    expect(body.service_id).toMatch(/^[0-9a-f-]{36}$/);

    const service = await tenant.db("business_services").where({ id: body.service_id }).first();
    expect(service.name).toBe(`Sunnyside Student Living ${TAG}`);
    expect(Number(service.price)).toBe(320.5);
    expect(service.price_currency).toBe("AUD");
    expect(service.price_type).toBe("per_week");
    expect(service.extraction_source_id).toBe(stagedIds.room);
    // Resolved from the vertical slug, not supplied by the caller.
    expect(service.service_category_id).toBe(accommodationCategoryId);

    const extra = service.category_specific_data;
    expect(extra.type).toBe("student_housing");
    expect(extra.city).toBe("Sydney");
    expect(extra.wifi_included).toBe(true);

    const staged = await db("superadmin.extraction_accommodation")
      .where({ id: stagedIds.room })
      .first("status", "promoted_service_id");
    expect(staged!.status).toBe("promoted");
    expect(staged!.promoted_service_id).toBe(body.service_id);
  });

  it("leaves scraped contact PII in staging", async () => {
    const service = await tenant.db("business_services")
      .where({ extraction_source_id: stagedIds.room })
      .first();
    const serialized = JSON.stringify(service);
    for (const field of CONTACT_PII) expect(serialized).not.toContain(field);
    expect(serialized).not.toContain(`jane.${TAG}@sunnyside.example`);
    expect(serialized).not.toContain("+61400000000");

    // Still on the staging row — dropped from the live row, not deleted.
    const staged = await db("superadmin.extraction_accommodation")
      .where({ id: stagedIds.room })
      .first("contact_email");
    expect(staged!.contact_email).toBe(`jane.${TAG}@sunnyside.example`);
  });

  it("audits the promote against admin_users.id, never the JWT sub", async () => {
    const rows = await db("superadmin.admin_audit_logs")
      .where({ action: "SERVICE_VERTICAL_PROMOTE", entity_id: stagedIds.room })
      .select("admin_id");
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const row of rows) {
      expect(row.admin_id).toBe(adminUsersId);
      expect(row.admin_id).not.toBe(jwtSub);
    }
    expect(await db("superadmin.admin_audit_logs").where({ admin_id: jwtSub }).select("id")).toEqual([]);
  });

  it("is idempotent — a second promote updates in place", async () => {
    const before = await tenant.db("business_services").count({ n: "*" }).first();
    const res = await app.inject({
      method: "POST",
      url: url(`/service-verticals/accommodation/${stagedIds.room}/promote`),
      headers: auth(),
      payload: { target_org_type: "institution", target_org_id: tenant.orgId },
    });
    expect(res.statusCode).toBe(200);
    const after = await tenant.db("business_services").count({ n: "*" }).first();
    expect(Number(after!.n)).toBe(Number(before!.n));
  });

  it("refuses to promote a row an admin already discarded", async () => {
    const res = await app.inject({
      method: "POST",
      url: url(`/service-verticals/accommodation/${stagedIds.reject}/promote`),
      headers: auth(),
      payload: { target_org_type: "institution", target_org_id: tenant.orgId },
    });
    expect(res.statusCode).toBe(400);
  });

  it("404s an unknown staged id and an unknown target org", async () => {
    const unknownRow = await app.inject({
      method: "POST",
      url: url("/service-verticals/accommodation/00000000-0000-0000-0000-000000000000/promote"),
      headers: auth(),
      payload: { target_org_type: "institution", target_org_id: tenant.orgId },
    });
    expect(unknownRow.statusCode).toBe(404);

    const unknownOrg = await app.inject({
      method: "POST",
      url: url(`/service-verticals/test_preparation/${stagedIds.testPrep}/promote`),
      headers: auth(),
      payload: { target_org_type: "institution", target_org_id: 99_999_999 },
    });
    expect(unknownOrg.statusCode).toBe(404);
  });

  it("400s a promote with no target org", async () => {
    const res = await app.inject({
      method: "POST",
      url: url(`/service-verticals/test_preparation/${stagedIds.testPrep}/promote`),
      headers: auth(),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an admin JWT with no admin_users record rather than writing a bad audit row", async () => {
    const jwt = (await import("jsonwebtoken")).default;
    const { config } = await import("../../src/config.js");
    const orphan = jwt.sign(
      { sub: String(decoys[1]), type: "admin", role: "data_admin", email: "orphan@vitest.local" },
      config.JWT_SECRET,
      { expiresIn: "1h" },
    );
    const res = await app.inject({
      method: "POST",
      url: url(`/service-verticals/test_preparation/${stagedIds.testPrep}/discard`),
      headers: { authorization: `Bearer ${orphan}` },
    });
    expect(res.statusCode).toBe(403);

    const staged = await db("superadmin.extraction_test_preparation")
      .where({ id: stagedIds.testPrep })
      .first("status");
    expect(staged!.status).toBe("pending");
  });
});
