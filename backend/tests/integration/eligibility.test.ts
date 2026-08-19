// Eligibility checker — V1's `check-eligibility` edge function + StudentEligibility.tsx.
//
// The unit suite (tests/unit/eligibility-rules.test.ts) owns the rules. This file
// owns everything the rules cannot see: the master placement, the owner predicate,
// the publish filter, and the fail-closed branch.
//
// TWO DEFECTS V1 SHIPPED, FIXED HERE AND ASSERTED BELOW:
//   V1 relied on RLS alone for isolation ("Students can view own eligibility checks"
//   USING student_id = auth.uid()). V3 has no RLS — isolation is the app's job — so
//   the owner predicate lives in the repository and is proven here: student A cannot
//   read student B's checks by ANY route this module exposes.
//
//   V1's function read `category_specific_data` with `|| {}`, so a service whose row
//   could not be read evaluated to "eligible against no requirements" — a fabricated
//   pass. V3 answers 503 instead.

import Fastify, { type FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dbAvailable, uniqueEmail } from "../helpers/db.js";

const describeDb = describe.skipIf(!dbAvailable);

describeDb("eligibility checks", () => {
  let app: FastifyInstance;
  let masterKnex: Knex;
  let shutdownPools: () => Promise<void>;
  let config: Record<string, any>;

  let runId = "";
  let alice = 0;
  let bob = 0;
  let aliceToken = "";
  let bobToken = "";
  let businessId = 0;
  let schemaName = "";
  let countryId = 0;

  // Three catalog rows: one live and checkable, one unpublished, one whose tenant
  // row does not exist (the fail-closed case).
  let liveService = "";
  let unpublishedService = "";
  let orphanService = "";
  let withdrawnService = "";

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const get = (url: string, token: string) => app.inject({ method: "GET", url, headers: auth(token) });
  const check = (token: string, service_id: string) =>
    app.inject({ method: "POST", url: "/api/v3/eligibility", headers: auth(token), payload: { service_id } });

  beforeAll(async () => {
    const jwt = (await import("jsonwebtoken")).default;
    ({ masterKnex } = await import("../../src/core/db/master-pool.js"));
    ({ shutdownAll: shutdownPools } = await import("../../src/core/db/pool-manager.js"));
    ({ config } = (await import("../../src/config.js")) as unknown as { config: Record<string, any> });

    const { errorHandlerPlugin } = await import("../../src/core/plugins/error-handler.plugin.js");
    const { requestContextPlugin } = await import("../../src/core/plugins/request-context.plugin.js");
    const { authPlugin } = await import("../../src/core/plugins/auth.plugin.js");
    const eligibilityModule = (await import("../../src/modules/eligibility/index.js")).default;

    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    await app.register(requestContextPlugin);
    await app.register(async (protectedApp) => {
      await protectedApp.register(authPlugin);
      await protectedApp.register(eligibilityModule);
    });
    await app.ready();

    runId = `${process.pid}${Date.now() % 1_000_000}`;

    const newUser = async (label: string) => {
      const [row] = await masterKnex("platform_users")
        .insert({ first_name: "Elig", last_name: label, email: uniqueEmail(`elig.${label}`), account_status: 1 })
        .returning(["id"]);
      return row.id as number;
    };
    alice = await newUser("alice");
    bob = await newUser("bob");

    const sign = (id: number) =>
      jwt.sign({ sub: String(id), type: "platform_user", email: "elig@vitest.local" }, config.JWT_SECRET as string);
    aliceToken = sign(alice);
    bobToken = sign(bob);

    const country = await masterKnex("countries").select("id").first();
    countryId = country.id as number;

    // Alice: a full academic profile. Bob: a profile that exists but is empty, so
    // his verdicts differ from hers on the same course.
    await masterKnex("platform_user_profiles").insert([
      {
        user_id: alice,
        highest_degree_level: "bachelor",
        gpa: 3.6,
        english_test_type: "ielts",
        english_test_score: 7.5,
        budget_max: 60000,
        preferred_destinations: JSON.stringify([countryId]),
        completion_percentage: 90,
      },
      // Nulls on purpose: the two columns the service layer has to normalise before
      // the rule engine sees them (a jsonb null is not an empty array, and a null
      // completion percentage is not 0).
      { user_id: bob, preferred_destinations: null, completion_percentage: null },
    ]);

    const [biz] = await masterKnex("businesses")
      .insert({
        owner_id: alice,
        subdomain: `elig-biz-${runId}`,
        business_name: `Elig College ${runId}`,
        account_status: 1,
        country_id: countryId,
      })
      .returning(["id", "schema_name"]);
    businessId = biz.id as number;
    schemaName = biz.schema_name as string;

    // A real tenant schema with a real business_services row: the requirements the
    // rules read live there and nowhere else, so the cross-schema read is exercised
    // for real rather than stubbed.
    await masterKnex.raw(`CREATE SCHEMA IF NOT EXISTS ??`, [schemaName]);
    await masterKnex.raw(
      `CREATE TABLE IF NOT EXISTS ??.business_services (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         name text NOT NULL,
         category_specific_data jsonb NOT NULL DEFAULT '{}',
         meta jsonb NOT NULL DEFAULT '{"internal_score": 99}',
         deleted_at timestamptz NULL
       )`,
      [schemaName],
    );

    const project = async (
      label: string,
      opts: { published: boolean; price?: number; tenantRow?: Record<string, unknown> | null },
    ) => {
      const [{ service_id }] = await masterKnex("catalog_services")
        .insert({
          service_id: masterKnex.raw("gen_random_uuid()"),
          schema_name: schemaName,
          owner_org_type: "business",
          owner_org_id: businessId,
          name: `Elig ${label} ${runId}`,
          slug: `elig-${label}-${runId}`,
          price: opts.price ?? null,
          price_currency: opts.price ? "AUD" : null,
          is_published: opts.published,
          is_featured: false,
          created_at: masterKnex.fn.now(),
          updated_at: masterKnex.fn.now(),
        })
        .returning(["service_id"]);
      if (opts.tenantRow !== null) {
        await masterKnex(`${schemaName}.business_services`).insert({
          id: service_id,
          name: `Elig ${label} ${runId}`,
          category_specific_data: JSON.stringify(opts.tenantRow ?? {}),
        });
      }
      return service_id as string;
    };

    liveService = await project("live", {
      published: true,
      price: 30000,
      tenantRow: { min_degree_level: "bachelor", min_gpa: 3.0, english_test_required: true, min_ielts: 6.5 },
    });
    unpublishedService = await project("draft", { published: false, tenantRow: {} });
    // Projected but with NO tenant row — the state the fail-closed branch exists for.
    orphanService = await project("orphan", { published: true, tenantRow: null });
    // Checked against, then removed from the catalog: the history must survive it.
    withdrawnService = await project("withdrawn", { published: true, tenantRow: {} });
  });

  afterAll(async () => {
    await masterKnex?.("student_eligibility_checks").whereIn("platform_user_id", [alice, bob]).del();
    await masterKnex?.("catalog_services").where({ owner_org_id: businessId }).del();
    if (schemaName) await masterKnex?.raw(`DROP SCHEMA IF EXISTS ?? CASCADE`, [schemaName]);
    await masterKnex?.("businesses").whereIn("id", [businessId]).del();
    await masterKnex?.("platform_user_profiles").whereIn("user_id", [alice, bob]).del();
    await masterKnex?.("platform_users").whereIn("id", [alice, bob]).del();
    await app?.close();
    await shutdownPools?.();
    await masterKnex?.destroy();
  });

  // ── placement (§1.2) ──────────────────────────────────────────────────────

  it("lives in master, with a platform_users FK and NO FK to the tenant service", async () => {
    const { rows } = await masterKnex.raw(
      `SELECT c.conname, c.contype, confrelid::regclass::text AS refs
         FROM pg_constraint c
        WHERE c.conrelid = 'public.student_eligibility_checks'::regclass AND c.contype = 'f'`,
    );
    // Exactly one FK, and it points at master's platform_users. A second FK — to
    // catalog_services — would make every tenant service UPDATE fail, because the
    // projection triggers maintain a row by DELETE + INSERT.
    expect(rows.map((r: any) => r.refs)).toEqual(["platform_users"]);
  });

  // ── auth ──────────────────────────────────────────────────────────────────

  it("requires a token on every route", async () => {
    for (const req of [
      app.inject({ method: "GET", url: "/api/v3/eligibility" }),
      app.inject({ method: "POST", url: "/api/v3/eligibility", payload: { service_id: liveService } }),
    ]) {
      expect((await req).statusCode).toBe(401);
    }
  });

  // ── running a check ───────────────────────────────────────────────────────

  it("runs V1's rules against the caller's own profile and persists the verdict", async () => {
    const res = await check(aliceToken, liveService);
    expect(res.statusCode).toBe(201);
    const body = res.json().data;
    expect(body.result).toBe("eligible");
    expect(body.met_requirements).toEqual([
      "Degree level: bachelor meets requirement of bachelor",
      "GPA: 3.6 meets minimum of 3",
      "English test: IELTS 7.5 (minimum: 6.5)",
      "Budget: AUD 30,000 is within your budget",
      // The service's country came from the owning business, not from a per-service
      // column — V3 has none (see lib/rules.ts).
      expect.stringContaining("one of your preferred destinations"),
    ]);
    expect(body.unmet_requirements).toEqual([]);
    expect(body.profile_completion_percentage).toBe(90);

    const [stored] = await masterKnex("student_eligibility_checks").where({ platform_user_id: alice });
    expect(stored.service_id).toBe(liveService);
    expect(stored.result).toBe("eligible");
  });

  it("gives a different student a different verdict from the same course", async () => {
    const res = await check(bobToken, liveService);
    expect(res.statusCode).toBe(201);
    expect(res.json().data.result).toBe("not_eligible");
    expect(res.json().data.unmet_requirements).toContain(
      "Minimum degree level: bachelor (your degree level is not set)",
    );
    // A null completion percentage reports as 0, not as null — the banner reads a number.
    expect(res.json().data.profile_completion_percentage).toBe(0);
    // A jsonb-null preferred_destinations is no preferences, not a crash.
    expect(res.json().data.met_requirements.join()).not.toContain("preferred destinations");
  });

  it("an empty history is an empty page, not a failed one", async () => {
    const jwt = (await import("jsonwebtoken")).default;
    const [fresh] = await masterKnex("platform_users")
      .insert({ first_name: "No", last_name: "Checks", email: uniqueEmail("elig.fresh"), account_status: 1 })
      .returning(["id"]);
    const token = jwt.sign(
      { sub: String(fresh.id), type: "platform_user", email: "f@vitest.local" },
      config.JWT_SECRET as string,
    );
    const res = await get("/api/v3/eligibility", token);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
    expect(res.json().meta.total).toBe(0);
    await masterKnex("platform_users").where({ id: fresh.id }).del();
  });

  it("keeps a check whose service has since been withdrawn, with a null service", async () => {
    expect((await check(aliceToken, withdrawnService)).statusCode).toBe(201);
    await masterKnex("catalog_services").where({ service_id: withdrawnService }).del();

    const list = await get("/api/v3/eligibility", aliceToken);
    expect(list.statusCode).toBe(200);
    const row = list.json().data.find((r: any) => r.service_id === withdrawnService);
    // The verdict survives; only the resolved title is gone. V1 rendered `undefined`.
    expect(row).toBeDefined();
    expect(row.service).toBeNull();
    expect(row.result).toBeDefined();
  });

  it("appends a row per check — V1's page is a history, not a latest-only view", async () => {
    await check(aliceToken, liveService);
    const list = await get("/api/v3/eligibility", aliceToken);
    expect(list.statusCode).toBe(200);
    expect(list.json().meta.total).toBeGreaterThanOrEqual(2);
    // Newest first.
    const ids = list.json().data.map((r: any) => r.id);
    expect([...ids].sort((a: number, b: number) => b - a)).toEqual(ids);
  });

  it("resolves each check to its service name and provider, never to schema_name", async () => {
    const list = await get("/api/v3/eligibility", aliceToken);
    const row = list.json().data[0];
    expect(row.service.name).toContain("Elig live");
    expect(row.service.provider_name).toContain("Elig College");
    expect(JSON.stringify(list.json())).not.toContain(schemaName);
  });

  it("leaks no internal column — no meta, no deleted_at, no platform_user_id", async () => {
    const body = JSON.stringify((await get("/api/v3/eligibility", aliceToken)).json());
    for (const leak of ["internal_score", "deleted_at", "platform_user_id", "category_specific_data"]) {
      expect(body).not.toContain(leak);
    }
  });

  // ── authorization: the whole point ────────────────────────────────────────

  it("student A cannot read student B's checks", async () => {
    await check(bobToken, liveService);
    const bobRows = await masterKnex("student_eligibility_checks").where({ platform_user_id: bob }).select("id");
    expect(bobRows.length).toBeGreaterThan(0);

    const aliceSees = (await get("/api/v3/eligibility", aliceToken)).json().data.map((r: any) => r.id);
    for (const row of bobRows) expect(aliceSees).not.toContain(row.id);

    // And the reverse, so the test cannot pass because one list happens to be empty.
    const aliceRows = await masterKnex("student_eligibility_checks").where({ platform_user_id: alice }).select("id");
    const bobSees = (await get("/api/v3/eligibility", bobToken)).json().data.map((r: any) => r.id);
    expect(aliceRows.length).toBeGreaterThan(0);
    for (const row of aliceRows) expect(bobSees).not.toContain(row.id);
  });

  it("the count is the caller's own, not the table's", async () => {
    const total = Number((await masterKnex("student_eligibility_checks").count({ n: "*" }).first())!.n);
    const mine = (await get("/api/v3/eligibility", aliceToken)).json().meta.total;
    expect(mine).toBeLessThan(total);
  });

  // ── refusals ──────────────────────────────────────────────────────────────

  it("404s an unpublished service, indistinguishably from one that does not exist", async () => {
    const draft = await check(aliceToken, unpublishedService);
    const missing = await check(aliceToken, "00000000-0000-4000-8000-000000000000");
    expect(draft.statusCode).toBe(404);
    expect(missing.statusCode).toBe(404);
    expect(draft.json().error ?? draft.json().message).toEqual(missing.json().error ?? missing.json().message);
  });

  it("503s — never 'eligible' — when the requirements cannot be read", async () => {
    const res = await check(aliceToken, orphanService);
    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.json())).not.toContain("eligible");
    // Nothing was written: a fail-closed refusal must not leave a verdict behind.
    const stored = await masterKnex("student_eligibility_checks").where({ service_id: orphanService });
    expect(stored).toHaveLength(0);
  });

  it("404s a caller with no profile row rather than evaluating against nothing", async () => {
    const jwt = (await import("jsonwebtoken")).default;
    const [ghost] = await masterKnex("platform_users")
      .insert({ first_name: "No", last_name: "Profile", email: uniqueEmail("elig.ghost"), account_status: 1 })
      .returning(["id"]);
    const token = jwt.sign(
      { sub: String(ghost.id), type: "platform_user", email: "g@vitest.local" },
      config.JWT_SECRET as string,
    );
    expect((await check(token, liveService)).statusCode).toBe(404);
    await masterKnex("platform_users").where({ id: ghost.id }).del();
  });

  it("rejects a POST with no body at all", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v3/eligibility", headers: auth(aliceToken) });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a body that is not a bare service_id uuid", async () => {
    for (const payload of [
      {},
      { service_id: "not-a-uuid" },
      { service_id: liveService, platform_user_id: bob },
      { service_id: "x".repeat(200) },
    ]) {
      const res = await app.inject({
        method: "POST",
        url: "/api/v3/eligibility",
        headers: auth(aliceToken),
        payload,
      });
      expect(res.statusCode).toBe(400);
    }
  });
});
