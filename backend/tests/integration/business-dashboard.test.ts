// GET /api/v3/businesses/dashboard — the business portal landing screen.
//
// Two businesses are provisioned from scratch. The acting user is a member of A
// only; the same user holds a signed token naming B's schema. That is the exact
// shape of the cross-tenant attack this endpoint has to survive: the JWT is
// valid, the signature is real, the tenant plugin resolves B — and the dashboard
// must still refuse, because membership lives in the tenant schema, not the
// claim. `orgId` is only issued after switchAccount checks membership, but a
// token outlives the agents row it was issued against.
//
// The rest is honesty: business B has zero enquiries, zero services and no
// wallet row at all, and the response must say 0 and [] rather than omit them.

import Fastify, { type FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dbAvailable, uniqueEmail } from "../helpers/db.js";

const describeDb = describe.skipIf(!dbAvailable);

const URL = "/api/v3/businesses/dashboard";

/** Keys that must never appear on the wire. See dashboard.service.ts. */
const LEAKY_BUSINESS_KEYS = [
  "claim_token",
  "claim_token_expires_at",
  "customer_id",
  "subscription_id",
  "plan_code",
  "owner_id",
  "meta",
  "deleted_at",
  "account_status",
  "schema_name",
];

describeDb("business dashboard", () => {
  let app: FastifyInstance;
  let masterKnex: Knex;
  let shutdownPools: () => Promise<void>;

  let tokenA = "";
  let tokenB = "";
  let tokenNoOrg = "";
  let tokenStranger = "";
  let schemaA = "";
  let schemaB = "";
  let businessAId = 0;

  beforeAll(async () => {
    const jwt = (await import("jsonwebtoken")).default;
    ({ masterKnex } = await import("../../src/core/db/master-pool.js"));
    ({ shutdownAll: shutdownPools } = await import("../../src/core/db/pool-manager.js"));
    const { config } = (await import("../../src/config.js")) as unknown as { config: Record<string, string> };
    const { provisionBusinessSchema } = await import("../../src/core/business/provisioner.js");
    const { getKnex } = await import("../../src/core/db/pool-manager.js");
    const { schemaName } = await import("../../src/core/db/knex.js");

    const { errorHandlerPlugin } = await import("../../src/core/plugins/error-handler.plugin.js");
    const { requestContextPlugin } = await import("../../src/core/plugins/request-context.plugin.js");
    const { authPlugin } = await import("../../src/core/plugins/auth.plugin.js");
    const { tenantPlugin } = await import("../../src/core/plugins/tenant.plugin.js");
    const businessesModule = (await import("../../src/modules/businesses/index.js")).default;

    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    await app.register(requestContextPlugin);
    await app.register(async (scope) => {
      await scope.register(authPlugin);
      await scope.register(tenantPlugin);
      await scope.register(businessesModule);
    });
    await app.ready();

    const suffix = `${process.pid}${Date.now() % 1_000_000}`;

    const [owner] = await masterKnex("platform_users")
      .insert({
        first_name: "Dash",
        last_name: "Owner",
        email: uniqueEmail("dash.owner"),
        account_status: 1,
      })
      .returning(["id"]);
    const [stranger] = await masterKnex("platform_users")
      .insert({
        first_name: "No",
        last_name: "Member",
        email: uniqueEmail("dash.stranger"),
        account_status: 1,
      })
      .returning(["id"]);
    const [student] = await masterKnex("platform_users")
      .insert({
        first_name: "Stu",
        last_name: "Dent",
        email: uniqueEmail("dash.student"),
        account_status: 1,
      })
      .returning(["id"]);

    const insertBusiness = async (label: string) => {
      const [row] = await masterKnex("businesses")
        .insert({
          owner_id: owner.id,
          subdomain: `dash-${label}-${suffix}`,
          business_name: `Dash ${label} ${suffix}`,
          account_status: 1,
          status: label === "a" ? "pending" : "active",
          // Deliberately populated so the projection has something to leak.
          claim_token: `secret-${label}-${suffix}`,
          customer_id: `cus_${label}_${suffix}`,
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

    // ── membership: the owner is an agent of A, and of A only ──
    const tenantA = await getKnex(a.id, schemaName(a.schema_name));
    const ownerRole = await tenantA("roles").where({ name: "owner" }).first();
    await tenantA("agents").insert({
      platform_user_id: owner.id,
      role_id: ownerRole.id,
      is_owner: true,
      first_name: "Dash",
      last_name: "Owner",
      email: "dash.owner@vitest.local",
    });

    // ── source 4: business_services (two, one published) ──
    await tenantA("business_services").insert([
      { name: `Published ${suffix}`, is_published: true },
      { name: `Draft ${suffix}`, is_published: false },
    ]);

    // ── source 2: credit_wallets ──
    await masterKnex("credit_wallets").insert({
      owner_type: "business",
      business_id: a.id,
      balance: 120,
      purchased_balance: 120,
    });

    // ── source 3: enquiry_distributions (two leads, both still locked) ──
    const [enquiry] = await masterKnex("enquiries")
      .insert({ student_id: student.id, message: "Please help me apply to a masters programme." })
      .returning(["id"]);
    const [enquiry2] = await masterKnex("enquiries")
      .insert({ student_id: student.id, message: "Second lead." })
      .returning(["id"]);
    await masterKnex("enquiry_distributions").insert([
      { enquiry_id: enquiry.id, business_id: a.id, coin_cost: 30 },
      { enquiry_id: enquiry2.id, business_id: a.id, coin_cost: 30 },
    ]);

    const sign = (claims: Record<string, unknown>) =>
      jwt.sign({ email: "dash@vitest.local", ...claims }, config.JWT_SECRET);
    tokenA = sign({ sub: String(owner.id), type: "platform_user", orgId: schemaA });
    // Same real user, same real signature — pointed at a business they never joined.
    tokenB = sign({ sub: String(owner.id), type: "platform_user", orgId: schemaB });
    tokenNoOrg = sign({ sub: String(owner.id), type: "platform_user" });
    tokenStranger = sign({ sub: String(stranger.id), type: "platform_user", orgId: schemaA });
  });

  afterAll(async () => {
    await app?.close();
    await shutdownPools?.();
    for (const schema of [schemaA, schemaB]) {
      if (schema) await masterKnex?.raw(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
    }
    await masterKnex?.destroy();
  });

  const get = (token?: string) =>
    app.inject({
      method: "GET",
      url: URL,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

  describe("guards", () => {
    it("rejects an unauthenticated request", async () => {
      expect((await get()).statusCode).toBe(401);
    });

    it("rejects a token carrying no business context", async () => {
      expect((await get(tokenNoOrg)).statusCode).toBe(403);
    });

    it("refuses business B's dashboard to a member of business A", async () => {
      const res = await get(tokenB);
      expect(res.statusCode, res.body).toBe(403);
      // Refused by the membership fact check, not by a missing claim or a
      // half-provisioned schema — those would also be 403/404 and would make
      // this test pass for the wrong reason.
      expect(res.json().error).toBe("Not a member of this business");
      // Nothing about B leaks in the refusal — not the balance, not a count.
      expect(res.body).not.toContain("balance");
      expect(res.body).not.toContain("secret-b-");
    });

    it("refuses a signed-in user who is a member of no business at all", async () => {
      const res = await get(tokenStranger);
      expect(res.statusCode, res.body).toBe(403);
      expect(res.json().error).toBe("Not a member of this business");
    });
  });

  describe("payload", () => {
    it("returns the four V1 sources for the caller's own business", async () => {
      const res = await get(tokenA);
      expect(res.statusCode, res.body).toBe(200);
      const body = res.json();

      expect(body.business).toMatchObject({
        id: businessAId,
        status: "pending",
        is_published: false,
      });
      expect(body.member).toEqual({
        first_name: "Dash",
        last_name: "Owner",
        role: "owner",
        is_owner: true,
      });
      expect(body.credits).toEqual({ balance: 120 });
      expect(body.enquiries.total).toBe(2);
      expect(body.enquiries.locked).toBe(2);
      expect(body.enquiries.recent).toHaveLength(2);
      expect(body.services).toEqual({ total: 2, published: 1 });
    });

    it("never puts an internal business column on the wire", async () => {
      const body = (await get(tokenA)).json();
      for (const key of LEAKY_BUSINESS_KEYS) {
        expect(body.business).not.toHaveProperty(key);
      }
      expect(Object.keys(body.business).sort()).toEqual([
        "business_name",
        "business_type",
        "id",
        "is_published",
        "logo_url",
        "onboarding_completed",
        "status",
        "subdomain",
        "verified_at",
      ]);
    });

    it("keeps locked leads masked — the dashboard is not a way around the paywall", async () => {
      const body = (await get(tokenA)).json();
      for (const lead of body.enquiries.recent) {
        expect(lead.unlocked).toBe(false);
        expect(lead.student).not.toHaveProperty("email");
        expect(lead.student).not.toHaveProperty("phone");
        expect(lead).not.toHaveProperty("message");
      }
    });

    it("reports an untouched business as honest zeroes, not as missing data", async () => {
      // Make the owner a member of B too, so the only thing left is emptiness.
      const { getKnex } = await import("../../src/core/db/pool-manager.js");
      const { schemaName } = await import("../../src/core/db/knex.js");
      const b = await masterKnex("businesses").where({ schema_name: schemaB }).first();
      const tenantB = await getKnex(b.id, schemaName(schemaB));
      const memberRole = await tenantB("roles").where({ name: "member" }).first();
      const ownerUserId = (await masterKnex("businesses").where({ schema_name: schemaA }).first()).owner_id;
      await tenantB("agents").insert({
        platform_user_id: ownerUserId,
        role_id: memberRole.id,
        is_owner: false,
        first_name: "Dash",
        last_name: "Owner",
      });

      const res = await get(tokenB);
      expect(res.statusCode, res.body).toBe(200);
      const body = res.json();
      expect(body.credits).toEqual({ balance: 0 });
      expect(body.enquiries).toEqual({ total: 0, locked: 0, recent: [] });
      expect(body.services).toEqual({ total: 0, published: 0 });
      expect(body.member.role).toBe("member");
    });
  });
});
