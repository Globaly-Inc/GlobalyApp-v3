// Regression guard for the audit-trail bypass fixed in 550eb67.
//
// The admin JWT's `sub` is a platform_users.id. Everything downstream wants a
// superadmin.admin_users.id — admin_audit_logs.admin_id has a foreign key to it.
// The two id spaces do not overlap (on the dev database admin_users.id runs 9..16
// while their platform_user_id runs 27..44), so a route that passes `sub` through
// either violates the FK — a 500 on the very action being audited — or, where the
// numbers happen to collide, files the action against a DIFFERENT admin.
//
// That defect has now been introduced twice in this program. This suite makes the
// third time a test failure. It drives the routes through Fastify inject, because
// the bug lives at the route boundary and a service-level test cannot see it.
//
// The fixture deliberately forces sub !== admin_users.id, so the assertions
// distinguish the two rather than passing by luck.

import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Knex } from "knex";

import { dbAvailable, uniqueEmail } from "../helpers/db.js";
import {
  createInstitutionTenant,
  dropTenant,
  seedReferences,
  type Reference,
  type Tenant,
} from "../helpers/catalog-fixtures.js";

const describeDb = describe.skipIf(!dbAvailable);

const TAG = `g8a${process.pid}`;

describeDb("extraction audit actor resolution", () => {
  let app: FastifyInstance;
  let db: Knex;
  let ref: Reference;
  let tenant: Tenant;

  /** superadmin.admin_users.id — what every audit row must record. */
  let adminUsersId: number;
  /** platform_users.id — what the JWT carries as `sub`. Must never reach the audit row. */
  let jwtSub: number;
  let token: string;
  const decoys: number[] = [];
  const jobIds: string[] = [];

  beforeAll(async () => {
    ({ masterKnex: db } = await import("../../src/core/db/master-pool.js"));
    const { createSchemaKnex } = await import("../../src/core/db/knex.js");
    const jwt = (await import("jsonwebtoken")).default;
    const { config } = await import("../../src/config.js");

    // Burn a few platform_users ids so the admin's platform_user_id sits well above
    // its admin_users.id. Without this the two could coincide and the assertions
    // below would pass even with the bug present.
    for (let i = 0; i < 5; i++) {
      const [decoy] = await db("platform_users")
        .insert({ first_name: "Decoy", last_name: `${i}`, email: uniqueEmail(`g8.decoy${i}`) })
        .returning("id");
      decoys.push(decoy.id);
    }

    const [user] = await db("platform_users")
      .insert({ first_name: "G8", last_name: "Actor", email: uniqueEmail("g8.actor"), account_status: 1 })
      .returning("id");
    jwtSub = Number(user.id);
    const [admin] = await db("superadmin.admin_users")
      .insert({ platform_user_id: user.id, role: "data_admin" })
      .returning("id");
    adminUsersId = Number(admin.id);

    token = jwt.sign(
      { sub: String(jwtSub), type: "admin", role: "data_admin", email: `g8.actor.${TAG}@vitest.local` },
      config.JWT_SECRET,
      { expiresIn: "1h" },
    );

    const Fastify = (await import("fastify")).default;
    const { errorHandlerPlugin } = await import("../../src/core/plugins/error-handler.plugin.js");
    const { authPlugin } = await import("../../src/core/plugins/auth.plugin.js");
    const { requireSuperAdmin } = await import(
      "../../src/modules/superadmin/data-extraction/shared/require-super-admin.js"
    );
    const { jobsRoutes } = await import("../../src/modules/superadmin/data-extraction/routes/jobs.routes.js");
    const { qualityRoutes } = await import("../../src/modules/superadmin/data-extraction/routes/quality.routes.js");

    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    await app.register(async (scoped) => {
      await scoped.register(authPlugin);
      scoped.register(async (guarded) => {
        guarded.addHook("onRequest", requireSuperAdmin);
        guarded.register(
          async (mod) => {
            await mod.register(jobsRoutes);
            await mod.register(qualityRoutes);
          },
          { prefix: "/api/v3/admin/data-extraction" },
        );
      });
    });
    await app.ready();

    ref = await seedReferences(db, TAG);
    tenant = await createInstitutionTenant(db, createSchemaKnex, {
      name: `Actor Target ${TAG}`,
      website: `https://actor-${TAG}.edu.au`,
      countryId: ref.countryId,
      city: "Sydney",
    });
  });

  afterAll(async () => {
    await app?.close();
    for (const id of jobIds) await db("superadmin.extraction_jobs").where({ id }).del();
    await dropTenant(db, tenant);
    if (adminUsersId) await db("superadmin.admin_audit_logs").where({ admin_id: adminUsersId }).del();
    if (adminUsersId) await db("superadmin.admin_users").where({ id: adminUsersId }).del();
    if (jwtSub) await db("platform_users").where({ id: jwtSub }).del();
    if (decoys.length) await db("platform_users").whereIn("id", decoys).del();
    if (ref?.accreditationId) await db("accreditations").where({ id: ref.accreditationId }).del();
    if (ref?.feeTypeId) await db("fee_types").where({ id: ref.feeTypeId }).del();
  });

  beforeEach(async () => {
    await db("superadmin.admin_audit_logs").whereIn("admin_id", [adminUsersId, jwtSub]).del();
  });

  let seq = 0;

  /** A promoted job with two identical fees, so a merge has something to audit. */
  async function jobWithDuplicateFees(): Promise<string> {
    const [job] = await db("superadmin.extraction_jobs")
      .insert({
        institution_name: `Actor Target ${TAG}`,
        institution_url: `https://actor-${TAG}.edu.au`,
        status: "exported",
      })
      .returning("id");
    jobIds.push(job.id);
    await db("superadmin.extraction_promotions").insert({
      job_id: job.id,
      target_org_type: "institution",
      target_org_id: tenant.orgId,
      schema_name: tenant.schema,
      dry_run: false,
    });

    await tenant.db("service_fee_assignments").del();
    await tenant.db("service_fees").del();
    await tenant.db("business_services").del();

    let day = 0;
    for (const name of ["Nursing", "Midwifery"]) {
      day += 1;
      seq += 1;
      const [svc] = await tenant.db("business_services")
        .insert({ name, slug: `${name.toLowerCase()}-${TAG}-${seq}`, service_category_id: ref.categoryId })
        .returning("id");
      await tenant.db("service_fees").insert({
        service_id: svc.id,
        name: "Tuition",
        total_amount: 31000,
        currency: "AUD",
        created_at: new Date(Date.UTC(2026, 0, day)),
      });
    }
    return job.id;
  }

  // A function, not a const: the describe body runs before beforeAll assigns `token`.
  const auth = () => ({ authorization: `Bearer ${token}` });

  it("the fixture actually distinguishes the two id spaces", () => {
    expect(adminUsersId).not.toBe(jwtSub);
  });

  // The destructive one. A merge attributed to the wrong admin is worse than a
  // missing audit row: it is a false record of who destroyed data.
  it("attributes a merge to admin_users.id, never to the JWT sub", async () => {
    const jobId = await jobWithDuplicateFees();

    const res = await app.inject({
      method: "POST",
      url: `/api/v3/admin/data-extraction/jobs/${jobId}/merge-duplicates`,
      headers: auth(),
      payload: { dry_run: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().fees_merged).toBe(1);

    const rows = await db("superadmin.admin_audit_logs")
      .where({ action: "EXTRACTION_MERGE_DUPLICATES", entity_id: jobId })
      .select("admin_id");
    expect(rows).toHaveLength(1);
    expect(rows[0].admin_id).toBe(adminUsersId);
    expect(rows[0].admin_id).not.toBe(jwtSub);
  });

  it("attributes a quality audit to admin_users.id, never to the JWT sub", async () => {
    const [job] = await db("superadmin.extraction_jobs")
      .insert({ institution_name: `Q ${TAG}`, institution_url: `https://q-${TAG}.edu.au` })
      .returning("id");
    jobIds.push(job.id);
    await db("superadmin.extraction_courses").insert({
      job_id: job.id,
      name: "Bachelor of Nursing",
      degree_level: "Bachelor",
      international_fee_total: 12,
    });

    // No Gemini key in this environment, so the validator 503s by design — but only
    // AFTER the deterministic flags are written, and the route resolved the actor
    // before any of it. What matters here is that nothing was ever filed under `sub`.
    const res = await app.inject({
      method: "POST",
      url: `/api/v3/admin/data-extraction/jobs/${job.id}/validate-quality`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(503);

    expect(await db("superadmin.admin_audit_logs").where({ admin_id: jwtSub }).select("id")).toEqual([]);
  });

  // An id-space mismatch would surface here as a broken join: the audit row would
  // point at an admin_users row that does not exist, or at somebody else's.
  it("writes an audit row whose admin_id joins back to this admin", async () => {
    const jobId = await jobWithDuplicateFees();
    await app.inject({
      method: "POST",
      url: `/api/v3/admin/data-extraction/jobs/${jobId}/merge-duplicates`,
      headers: auth(),
      payload: { dry_run: false },
    });

    const joined = await db("superadmin.admin_audit_logs as l")
      .join("superadmin.admin_users as a", "a.id", "l.admin_id")
      .where("l.entity_id", jobId)
      .select("a.platform_user_id");
    expect(joined).toHaveLength(1);
    expect(joined[0].platform_user_id).toBe(jwtSub);
  });

  it("rejects an admin JWT with no admin_users record rather than writing a bad row", async () => {
    const jwt = (await import("jsonwebtoken")).default;
    const { config } = await import("../../src/config.js");
    const orphanToken = jwt.sign(
      { sub: String(decoys[0]), type: "admin", role: "data_admin", email: "orphan@vitest.local" },
      config.JWT_SECRET,
      { expiresIn: "1h" },
    );
    const jobId = await jobWithDuplicateFees();

    const res = await app.inject({
      method: "POST",
      url: `/api/v3/admin/data-extraction/jobs/${jobId}/merge-duplicates`,
      headers: { authorization: `Bearer ${orphanToken}` },
      payload: { dry_run: false },
    });
    expect(res.statusCode).toBe(403);
    expect(await db("superadmin.admin_audit_logs").where({ entity_id: jobId }).select("id")).toEqual([]);
  });
});
