// Saved filters — V2's Universal Filter system (user-prefs.ts `saved_filters` +
// `user_default_filters`), NOT a student favourite. §3.8 files them on one line with
// favourites and points at student-activity.ts, which contains no filter routes at
// all; see the wave report.
//
// Three V2 behaviours are deliberately NOT ported (§1.6):
//   D-G6-3  V2 pinned organization_id to IS NULL on every query, so `shared = true`
//           published a filter to EVERY authenticated caller on the platform — its
//           own comment concedes the backing RLS policy had no USING clause. V3
//           matches the real scope, so shared reaches that scope and no further.
//   D-G6-4  V2's user_default_filters was UNIQUE on a key containing a nullable
//           column, so ON CONFLICT could never match and V2 used a read-then-write
//           that races two concurrent PUTs into two rows. V3's key has no nullable
//           part and the upsert is one atomic statement.
//   D-G6-5  V2 typed filter_config as z.any(). V3 bounds it (see
//           tests/unit/saved-filter-config.test.ts) and treats it strictly as data.

import Fastify, { type FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dbAvailable, uniqueEmail } from "../helpers/db.js";

const describeDb = describe.skipIf(!dbAvailable);

describeDb("saved filters", () => {
  let app: FastifyInstance;
  let masterKnex: Knex;
  let shutdownPools: () => Promise<void>;
  let config: Record<string, any>;

  let runId = "";
  // alice and mate both work in business A; carol works in business B.
  let alice = 0;
  let mate = 0;
  let carol = 0;
  let bizA = 0;
  let bizB = 0;
  let aliceA = ""; // alice, in business A context
  let mateA = "";  // mate, in business A context
  let carolB = ""; // carol, in business B context
  let alicePersonal = ""; // alice, no business context

  const MODULE = "enquiries";

  const auth = (t: string) => ({ authorization: `Bearer ${t}` });
  const get = (url: string, t: string) => app.inject({ method: "GET", url, headers: auth(t) });
  const post = (url: string, t: string, payload?: unknown) =>
    app.inject({ method: "POST", url, headers: auth(t), payload: (payload ?? {}) as object });
  const put = (url: string, t: string, payload: unknown) =>
    app.inject({ method: "PUT", url, headers: auth(t), payload: payload as object });
  const del = (url: string, t: string) => app.inject({ method: "DELETE", url, headers: auth(t) });

  const create = (t: string, body: Record<string, unknown>) =>
    post("/api/v3/filters", t, { module_key: MODULE, filter_config: {}, ...body });
  const listIds = async (t: string) =>
    (await get(`/api/v3/filters?module_key=${MODULE}`, t).then((r) => r.json())).data.map(
      (f: any) => f.id as number,
    );

  beforeAll(async () => {
    const jwt = (await import("jsonwebtoken")).default;
    ({ masterKnex } = await import("../../src/core/db/master-pool.js"));
    ({ shutdownAll: shutdownPools } = await import("../../src/core/db/pool-manager.js"));
    ({ config } = (await import("../../src/config.js")) as unknown as { config: Record<string, any> });

    const { errorHandlerPlugin } = await import("../../src/core/plugins/error-handler.plugin.js");
    const { requestContextPlugin } = await import("../../src/core/plugins/request-context.plugin.js");
    const { authPlugin } = await import("../../src/core/plugins/auth.plugin.js");
    const { tenantPlugin } = await import("../../src/core/plugins/tenant.plugin.js");
    const { provisionBusinessSchema } = await import("../../src/core/business/provisioner.js");
    const favoritesModule = (await import("../../src/modules/favorites/index.js")).default;

    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    await app.register(requestContextPlugin);
    await app.register(async (protectedApp) => {
      await protectedApp.register(authPlugin);
      await protectedApp.register(tenantPlugin);
      await protectedApp.register(favoritesModule);
    });
    await app.ready();

    runId = `${process.pid}${Date.now() % 1_000_000}`;

    const newUser = async (label: string) => {
      const [row] = await masterKnex("platform_users")
        .insert({ first_name: "Filt", last_name: label, email: uniqueEmail(`filt.${label}`), account_status: 1 })
        .returning(["id"]);
      return row.id as number;
    };
    alice = await newUser("alice");
    mate = await newUser("mate");
    carol = await newUser("carol");

    const newBiz = async (owner: number, label: string) => {
      const [row] = await masterKnex("businesses")
        .insert({
          owner_id: owner,
          subdomain: `filt-${label}-${runId}`,
          business_name: `Filt ${label} ${runId}`,
          account_status: 1,
        })
        .returning(["id", "schema_name"]);
      await provisionBusinessSchema(row.schema_name as string);
      return row as { id: number; schema_name: string };
    };
    const a = await newBiz(alice, "a");
    const b = await newBiz(carol, "b");
    bizA = a.id;
    bizB = b.id;

    const sign = (id: number, orgId?: string) =>
      jwt.sign(
        { sub: String(id), type: "platform_user", email: "filt@vitest.local", ...(orgId ? { orgId } : {}) },
        config.JWT_SECRET as string,
      );
    aliceA = sign(alice, a.schema_name);
    mateA = sign(mate, a.schema_name);
    carolB = sign(carol, b.schema_name);
    alicePersonal = sign(alice);
  });

  afterAll(async () => {
    const ids = [alice, mate, carol];
    await masterKnex?.("user_default_filters").whereIn("platform_user_id", ids).del();
    await masterKnex?.("saved_filters").whereIn("created_by", ids).del();
    await masterKnex?.("businesses").whereIn("id", [bizA, bizB]).del();
    await masterKnex?.("platform_users").whereIn("id", ids).del();
    await app?.close();
    await shutdownPools?.();
    await masterKnex?.destroy();
  });

  it("requires a token", async () => {
    expect((await app.inject({ method: "GET", url: `/api/v3/filters?module_key=${MODULE}` })).statusCode).toBe(401);
  });

  it("requires module_key on the list", async () => {
    expect((await get("/api/v3/filters", aliceA)).statusCode).toBe(400);
  });

  // ── create ────────────────────────────────────────────────────────────────

  it("creates a filter owned by the caller, in the caller's business scope", async () => {
    const res = await create(aliceA, {
      name: "Open in AU",
      description: "unassigned only",
      filter_config: { status: "open", country_id: [1, 2] },
    });
    expect(res.statusCode).toBe(201);
    const id = res.json().id;

    const row = await masterKnex("saved_filters").where({ id }).first();
    expect(row.created_by).toBe(alice);
    expect(row.business_id).toBe(bizA);
    expect(row.shared).toBe(false);
    expect(row.use_count).toBe(0);
  });

  it("stores a personal-scope filter with a null business_id", async () => {
    const id = (await create(alicePersonal, { name: `personal ${runId}` })).json().id;
    expect((await masterKnex("saved_filters").where({ id }).first()).business_id).toBeNull();
  });

  it("round-trips filter_config verbatim, SQL-looking text included", async () => {
    // filter_config is data. It is never interpolated, so quotes are just characters
    // and the value that comes back is byte-identical to the value that went in.
    const filter_config = { q: "'; DROP TABLE saved_filters; --", status: ["a' OR 1=1", "b"] };
    const id = (await create(aliceA, { name: `sqlish ${runId}`, filter_config })).json().id;

    const listed = (await get(`/api/v3/filters?module_key=${MODULE}`, aliceA).then((r) => r.json())).data.find(
      (f: any) => f.id === id,
    );
    expect(listed.filter_config).toEqual(filter_config);
    // And the table is still there.
    expect(await masterKnex("saved_filters").where({ id }).first()).toBeDefined();
  });

  // ── visibility / isolation (defect D-G6-3) ────────────────────────────────

  it("hides a private filter from everyone but its owner", async () => {
    const id = (await create(aliceA, { name: `private ${runId}` })).json().id;
    expect(await listIds(aliceA)).toContain(id);
    expect(await listIds(mateA)).not.toContain(id);
    expect(await listIds(carolB)).not.toContain(id);
  });

  it("shares a filter within its own business scope, and no further", async () => {
    const id = (await create(aliceA, { name: `shared ${runId}`, shared: true })).json().id;
    // mate is in the same business — this is what `shared` is for.
    expect(await listIds(mateA)).toContain(id);
    // carol is in a different business. V2 would have shown it to her.
    expect(await listIds(carolB)).not.toContain(id);
    // And alice herself, with no business context, is a different scope.
    expect(await listIds(alicePersonal)).not.toContain(id);
  });

  it("does not leak a shared personal-scope filter into a business scope", async () => {
    const id = (await create(alicePersonal, { name: `personal shared ${runId}`, shared: true })).json().id;
    expect(await listIds(alicePersonal)).toContain(id);
    expect(await listIds(mateA)).not.toContain(id);
  });

  it("scopes the list to one module_key", async () => {
    const id = (await create(aliceA, { name: `other module ${runId}`, module_key: "applicants" })).json().id;
    expect(await listIds(aliceA)).not.toContain(id);
    const other = await get("/api/v3/filters?module_key=applicants", aliceA).then((r) => r.json());
    expect(other.data.map((f: any) => f.id)).toContain(id);
  });

  // ── apply ─────────────────────────────────────────────────────────────────

  it("bumps use_count server-side", async () => {
    const id = (await create(aliceA, { name: `applied ${runId}` })).json().id;
    expect((await post(`/api/v3/filters/${id}/apply`, aliceA)).json().use_count).toBe(1);
    expect((await post(`/api/v3/filters/${id}/apply`, aliceA)).json().use_count).toBe(2);
  });

  it("404s an apply on a filter the caller cannot see", async () => {
    const id = (await create(aliceA, { name: `hidden ${runId}` })).json().id;
    expect((await post(`/api/v3/filters/${id}/apply`, carolB)).statusCode).toBe(404);
    expect((await masterKnex("saved_filters").where({ id }).first()).use_count).toBe(0);
  });

  // ── delete ────────────────────────────────────────────────────────────────

  it("soft-deletes the owner's own filter and drops it from the list", async () => {
    const id = (await create(aliceA, { name: `doomed ${runId}`, shared: true })).json().id;
    expect((await del(`/api/v3/filters/${id}`, aliceA)).statusCode).toBe(204);

    const row = await masterKnex("saved_filters").where({ id }).first();
    expect(row).toBeDefined(); // soft, not hard
    expect(row.deleted_at).not.toBeNull();
    expect(await listIds(aliceA)).not.toContain(id);
    expect(await listIds(mateA)).not.toContain(id);
  });

  it("refuses a delete by anyone but the owner, even a teammate who can see it", async () => {
    const id = (await create(aliceA, { name: `mates ${runId}`, shared: true })).json().id;
    expect(await listIds(mateA)).toContain(id); // mate CAN read it …
    expect((await del(`/api/v3/filters/${id}`, mateA)).statusCode).toBe(404); // … but not delete it
    expect((await masterKnex("saved_filters").where({ id }).first()).deleted_at).toBeNull();
  });

  // ── default filter (defect D-G6-4) ────────────────────────────────────────

  it("sets, reads and clears the caller's default for one module", async () => {
    const id = (await create(aliceA, { name: `default ${runId}` })).json().id;

    expect((await get(`/api/v3/filters/default?module_key=${MODULE}`, aliceA)).json().filter_id).toBeNull();
    expect((await put("/api/v3/filters/default", aliceA, { module_key: MODULE, filter_id: id })).statusCode).toBe(200);
    expect((await get(`/api/v3/filters/default?module_key=${MODULE}`, aliceA)).json().filter_id).toBe(id);

    expect((await put("/api/v3/filters/default", aliceA, { module_key: MODULE, filter_id: null })).statusCode).toBe(200);
    expect((await get(`/api/v3/filters/default?module_key=${MODULE}`, aliceA)).json().filter_id).toBeNull();
  });

  it("upserts the default in one row, not two", async () => {
    const first = (await create(aliceA, { name: `d1 ${runId}` })).json().id;
    const second = (await create(aliceA, { name: `d2 ${runId}` })).json().id;
    await put("/api/v3/filters/default", aliceA, { module_key: "upsert-check", filter_id: first });
    await put("/api/v3/filters/default", aliceA, { module_key: "upsert-check", filter_id: second });

    const rows = await masterKnex("user_default_filters").where({
      platform_user_id: alice,
      module_key: "upsert-check",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].filter_id).toBe(second);
  });

  it("refuses to default to a filter the caller cannot see", async () => {
    const id = (await create(aliceA, { name: `not yours ${runId}` })).json().id;
    const res = await put("/api/v3/filters/default", carolB, { module_key: MODULE, filter_id: id });
    expect(res.statusCode).toBe(404);
    expect(await masterKnex("user_default_filters").where({ platform_user_id: carol }).first()).toBeUndefined();
  });

  it("keeps each user's default separate", async () => {
    const id = (await create(aliceA, { name: `mine ${runId}`, shared: true })).json().id;
    await put("/api/v3/filters/default", aliceA, { module_key: "per-user", filter_id: id });
    expect((await get("/api/v3/filters/default?module_key=per-user", mateA)).json().filter_id).toBeNull();
  });
});
