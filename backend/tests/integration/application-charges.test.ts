// Applications + per-application credit charges (Wave G5).
//
// Specs these assertions come from — never from the implementation:
//   * V1 supabase/functions/charge-application (cost from the active subscription,
//     default 10; wallet debit; idempotent by application)
//   * V1 src/pages/admin/AdminApplicationCharges.tsx (list, status/date filter,
//     waive, refund-with-credit-back)
//   * V2 apps/core-api/src/routes/business-application-charges.ts (the owner's
//     read: date, service name, credits, status — and the status vocabulary)
//
// THE MONEY PATH. What is asserted here, in order of importance:
//   1. exactly one charge per application, under concurrency;
//   2. a failed debit leaves NO charge row, NO wallet movement, NO status change;
//   3. a refund cannot be replayed for free credits (V1 defect D-G5-4);
//   4. a business never reads another business's charges, and no unauthenticated
//      caller reads student PII off a charge.

import Fastify, { type FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dbAvailable, uniqueEmail } from "../helpers/db.js";

const describeDb = describe.skipIf(!dbAvailable);

describeDb("applications + charges", () => {
  let app: FastifyInstance;
  let masterKnex: Knex;
  let shutdownPools: () => Promise<void>;
  let config: Record<string, unknown>;
  let sign: (claims: Record<string, unknown>) => string;
  let credits: typeof import("../../src/modules/billing/services/credits.service.js");

  let suffix = "";
  let adminToken = "";

  interface Biz {
    id: number;
    schema: string;
    ownerId: number;
    token: string;
  }
  let alpha: Biz;
  let beta: Biz;
  let student: { id: number; token: string };

  const json = (res: { json: () => unknown }) => res.json() as Record<string, never>;
  const get = (url: string, token?: string) =>
    app.inject({ method: "GET", url, headers: token ? { authorization: `Bearer ${token}` } : {} });
  const post = (url: string, token?: string, payload?: unknown) =>
    app.inject({
      method: "POST",
      url,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      payload: payload ?? {},
    });

  beforeAll(async () => {
    const jwt = (await import("jsonwebtoken")).default;
    ({ masterKnex } = await import("../../src/core/db/master-pool.js"));
    ({ shutdownAll: shutdownPools } = await import("../../src/core/db/pool-manager.js"));
    ({ config } = (await import("../../src/config.js")) as unknown as {
      config: Record<string, unknown>;
    });
    credits = await import("../../src/modules/billing/services/credits.service.js");

    const { errorHandlerPlugin } = await import("../../src/core/plugins/error-handler.plugin.js");
    const { requestContextPlugin } = await import("../../src/core/plugins/request-context.plugin.js");
    const { authPlugin } = await import("../../src/core/plugins/auth.plugin.js");
    const { tenantPlugin } = await import("../../src/core/plugins/tenant.plugin.js");
    const applicationsModule = (await import("../../src/modules/applications/index.js")).default;

    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    await app.register(requestContextPlugin);
    await app.register(async (scoped) => {
      await scoped.register(authPlugin);
      await scoped.register(tenantPlugin);
      await scoped.register(applicationsModule);
    });
    await app.ready();

    suffix = `${process.pid}${Date.now() % 1_000_000}`;
    sign = (claims) => jwt.sign({ email: "app@vitest.local", ...claims }, config.JWT_SECRET as string);
    adminToken = sign({ sub: "1", type: "admin", role: "super_admin" });

    const makeUser = async (label: string) => {
      const [row] = await masterKnex("platform_users")
        .insert({
          first_name: "App",
          last_name: label,
          email: uniqueEmail(`app.${label}`),
          account_status: 1,
        })
        .returning(["id"]);
      return { id: Number(row.id), token: sign({ sub: String(row.id), type: "platform_user" }) };
    };

    const makeBusiness = async (label: string): Promise<Biz> => {
      const owner = await makeUser(`owner.${label}`);
      const [row] = await masterKnex("businesses")
        .insert({
          owner_id: owner.id,
          subdomain: `app-${label}-${suffix}`,
          business_name: `App ${label} ${suffix}`,
          email: uniqueEmail(`app.biz.${label}`),
          account_status: 1,
          status: "verified",
        })
        .returning(["id", "schema_name"]);
      return {
        id: Number(row.id),
        schema: row.schema_name,
        ownerId: owner.id,
        token: sign({ sub: String(owner.id), type: "platform_user", orgId: row.schema_name }),
      };
    };

    alpha = await makeBusiness("alpha");
    beta = await makeBusiness("beta");
    student = await makeUser("student");
  });

  afterAll(async () => {
    await app?.close();
    await shutdownPools?.();
    await masterKnex?.destroy();
  });

  // ── helpers ───────────────────────────────────────────────────────────────

  let serviceSeq = 0;
  /** A distinct service id per application, so the per-service unique index does not collide. */
  const newServiceId = () => 9_000_000 + ++serviceSeq;

  async function apply(biz: Biz, applicant = student): Promise<number> {
    const res = await post("/api/v3/applications", applicant.token, {
      org_type: "business",
      org_id: biz.id,
      service_id: newServiceId(),
      notes: "Please consider me",
    });
    expect(res.statusCode).toBe(201);
    return (json(res) as unknown as { id: number }).id;
  }

  const fund = (businessId: number, amount: number) =>
    credits.grantCredits({
      businessId,
      amount,
      transactionType: "manual_adjustment",
      bucket: "purchased",
      description: "test top-up",
    });

  const balanceOf = (businessId: number) => credits.getBalance(businessId).then((b) => b.balance);

  /** Spend the wallet down to exactly `target`. */
  async function setBalance(businessId: number, target: number) {
    const current = await balanceOf(businessId);
    if (current > target) {
      await credits.spendCredits(
        businessId,
        { amount: current - target, transaction_type: "manual_adjustment", description: "drain" },
        null,
      );
    } else if (current < target) {
      await fund(businessId, target - current);
    }
    expect(await balanceOf(businessId)).toBe(target);
  }

  const chargesFor = (applicationId: number) =>
    masterKnex("application_charges").where({ application_id: applicationId });
  const appRow = (id: number) => masterKnex("applications").where({ id }).first();

  // ── applications ──────────────────────────────────────────────────────────

  describe("submission", () => {
    it("creates a submitted application owned by the student and addressed to a business", async () => {
      const serviceId = newServiceId();
      const res = await post("/api/v3/applications", student.token, {
        org_type: "business",
        org_id: alpha.id,
        service_id: serviceId,
      });
      expect(res.statusCode).toBe(201);
      const body = json(res) as unknown as Record<string, unknown>;
      expect(body.status).toBe("submitted");
      expect(body.student_id).toBe(student.id);
      expect(body.business_id).toBe(alpha.id);
      expect(body.submitted_at).not.toBeNull();
    });

    it("refuses a second application to the same service (double-click = double charge)", async () => {
      const serviceId = newServiceId();
      const body = { org_type: "business", org_id: alpha.id, service_id: serviceId };
      expect((await post("/api/v3/applications", student.token, body)).statusCode).toBe(201);
      expect((await post("/api/v3/applications", student.token, body)).statusCode).toBe(409);
    });

    it("validates the org reference at the boundary", async () => {
      for (const body of [
        { org_type: "business" }, // org_id missing
        { org_type: "planet", org_id: alpha.id },
        { org_type: "business", org_id: -1 },
        { org_type: "business", org_id: 99_999_999 }, // no such business
      ]) {
        const res = await post("/api/v3/applications", student.token, body);
        expect([400, 404], JSON.stringify(body)).toContain(res.statusCode);
      }
    });

    it("lists only the caller's own applications", async () => {
      const other = await (async () => {
        const [row] = await masterKnex("platform_users")
          .insert({ first_name: "Other", last_name: "Student", email: uniqueEmail("app.other"), account_status: 1 })
          .returning(["id"]);
        return { id: Number(row.id), token: sign({ sub: String(row.id), type: "platform_user" }) };
      })();

      const mine = await apply(alpha);
      const theirs = await apply(alpha, other);

      const list = json(await get("/api/v3/applications?limit=100", student.token)) as unknown as {
        data: { id: number }[];
      };
      expect(list.data.map((r) => r.id)).toContain(mine);
      expect(list.data.map((r) => r.id)).not.toContain(theirs);
    });
  });

  // ── the charge ────────────────────────────────────────────────────────────

  describe("accepting an application charges credits", () => {
    it("debits the default 10 credits, writes one charge, and links the ledger row", async () => {
      const id = await apply(alpha);
      await setBalance(alpha.id, 200);

      const res = await post(`/api/v3/business/applications/${id}/accept`, alpha.token);
      expect(res.statusCode).toBe(200);
      const body = json(res) as unknown as Record<string, unknown>;
      expect(body.status).toBe("accepted");
      expect(body.already_charged).toBe(false);
      expect(body.credits_charged).toBe(10);

      expect(await balanceOf(alpha.id)).toBe(190);
      const charges = await chargesFor(id);
      expect(charges).toHaveLength(1);
      expect(charges[0].status).toBe("charged");
      expect(charges[0].credits_charged).toBe(10);
      expect(charges[0].business_id).toBe(alpha.id);
      expect(charges[0].student_id).toBe(student.id);
      expect(charges[0].idempotency_key).toBe(`application_charge:${id}`);
      expect(charges[0].credit_transaction_id).not.toBeNull();

      const debit = await masterKnex("credit_transactions").where({ id: charges[0].credit_transaction_id }).first();
      expect(debit.amount).toBe(-10);
      // Its own transaction type, not V1's mislabelled 'enquiry_unlock' (D-G5-5).
      expect(debit.transaction_type).toBe("application_charge");
      expect(debit.reference_type).toBe("application");
      expect(debit.reference_id).toBe(String(id));
      expect(debit.idempotency_key).toBe(`application_charge:${id}`);

      expect((await appRow(id)).decided_at).not.toBeNull();
    });

    it("charges exactly once when two accepts land together", async () => {
      const id = await apply(alpha);
      await setBalance(alpha.id, 200);

      const [a, b] = await Promise.all([
        post(`/api/v3/business/applications/${id}/accept`, alpha.token),
        post(`/api/v3/business/applications/${id}/accept`, alpha.token),
      ]);
      expect(a.statusCode).toBe(200);
      expect(b.statusCode).toBe(200);
      expect([a, b].filter((r) => (json(r) as unknown as { already_charged: boolean }).already_charged === false))
        .toHaveLength(1);

      expect(await chargesFor(id)).toHaveLength(1);
      expect(await balanceOf(alpha.id)).toBe(190);
      expect(
        await masterKnex("credit_transactions").where({ idempotency_key: `application_charge:${id}` }),
      ).toHaveLength(1);
    });

    it("is idempotent on replay long after the fact", async () => {
      const id = await apply(alpha);
      await setBalance(alpha.id, 200);
      await post(`/api/v3/business/applications/${id}/accept`, alpha.token);

      const replay = await post(`/api/v3/business/applications/${id}/accept`, alpha.token);
      expect(replay.statusCode).toBe(200);
      expect(json(replay)).toMatchObject({ already_charged: true, credits_charged: 10 });
      expect(await balanceOf(alpha.id)).toBe(190);
      expect(await chargesFor(id)).toHaveLength(1);
    });

    it("402s and leaves NOTHING behind when the wallet cannot cover the charge", async () => {
      const id = await apply(alpha);
      await setBalance(alpha.id, 4); // cost is 10

      const res = await post(`/api/v3/business/applications/${id}/accept`, alpha.token);
      expect(res.statusCode).toBe(402);
      expect(json(res)).toMatchObject({ code: "INSUFFICIENT_CREDITS" });

      // No charge row (V1 left a 'pending' one behind — D-G5-3), no debit,
      // and the application is NOT accepted: the business must not get the
      // outcome it did not pay for.
      expect(await chargesFor(id)).toHaveLength(0);
      expect(await balanceOf(alpha.id)).toBe(4);
      expect(
        await masterKnex("credit_transactions").where({ idempotency_key: `application_charge:${id}` }),
      ).toHaveLength(0);
      const row = await appRow(id);
      expect(row.status).toBe("submitted");
      expect(row.decided_at).toBeNull();

      // …and it is still acceptable once the wallet is topped up.
      await setBalance(alpha.id, 100);
      const retry = await post(`/api/v3/business/applications/${id}/accept`, alpha.token);
      expect(retry.statusCode).toBe(200);
      expect(json(retry)).toMatchObject({ already_charged: false });
      expect(await balanceOf(alpha.id)).toBe(90);
    });

    it("charges the subscription's per-application cost when the business has one", async () => {
      const id = await apply(alpha);
      await setBalance(alpha.id, 200);
      const plan = await masterKnex("subscription_plans")
        .insert({
          code: `g5-plan-${suffix}`,
          name: `G5 plan ${suffix}`,
          pay_per_application_cost: 25,
        })
        .returning(["id"])
        .then((r) => r[0]);
      await masterKnex("business_subscriptions").insert({
        business_id: alpha.id,
        plan_id: plan.id,
        status: "active",
        billing_interval: "month",
        current_period_start: new Date(Date.now() - 86_400_000),
        current_period_end: new Date(Date.now() + 86_400_000),
      });

      const res = await post(`/api/v3/business/applications/${id}/accept`, alpha.token);
      expect(res.statusCode).toBe(200);
      expect(json(res)).toMatchObject({ credits_charged: 25 });
      expect(await balanceOf(alpha.id)).toBe(175);

      await masterKnex("business_subscriptions").where({ business_id: alpha.id }).delete();
      await masterKnex("subscription_plans").where({ id: plan.id }).delete();
    });

    it("falls back to 10 credits when the subscription's period has lapsed", async () => {
      const id = await apply(alpha);
      await setBalance(alpha.id, 200);
      const plan = await masterKnex("subscription_plans")
        .insert({ code: `g5-lapsed-${suffix}`, name: `G5 lapsed ${suffix}`, pay_per_application_cost: 40 })
        .returning(["id"])
        .then((r) => r[0]);
      // status still says 'active' but the paid period ran out — Stripe has not told
      // us yet, or the webhook was lost. V1's get_active_subscription checked only
      // the status and would have priced this at 40.
      await masterKnex("business_subscriptions").insert({
        business_id: alpha.id,
        plan_id: plan.id,
        status: "active",
        billing_interval: "month",
        current_period_start: new Date(Date.now() - 2 * 86_400_000),
        current_period_end: new Date(Date.now() - 86_400_000),
      });

      expect(json(await post(`/api/v3/business/applications/${id}/accept`, alpha.token))).toMatchObject({
        credits_charged: 10,
      });
      expect(await balanceOf(alpha.id)).toBe(190);

      await masterKnex("business_subscriptions").where({ business_id: alpha.id }).delete();
      await masterKnex("subscription_plans").where({ id: plan.id }).delete();
    });

    it("refuses to accept an application that was already rejected or withdrawn", async () => {
      const id = await apply(alpha);
      await setBalance(alpha.id, 200);
      await post(`/api/v3/business/applications/${id}/reject`, alpha.token);

      const res = await post(`/api/v3/business/applications/${id}/accept`, alpha.token);
      expect(res.statusCode).toBe(400);
      expect(await chargesFor(id)).toHaveLength(0);
      expect(await balanceOf(alpha.id)).toBe(200);

      // Re-rejecting is idempotent rather than an error.
      expect((await post(`/api/v3/business/applications/${id}/reject`, alpha.token)).statusCode).toBe(200);
    });

    it("404s an unknown application on every business verb", async () => {
      expect((await get("/api/v3/business/applications/99999999", alpha.token)).statusCode).toBe(404);
      expect((await post("/api/v3/business/applications/99999999/accept", alpha.token)).statusCode).toBe(404);
      expect((await post("/api/v3/business/applications/99999999/reject", alpha.token)).statusCode).toBe(404);
      expect(
        (await post("/api/v3/admin/revenue/application-charges/99999999/refund", adminToken)).statusCode,
      ).toBe(404);
      expect(
        (await post("/api/v3/admin/revenue/application-charges/99999999/waive", adminToken)).statusCode,
      ).toBe(404);
    });

    it("refuses a body naming a field the server owns", async () => {
      // .strict() at the boundary: a client cannot set its own price or status.
      for (const body of [
        { org_type: "business", org_id: alpha.id, credits_charged: 0 },
        { org_type: "business", org_id: alpha.id, status: "accepted" },
        { org_type: "business", org_id: alpha.id, student_id: 1 },
      ]) {
        expect((await post("/api/v3/applications", student.token, body)).statusCode).toBe(400);
      }
    });

    it("rejecting an application never charges", async () => {
      const id = await apply(alpha);
      await setBalance(alpha.id, 200);
      const res = await post(`/api/v3/business/applications/${id}/reject`, alpha.token, { note: "Not eligible" });
      expect(res.statusCode).toBe(200);
      expect((await appRow(id)).status).toBe("rejected");
      expect(await chargesFor(id)).toHaveLength(0);
      expect(await balanceOf(alpha.id)).toBe(200);
    });
  });

  // ── admin: waive and refund ───────────────────────────────────────────────

  describe("admin waive / refund", () => {
    async function charged(): Promise<{ appId: number; chargeId: number }> {
      const appId = await apply(alpha);
      await setBalance(alpha.id, 200);
      await post(`/api/v3/business/applications/${appId}/accept`, alpha.token);
      const [row] = await chargesFor(appId);
      return { appId, chargeId: row.id };
    }

    it("waives a charge and returns the credits", async () => {
      const { chargeId } = await charged();
      expect(await balanceOf(alpha.id)).toBe(190);

      const res = await post(`/api/v3/admin/revenue/application-charges/${chargeId}/waive`, adminToken);
      expect(res.statusCode).toBe(200);
      const row = await masterKnex("application_charges").where({ id: chargeId }).first();
      expect(row.status).toBe("waived");
      expect(row.waived_at).not.toBeNull();
      expect(row.waived_by).toBe(1);
      // V1's waive did NOT return the credits, which made "waived" mean two
      // different things depending on who pressed the button. A waived charge is
      // a charge that should not have happened, so the money goes back.
      expect(await balanceOf(alpha.id)).toBe(200);
    });

    it("refunds a charge exactly once, however many times the button is pressed (D-G5-4)", async () => {
      const { chargeId } = await charged();
      expect(await balanceOf(alpha.id)).toBe(190);

      const [a, b] = await Promise.all([
        post(`/api/v3/admin/revenue/application-charges/${chargeId}/refund`, adminToken),
        post(`/api/v3/admin/revenue/application-charges/${chargeId}/refund`, adminToken),
      ]);
      expect([a.statusCode, b.statusCode].filter((s) => s === 200)).toHaveLength(2);
      expect(
        [a, b].filter((r) => (json(r) as unknown as { already_refunded: boolean }).already_refunded === false),
      ).toHaveLength(1);

      // Exactly 200 — one refund of 10, not two.
      expect(await balanceOf(alpha.id)).toBe(200);
      const row = await masterKnex("application_charges").where({ id: chargeId }).first();
      expect(row.status).toBe("refunded");
      expect(row.refund_transaction_id).not.toBeNull();
      expect(
        await masterKnex("credit_transactions").where({ idempotency_key: `application_refund:${chargeId}` }),
      ).toHaveLength(1);

      // A third press, well after the fact, is still free.
      const third = await post(`/api/v3/admin/revenue/application-charges/${chargeId}/refund`, adminToken);
      expect(third.statusCode).toBe(200);
      expect(json(third)).toMatchObject({ already_refunded: true });
      expect(await balanceOf(alpha.id)).toBe(200);
    });

    it("cannot waive a charge that was already refunded, or vice versa", async () => {
      const { chargeId } = await charged();
      await post(`/api/v3/admin/revenue/application-charges/${chargeId}/refund`, adminToken);
      expect(await balanceOf(alpha.id)).toBe(200);

      expect((await post(`/api/v3/admin/revenue/application-charges/${chargeId}/waive`, adminToken)).statusCode)
        .toBe(409);
      expect(await balanceOf(alpha.id)).toBe(200);
    });

    it("lists charges across businesses with the student and service on each row", async () => {
      const { chargeId } = await charged();
      const list = json(
        await get("/api/v3/admin/revenue/application-charges?limit=100", adminToken),
      ) as unknown as { data: Record<string, unknown>[] };
      const row = list.data.find((r) => r.id === chargeId);
      expect(row).toBeTruthy();
      expect(row!.business_name).toContain("App alpha");
      expect(row!.student_name).toContain("App student");
      expect(row!.credits_charged).toBe(10);

      const stats = json(await get("/api/v3/admin/revenue/application-charges/stats", adminToken)) as unknown as {
        total: number;
        charged: number;
        waived: number;
        refunded: number;
        credits_charged: number;
      };
      expect(stats.total).toBeGreaterThan(0);
      expect(stats.credits_charged).toBeGreaterThan(0);
    });

    it("filters by status and by charged-at range, like V1's admin page", async () => {
      const { chargeId } = await charged();
      await post(`/api/v3/admin/revenue/application-charges/${chargeId}/waive`, adminToken);

      const waived = json(
        await get("/api/v3/admin/revenue/application-charges?status=waived&limit=100", adminToken),
      ) as unknown as { data: { id: number }[] };
      expect(waived.data.map((r) => r.id)).toContain(chargeId);

      const chargedOnly = json(
        await get("/api/v3/admin/revenue/application-charges?status=charged&limit=100", adminToken),
      ) as unknown as { data: { id: number }[] };
      expect(chargedOnly.data.map((r) => r.id)).not.toContain(chargeId);

      const future = new Date(Date.now() + 86_400_000).toISOString();
      const none = json(
        await get(`/api/v3/admin/revenue/application-charges?from=${future}&limit=100`, adminToken),
      ) as unknown as { data: { id: number }[] };
      expect(none.data.map((r) => r.id)).not.toContain(chargeId);
    });
  });

  // ── the owner's read (V2 contract) and the leak guard ─────────────────────

  describe("owner read + isolation", () => {
    it("returns the owner's own charges only, with V2's projection", async () => {
      const id = await apply(alpha);
      await setBalance(alpha.id, 200);
      await post(`/api/v3/business/applications/${id}/accept`, alpha.token);

      const res = await get("/api/v3/business/application-charges?limit=100", alpha.token);
      expect(res.statusCode).toBe(200);
      const list = json(res) as unknown as { data: Record<string, unknown>[] };
      expect(list.data.length).toBeGreaterThan(0);
      // V2's chargeRow: id, credits_charged, status, created_at, service_name.
      // Nothing else — and specifically not the student's identity, which the
      // business has not been shown a reason to receive on a billing screen.
      for (const row of list.data) {
        expect(Object.keys(row).sort()).toEqual(
          ["created_at", "credits_charged", "id", "service_name", "status"].sort(),
        );
      }
      expect(res.payload).not.toContain("student_id");
      expect(res.payload).not.toContain("student_name");
      expect(res.payload).not.toContain("idempotency_key");
    });

    it("never lets business B see, accept, or waive business A's application or charge", async () => {
      const id = await apply(alpha);
      await setBalance(alpha.id, 200);
      await setBalance(beta.id, 200);
      await post(`/api/v3/business/applications/${id}/accept`, alpha.token);
      const [charge] = await chargesFor(id);

      // 404, not 403.
      expect((await get(`/api/v3/business/applications/${id}`, beta.token)).statusCode).toBe(404);
      expect((await post(`/api/v3/business/applications/${id}/accept`, beta.token)).statusCode).toBe(404);
      expect((await post(`/api/v3/business/applications/${id}/reject`, beta.token)).statusCode).toBe(404);
      // Waiving is an admin verb; a business is not an admin however it asks.
      expect(
        (await post(`/api/v3/admin/revenue/application-charges/${charge.id}/waive`, beta.token)).statusCode,
      ).toBe(403);

      expect(await balanceOf(beta.id)).toBe(200);
      expect(await balanceOf(alpha.id)).toBe(190);
      expect(await chargesFor(id)).toHaveLength(1);

      const betaList = json(await get("/api/v3/business/application-charges?limit=100", beta.token)) as unknown as {
        data: { id: number }[];
      };
      expect(betaList.data.map((r) => r.id)).not.toContain(charge.id);

      const betaInbox = json(await get("/api/v3/business/applications?limit=100", beta.token)) as unknown as {
        data: { id: number }[];
      };
      expect(betaInbox.data.map((r) => r.id)).not.toContain(id);
    });

    it("refuses an unauthenticated read on every charge route (student PII)", async () => {
      for (const url of [
        "/api/v3/applications",
        "/api/v3/business/applications",
        "/api/v3/business/application-charges",
        "/api/v3/admin/revenue/application-charges",
        "/api/v3/admin/revenue/application-charges/stats",
      ]) {
        const res = await get(url);
        expect(res.statusCode, url).toBe(401);
        expect(res.payload).not.toContain("student");
      }
    });

    it("refuses the student's own routes for a business-context token and vice versa", async () => {
      expect((await get("/api/v3/business/applications", student.token)).statusCode).toBe(403);
      expect((await get("/api/v3/business/application-charges", student.token)).statusCode).toBe(403);
      expect((await get("/api/v3/admin/revenue/application-charges", student.token)).statusCode).toBe(403);
    });

    it("refuses an admin token on the student's own application routes", async () => {
      // An admin has no applications of their own, and req.auth.sub for an admin is
      // an admin_users id — reading it as a platform_users id would list a
      // completely unrelated person's applications.
      expect((await get("/api/v3/applications", adminToken)).statusCode).toBe(403);
      expect(
        (await post("/api/v3/applications", adminToken, { org_type: "business", org_id: alpha.id })).statusCode,
      ).toBe(403);
    });

    it("accepts an institution as the application target, which is never billed", async () => {
      const [institution] = await masterKnex("institutions")
        .insert({ institution_name: `G5 Institute ${suffix}` })
        .returning(["id"]);

      const res = await post("/api/v3/applications", student.token, {
        org_type: "institution",
        org_id: Number(institution.id),
        service_id: newServiceId(),
      });
      expect(res.statusCode).toBe(201);
      const body = json(res) as unknown as { org_type: string; business_id: number | null };
      expect(body.org_type).toBe("institution");
      // No wallet, so no billable party: business_id stays null and the row never
      // reaches the charge path.
      expect(body.business_id).toBeNull();

      expect(
        (await post("/api/v3/applications", student.token, { org_type: "institution", org_id: 99999999 }))
          .statusCode,
      ).toBe(404);
    });
  });
});
