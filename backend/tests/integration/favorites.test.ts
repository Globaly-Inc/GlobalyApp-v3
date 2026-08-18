// Favourites — the polymorphic saved-items list behind V1's StudentFavorites.tsx.
//
// Spec sources: V2 `favorites` + student-activity.ts's three routes (list newest
// first, idempotent save, owner-scoped delete), and V1's page, which groups saves
// into per-type tabs with a count badge each.
//
// Two things here are NOT ported from V1, because V1 had them wrong (§1.6):
//   D-G6-1  V1 deleted by `.eq("id", id)` with no owner predicate, relying on RLS
//           alone. V3 has no RLS — isolation is the app's job — so the delete is
//           scoped to the caller and a foreign id is a 404. Tested below.
//   D-G6-2  V1 rendered the raw `item_id` uuid as the item's title, so the page
//           showed rows of gibberish. V3 resolves each save to its target's real
//           title/slug, and a target that has since been removed resolves to null
//           instead of a dangling row or a crash.

import Fastify, { type FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dbAvailable, uniqueEmail } from "../helpers/db.js";

const describeDb = describe.skipIf(!dbAvailable);

describeDb("favorites", () => {
  let app: FastifyInstance;
  let masterKnex: Knex;
  let shutdownPools: () => Promise<void>;
  let config: Record<string, any>;

  let runId = "";
  let alice = 0;
  let bob = 0;
  let aliceToken = "";
  let bobToken = "";

  // Fixture targets, one per resolvable item_type we assert on.
  let scholarshipId = 0;
  let goneScholarshipId = 0;
  let institutionId = 0;
  let businessId = 0;
  let serviceUuid = "";

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const get = (url: string, token: string) => app.inject({ method: "GET", url, headers: auth(token) });
  const post = (url: string, token: string, payload?: unknown) =>
    app.inject({ method: "POST", url, headers: auth(token), payload: (payload ?? {}) as object });
  const del = (url: string, token: string) => app.inject({ method: "DELETE", url, headers: auth(token) });

  const save = (token: string, item_type: string, item_id: string) =>
    post("/api/v3/favorites", token, { item_type, item_id });

  beforeAll(async () => {
    const jwt = (await import("jsonwebtoken")).default;
    ({ masterKnex } = await import("../../src/core/db/master-pool.js"));
    ({ shutdownAll: shutdownPools } = await import("../../src/core/db/pool-manager.js"));
    ({ config } = (await import("../../src/config.js")) as unknown as { config: Record<string, any> });

    const { errorHandlerPlugin } = await import("../../src/core/plugins/error-handler.plugin.js");
    const { requestContextPlugin } = await import("../../src/core/plugins/request-context.plugin.js");
    const { authPlugin } = await import("../../src/core/plugins/auth.plugin.js");
    const favoritesModule = (await import("../../src/modules/favorites/index.js")).default;

    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    await app.register(requestContextPlugin);
    await app.register(async (protectedApp) => {
      await protectedApp.register(authPlugin);
      await protectedApp.register(favoritesModule);
    });
    await app.ready();

    runId = `${process.pid}${Date.now() % 1_000_000}`;

    const newUser = async (label: string) => {
      const [row] = await masterKnex("platform_users")
        .insert({
          first_name: "Fav",
          last_name: label,
          email: uniqueEmail(`fav.${label}`),
          account_status: 1,
        })
        .returning(["id"]);
      return row.id as number;
    };
    alice = await newUser("alice");
    bob = await newUser("bob");

    const sign = (id: number) =>
      jwt.sign(
        { sub: String(id), type: "platform_user", email: "fav@vitest.local" },
        config.JWT_SECRET as string,
      );
    aliceToken = sign(alice);
    bobToken = sign(bob);

    const newScholarship = async (label: string, deleted = false) => {
      const [row] = await masterKnex("scholarships")
        .insert({
          title: `Fav ${label} ${runId}`,
          slug: `fav-${label}-${runId}`,
          is_published: true,
          deleted_at: deleted ? masterKnex.fn.now() : null,
        })
        .returning(["id"]);
      return row.id as number;
    };
    scholarshipId = await newScholarship("live");
    goneScholarshipId = await newScholarship("gone", true);

    const [inst] = await masterKnex("institutions")
      .insert({
        platform_user_id: alice,
        first_name: "Inst",
        last_name: "Owner",
        email: uniqueEmail(`fav.inst`),
        subdomain: `fav-inst-${runId}`,
        institution_name: `Fav Institution ${runId}`,
      })
      .returning(["id"]);
    institutionId = inst.id as number;

    const [biz] = await masterKnex("businesses")
      .insert({
        owner_id: alice,
        subdomain: `fav-biz-${runId}`,
        business_name: `Fav Agency ${runId}`,
        account_status: 1,
      })
      .returning(["id", "schema_name"]);
    businessId = biz.id as number;

    // catalog_services is the master projection of every tenant service — the row
    // that makes a tenant-owned service resolvable from master without a
    // cross-tenant FK. Inserted directly here; the triggers are not under test.
    const [svc] = await masterKnex("catalog_services")
      .insert({
        service_id: masterKnex.raw("gen_random_uuid()"),
        schema_name: biz.schema_name,
        owner_org_type: "business",
        owner_org_id: businessId,
        name: `Fav Course ${runId}`,
        slug: `fav-course-${runId}`,
        is_published: true,
        is_featured: false,
        created_at: masterKnex.fn.now(),
        updated_at: masterKnex.fn.now(),
      })
      .returning(["service_id"]);
    serviceUuid = svc.service_id as string;
  });

  afterAll(async () => {
    await masterKnex?.("student_favorites").whereIn("platform_user_id", [alice, bob]).del();
    await masterKnex?.("catalog_services").where({ owner_org_id: businessId }).del();
    await masterKnex?.("businesses").whereIn("id", [businessId]).del();
    await masterKnex?.("institutions").whereIn("id", [institutionId]).del();
    await masterKnex?.("scholarships").whereIn("id", [scholarshipId, goneScholarshipId]).del();
    await masterKnex?.("platform_users").whereIn("id", [alice, bob]).del();
    await app?.close();
    await shutdownPools?.();
    await masterKnex?.destroy();
  });

  // ── auth ──────────────────────────────────────────────────────────────────

  it("requires a token on every route", async () => {
    for (const req of [
      app.inject({ method: "GET", url: "/api/v3/favorites" }),
      app.inject({ method: "POST", url: "/api/v3/favorites", payload: { item_type: "scholarship", item_id: "1" } }),
      app.inject({ method: "DELETE", url: "/api/v3/favorites/1" }),
    ]) {
      expect((await req).statusCode).toBe(401);
    }
  });

  // ── save ──────────────────────────────────────────────────────────────────

  it("saves an item and lists it back", async () => {
    const res = await save(aliceToken, "scholarship", String(scholarshipId));
    expect(res.statusCode).toBe(200);
    expect(res.json().saved).toBe(true);

    const list = await get("/api/v3/favorites", aliceToken);
    expect(list.statusCode).toBe(200);
    const row = list.json().data.find((f: any) => f.item_type === "scholarship");
    expect(row.item_id).toBe(String(scholarshipId));
  });

  it("is idempotent — saving twice leaves one row, per V2's unique constraint", async () => {
    await save(aliceToken, "institution", String(institutionId));
    const second = await save(aliceToken, "institution", String(institutionId));
    expect(second.statusCode).toBe(200);

    const rows = await masterKnex("student_favorites").where({
      platform_user_id: alice,
      item_type: "institution",
      item_id: String(institutionId),
    });
    expect(rows).toHaveLength(1);
  });

  it("takes the owner from the JWT, never from the body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v3/favorites",
      headers: auth(aliceToken),
      payload: { item_type: "business", item_id: String(businessId), platform_user_id: bob },
    });
    // .strict() — an unknown key is a 400, not a silently ignored field.
    expect(res.statusCode).toBe(400);
    expect(await masterKnex("student_favorites").where({ platform_user_id: bob }).first()).toBeUndefined();
  });

  it("400s a request with no body at all", async () => {
    // Exercises the `req.body ?? {}` fallback.
    const res = await app.inject({ method: "POST", url: "/api/v3/favorites", headers: auth(aliceToken) });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an item_type outside the vocabulary", async () => {
    // item_type has no DB CHECK on purpose (20260817_820) — this route is the guard.
    for (const bad of ["course", "agent", "platform_users", ""]) {
      expect((await save(aliceToken, bad, "1")).statusCode, bad).toBe(400);
    }
  });

  it("rejects an item_id of the wrong shape for its type", async () => {
    // A tenant service is keyed by uuid; every master target by serial int.
    expect((await save(aliceToken, "service", "42")).statusCode).toBe(400);
    expect((await save(aliceToken, "scholarship", serviceUuid)).statusCode).toBe(400);
  });

  // ── resolution (defect D-G6-2) ────────────────────────────────────────────

  it("resolves each save to its target's real title, not the raw id", async () => {
    await save(aliceToken, "service", serviceUuid);
    await save(aliceToken, "business", String(businessId));

    const rows = await get("/api/v3/favorites", aliceToken).then((r) => r.json().data);
    const byType = new Map(rows.map((r: any) => [r.item_type, r]));

    expect(byType.get("service").target.title).toBe(`Fav Course ${runId}`);
    expect(byType.get("service").target.slug).toBe(`fav-course-${runId}`);
    expect(byType.get("institution").target.title).toBe(`Fav Institution ${runId}`);
    expect(byType.get("business").target.title).toBe(`Fav Agency ${runId}`);
    expect(byType.get("scholarship").target.title).toBe(`Fav live ${runId}`);
  });

  it("resolves a removed target to null instead of a dangling row", async () => {
    await save(aliceToken, "scholarship", String(goneScholarshipId));
    const rows = await get("/api/v3/favorites?item_type=scholarship", aliceToken).then((r) => r.json().data);
    const gone = rows.find((r: any) => r.item_id === String(goneScholarshipId));
    expect(gone).toBeDefined();
    expect(gone.target).toBeNull();
  });

  it("filters by item_type and counts every type for the tab badges", async () => {
    const res = await get("/api/v3/favorites?item_type=scholarship", aliceToken);
    const body = res.json();
    expect(body.data.every((r: any) => r.item_type === "scholarship")).toBe(true);
    // counts are for the whole list, not the filtered page — V1's badges show totals.
    expect(body.counts.scholarship).toBe(2);
    expect(body.counts.institution).toBe(1);
    expect(body.counts.service).toBe(1);
    expect(body.counts.business).toBe(1);
  });

  it("lists newest first", async () => {
    const ids = await get("/api/v3/favorites", aliceToken).then((r) => r.json().data.map((f: any) => f.id));
    expect(ids).toEqual([...ids].sort((a: number, b: number) => b - a));
  });

  // ── isolation (defect D-G6-1) ─────────────────────────────────────────────

  it("never shows one student another student's favourites", async () => {
    await save(bobToken, "scholarship", String(scholarshipId));

    const aliceRows = await get("/api/v3/favorites", aliceToken).then((r) => r.json().data);
    const bobRows = await get("/api/v3/favorites", bobToken).then((r) => r.json().data);

    expect(bobRows).toHaveLength(1);
    expect(aliceRows.length).toBeGreaterThan(1);
    // Disjoint row ids: the same scholarship saved by both is two separate rows.
    const bobIds = new Set(bobRows.map((r: any) => r.id));
    expect(aliceRows.some((r: any) => bobIds.has(r.id))).toBe(false);
  });

  it("refuses a delete of someone else's favourite, and leaves it standing", async () => {
    const [victim] = await masterKnex("student_favorites")
      .where({ platform_user_id: alice, item_type: "institution" })
      .select("id");

    const res = await del(`/api/v3/favorites/${victim.id}`, bobToken);
    // 404, not 403: bob must not learn the row exists.
    expect(res.statusCode).toBe(404);
    expect(await masterKnex("student_favorites").where({ id: victim.id }).first()).toBeDefined();
  });

  it("deletes the caller's own favourite", async () => {
    const [own] = await masterKnex("student_favorites")
      .where({ platform_user_id: bob })
      .select("id");
    expect((await del(`/api/v3/favorites/${own.id}`, bobToken)).statusCode).toBe(204);
    expect(await masterKnex("student_favorites").where({ id: own.id }).first()).toBeUndefined();

    // Un-saving then re-saving must work — hard delete, so the unique key is free.
    expect((await save(bobToken, "scholarship", String(scholarshipId))).statusCode).toBe(200);
  });

  it("404s an unknown favourite id", async () => {
    expect((await del("/api/v3/favorites/99999999", aliceToken)).statusCode).toBe(404);
  });
});
