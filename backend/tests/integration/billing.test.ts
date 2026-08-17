// Billing: credits, subscriptions, admin catalogue, Stripe webhook.
//
// Everything runs offline. The module's only outbound dependency is the
// StripeClient interface, which is stubbed here; the fail-closed path is exercised
// by clearing the stub and asserting 503 rather than a fabricated success.
//
// Fixtures are rebuilt from scratch in beforeAll, so a sibling suite wiping the
// database between runs cannot leave this one depending on stale rows.

import Fastify, { type FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dbAvailable, uniqueEmail } from "../helpers/db.js";

const describeDb = describe.skipIf(!dbAvailable);

// ── Stripe stub ─────────────────────────────────────────────────────────────

type StripeModule = typeof import("../../src/modules/billing/services/stripe.client.js");
type StripeClient = StripeModule["getStripeClient"] extends () => infer T ? T : never;

interface Stub {
  client: StripeClient;
  subscriptions: Map<string, any>;
}

/** `runId` keeps every generated Stripe id unique across suite runs — the real
 *  Stripe never reissues a session id either, and our UNIQUE keys assume that. */
function makeStripeStub(runId: string): Stub {
  const sessions = new Map<string, any>();
  const subscriptions = new Map<string, any>();
  let counter = 0;

  const client = {
    async createCheckoutSession(params: any) {
      counter += 1;
      const id = `cs_test_${runId}_${counter}`;
      let subscriptionId: string | null = null;

      if (params.mode === "subscription") {
        subscriptionId = `sub_test_${runId}_${counter}`;
        subscriptions.set(subscriptionId, {
          id: subscriptionId,
          status: "active",
          customer: `cus_test_${runId}_${counter}`,
          price_id: params.priceId,
          interval: "month",
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 86_400,
          cancel_at: null,
        });
      }

      const session = {
        id,
        url: `https://stripe.test/checkout/${id}`,
        status: "complete",
        payment_status: "paid",
        amount_total: (params.unitAmount ?? 0) * params.quantity,
        currency: params.currency,
        customer: `cus_test_${runId}_${counter}`,
        subscription: subscriptionId,
        client_reference_id: params.clientReferenceId,
        metadata: params.metadata,
      };
      sessions.set(id, session);
      return session;
    },
    async retrieveCheckoutSession(id: string) {
      const session = sessions.get(id);
      if (!session) throw new Error(`unknown session ${id}`);
      return session;
    },
    async retrieveSubscription(id: string) {
      const subscription = subscriptions.get(id);
      if (!subscription) throw new Error(`unknown subscription ${id}`);
      return subscription;
    },
    async createBillingPortalSession({ customerId }: { customerId: string }) {
      return { url: `https://stripe.test/portal/${customerId}` };
    },
  };

  return { client: client as unknown as StripeClient, subscriptions };
}

// ── Suite ───────────────────────────────────────────────────────────────────

describeDb("billing", () => {
  let app: FastifyInstance;
  let masterKnex: Knex;
  let shutdownPools: () => Promise<void>;
  let config: Record<string, any>;
  let stripe: StripeModule;
  let signature: typeof import("../../src/modules/billing/services/stripe.signature.js");

  let stub: Stub;
  let planId: number;
  let planCode: string;
  let bizA = 0;
  let bizB = 0;
  let schemaA = "";
  let schemaB = "";
  let userId = 0;
  let tokenA = "";
  let tokenB = "";
  let tokenNoOrg = "";
  let adminToken = "";
  // billing_events and credit_transactions keep their unique keys forever, so
  // every id this suite invents must be unique per run or a second run would be
  // (correctly) rejected as a replay of the first.
  let runId = "";

  const WEBHOOK_SECRET = "whsec_integration_test";

  beforeAll(async () => {
    const jwt = (await import("jsonwebtoken")).default;
    ({ masterKnex } = await import("../../src/core/db/master-pool.js"));
    ({ shutdownAll: shutdownPools } = await import("../../src/core/db/pool-manager.js"));
    ({ config } = (await import("../../src/config.js")) as unknown as { config: Record<string, any> });
    stripe = await import("../../src/modules/billing/services/stripe.client.js");
    signature = await import("../../src/modules/billing/services/stripe.signature.js");

    config.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;

    const { errorHandlerPlugin } = await import("../../src/core/plugins/error-handler.plugin.js");
    const { requestContextPlugin } = await import("../../src/core/plugins/request-context.plugin.js");
    const billingModule = (await import("../../src/modules/billing/index.js")).default;

    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    await app.register(requestContextPlugin);
    await app.register(billingModule);
    await app.ready();

    // ── fixtures ──
    const suffix = `${process.pid}${Date.now() % 1_000_000}`;
    runId = suffix;

    const [user] = await masterKnex("platform_users")
      .insert({
        first_name: "Billing",
        last_name: "Tester",
        email: uniqueEmail("billing.owner"),
        account_status: 1,
      })
      .returning(["id"]);
    userId = user.id;

    const insertBusiness = async (label: string) => {
      const [row] = await masterKnex("businesses")
        .insert({
          owner_id: userId,
          subdomain: `billing-${label}-${suffix}`,
          business_name: `Billing ${label} ${suffix}`,
          account_status: 1,
          status: "active",
        })
        .returning(["id", "schema_name"]);
      return row;
    };

    const a = await insertBusiness("a");
    const b = await insertBusiness("b");
    bizA = a.id;
    schemaA = a.schema_name;
    bizB = b.id;
    schemaB = b.schema_name;

    planCode = `pro-${suffix}`;
    const [plan] = await masterKnex("subscription_plans")
      .insert({
        code: planCode,
        name: "Pro (test)",
        monthly_price: 199,
        annual_price: 1910,
        currency: "AUD",
        trial_days: 14,
        stripe_monthly_price_id: `price_month_${suffix}`,
        stripe_annual_price_id: `price_year_${suffix}`,
        monthly_credit_grant: 800,
        limits: JSON.stringify({ has_ai_tools: true, max_ad_campaigns: 5, has_api_access: false }),
      })
      .returning(["id"]);
    planId = plan.id;

    const sign = (claims: Record<string, unknown>) =>
      jwt.sign({ email: "billing@vitest.local", ...claims }, config.JWT_SECRET as string);

    tokenA = sign({ sub: String(userId), type: "platform_user", orgId: schemaA });
    tokenB = sign({ sub: String(userId), type: "platform_user", orgId: schemaB });
    tokenNoOrg = sign({ sub: String(userId), type: "platform_user" });
    adminToken = sign({ sub: "1", type: "admin", role: "super_admin" });

    stub = makeStripeStub(runId);
  });

  afterAll(async () => {
    stripe?.setStripeClient(null);
    if (config) delete config.STRIPE_WEBHOOK_SECRET;
    await app?.close();
    await shutdownPools?.();
    await masterKnex?.destroy();
  });

  // ── helpers ──

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  function get(url: string, token: string) {
    return app.inject({ method: "GET", url, headers: auth(token) });
  }

  function post(url: string, token: string, payload: unknown) {
    return app.inject({ method: "POST", url, headers: auth(token), payload: payload as object });
  }

  async function balanceOf(businessId: number): Promise<number> {
    const wallet = await masterKnex("credit_wallets").where({ business_id: businessId }).first();
    return wallet?.balance ?? 0;
  }

  function postWebhook(event: unknown, opts: { secret?: string; tamper?: boolean } = {}) {
    const body = JSON.stringify(event);
    const header = signature.buildSignatureHeader(body, opts.secret ?? WEBHOOK_SECRET);
    return app.inject({
      method: "POST",
      url: "/api/v3/billing/webhook",
      headers: { "content-type": "application/json", "stripe-signature": header },
      payload: opts.tamper ? body.replace(/}$/, ',"injected":true}') : body,
    });
  }

  /** Per-run unique id, so replays are only the ones a test asks for. */
  const uid = (name: string) => `${name}_${runId}`;

  function creditPurchaseEvent(eventId: string, sessionId: string, credits: number, businessId: number) {
    return {
      id: eventId,
      type: "checkout.session.completed",
      data: {
        object: {
          id: sessionId,
          object: "checkout_session",
          payment_status: "paid",
          customer: "cus_webhook",
          metadata: {
            kind: "credit_purchase",
            business_id: String(businessId),
            credits: String(credits),
          },
        },
      },
    };
  }

  // ── auth & tenancy ────────────────────────────────────────────────────────

  describe("guards", () => {
    it("rejects an unauthenticated request", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v3/credits/balance" });
      expect(res.statusCode).toBe(401);
    });

    it("rejects a token with no business context", async () => {
      const res = await get("/api/v3/credits/balance", tokenNoOrg);
      expect(res.statusCode).toBe(403);
    });

    it("rejects a non-admin on the admin surface", async () => {
      const res = await get("/api/v3/admin/billing/plans", tokenA);
      expect(res.statusCode).toBe(403);
    });

    it("scopes the balance to the caller's own business", async () => {
      const a = await get("/api/v3/credits/balance", tokenA);
      const b = await get("/api/v3/credits/balance", tokenB);
      expect(a.statusCode).toBe(200);
      expect(b.statusCode).toBe(200);
      // Distinct wallets: crediting A below never shows up on B.
      expect(b.json().balance).toBe(0);
    });
  });

  // ── fail closed ───────────────────────────────────────────────────────────

  describe("Stripe fail-closed", () => {
    it("returns 503, not a fake session, when no keys are configured", async () => {
      stripe.setStripeClient(null);
      const before = await balanceOf(bizA);

      const res = await post("/api/v3/credits/purchase", tokenA, {
        credits: 50,
        success_url: "https://app.test/ok",
        cancel_url: "https://app.test/no",
      });

      expect(res.statusCode).toBe(503);
      expect(res.json().code).toBe("STRIPE_UNAVAILABLE");
      // Nothing was granted on the way to the 503.
      expect(await balanceOf(bizA)).toBe(before);
    });

    it("returns 503 on subscription checkout", async () => {
      stripe.setStripeClient(null);
      const res = await post("/api/v3/subscriptions/checkout", tokenA, {
        plan_code: planCode,
        interval: "month",
        success_url: "https://app.test/ok",
        cancel_url: "https://app.test/no",
      });
      expect(res.statusCode).toBe(503);
    });

    it("validates the body BEFORE reaching for Stripe", async () => {
      stripe.setStripeClient(null);
      const res = await post("/api/v3/credits/purchase", tokenA, {
        credits: 0,
        success_url: "not-a-url",
        cancel_url: "https://app.test/no",
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 404 for an unknown plan before reaching for Stripe", async () => {
      stripe.setStripeClient(null);
      const res = await post("/api/v3/subscriptions/checkout", tokenA, {
        plan_code: "no-such-plan",
        success_url: "https://app.test/ok",
        cancel_url: "https://app.test/no",
      });
      expect(res.statusCode).toBe(404);
    });

    it("returns 503 for the webhook when no signing secret is configured", async () => {
      const saved = config.STRIPE_WEBHOOK_SECRET;
      delete config.STRIPE_WEBHOOK_SECRET;
      try {
        const res = await postWebhook(creditPurchaseEvent(uid("evt_noconf"), uid("cs_noconf"), 10, bizA), {
          secret: saved,
        });
        expect(res.statusCode).toBe(503);
      } finally {
        config.STRIPE_WEBHOOK_SECRET = saved;
      }
    });
  });

  // ── webhook ───────────────────────────────────────────────────────────────

  describe("webhook", () => {
    it("rejects a request with no signature", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v3/billing/webhook",
        headers: { "content-type": "application/json" },
        payload: JSON.stringify(creditPurchaseEvent(uid("evt_nosig"), uid("cs_nosig"), 10, bizA)),
      });
      expect(res.statusCode).toBe(400);
      expect(await balanceOf(bizA)).toBe(0);
    });

    it("rejects a tampered payload", async () => {
      const res = await postWebhook(creditPurchaseEvent(uid("evt_tamper"), uid("cs_tamper"), 999, bizA), {
        tamper: true,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/signature verification failed/i);
      expect(await balanceOf(bizA)).toBe(0);
      const claimed = await masterKnex("billing_events").where({ event_id: uid("evt_tamper") }).first();
      expect(claimed).toBeUndefined();
    });

    it("rejects a signature made with the wrong secret", async () => {
      const res = await postWebhook(creditPurchaseEvent(uid("evt_wrongkey"), uid("cs_wrongkey"), 5, bizA), {
        secret: "whsec_attacker",
      });
      expect(res.statusCode).toBe(400);
      expect(await balanceOf(bizA)).toBe(0);
    });

    it("settles a genuine credit purchase exactly once across duplicate deliveries", async () => {
      const event = creditPurchaseEvent(uid("evt_credit_1"), uid("cs_credit_1"), 40, bizA);

      const first = await postWebhook(event);
      expect(first.statusCode).toBe(200);
      expect(first.json()).toMatchObject({ received: true, duplicate: false, handled: true });
      expect(await balanceOf(bizA)).toBe(40);

      // Stripe retries the same event id.
      const replay = await postWebhook(event);
      expect(replay.statusCode).toBe(200);
      expect(replay.json()).toMatchObject({ received: true, duplicate: true, handled: false });
      expect(await balanceOf(bizA)).toBe(40);

      const rows = await masterKnex("credit_transactions")
        .where({ reference_id: uid("cs_credit_1") })
        .select("id");
      expect(rows).toHaveLength(1);
    });

    it("still refuses to double-credit when the same session arrives under a new event id", async () => {
      // Belt and braces: the billing_events claim is bypassed, so the UNIQUE
      // idempotency key on credit_transactions is the only thing standing between
      // the wallet and a second grant.
      const res = await postWebhook(creditPurchaseEvent(uid("evt_credit_2"), uid("cs_credit_1"), 40, bizA));
      expect(res.statusCode).toBe(200);
      expect(await balanceOf(bizA)).toBe(40);
      const rows = await masterKnex("credit_transactions")
        .where({ reference_id: uid("cs_credit_1") })
        .select("id");
      expect(rows).toHaveLength(1);
    });

    it("acknowledges an event it cannot map to a business without settling it", async () => {
      const event = creditPurchaseEvent(uid("evt_orphan"), uid("cs_orphan"), 10, 0);
      event.data.object.metadata.business_id = "";
      event.data.object.customer = "cus_unknown_customer";

      const res = await postWebhook(event);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ received: true, handled: false });
      const claimed = await masterKnex("billing_events").where({ event_id: uid("evt_orphan") }).first();
      expect(claimed).toBeTruthy();
    });
  });

  // ── credits ───────────────────────────────────────────────────────────────

  describe("credits", () => {
    it("reports the balance and a paginated ledger", async () => {
      const balance = await get("/api/v3/credits/balance", tokenA);
      expect(balance.statusCode).toBe(200);
      expect(balance.json()).toMatchObject({ balance: 40, purchased_balance: 40 });

      const ledger = await get("/api/v3/credits/transactions?page=1&limit=10", tokenA);
      expect(ledger.statusCode).toBe(200);
      const body = ledger.json();
      expect(body.meta).toMatchObject({ page: 1, limit: 10, total: 1 });
      expect(body.data[0]).toMatchObject({ transaction_type: "purchase", amount: 40 });
    });

    it("opens a checkout session when Stripe is available", async () => {
      stripe.setStripeClient(stub.client);
      const res = await post("/api/v3/credits/purchase", tokenA, {
        credits: 25,
        success_url: "https://app.test/ok",
        cancel_url: "https://app.test/no",
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().url).toMatch(/^https:\/\/stripe\.test\/checkout\//);
      // A session is not money: the balance must not move until it is verified.
      expect(await balanceOf(bizA)).toBe(40);
    });

    it("settles a verified purchase once, however many times it is polled", async () => {
      stripe.setStripeClient(stub.client);
      const opened = await post("/api/v3/credits/purchase", tokenA, {
        credits: 25,
        success_url: "https://app.test/ok",
        cancel_url: "https://app.test/no",
      });
      const sessionId = opened.json().session_id;

      const first = await post("/api/v3/credits/purchase/verify", tokenA, { session_id: sessionId });
      expect(first.statusCode).toBe(200);
      expect(first.json()).toMatchObject({ settled: true, duplicate: false, credits: 25 });
      expect(await balanceOf(bizA)).toBe(65);

      const second = await post("/api/v3/credits/purchase/verify", tokenA, { session_id: sessionId });
      expect(second.statusCode).toBe(200);
      expect(second.json()).toMatchObject({ settled: true, duplicate: true });
      expect(await balanceOf(bizA)).toBe(65);
    });

    it("refuses a spend larger than the balance", async () => {
      const res = await post("/api/v3/credits/spend", tokenA, { amount: 10_000 });
      expect(res.statusCode).toBe(402);
      expect(res.json().code).toBe("INSUFFICIENT_CREDITS");
      expect(await balanceOf(bizA)).toBe(65);
    });

    it("never lets concurrent spends drive the balance negative", async () => {
      // Level the wallet at exactly 100 so the arithmetic is unambiguous.
      const current = await balanceOf(bizA);
      if (current > 100) {
        const drain = await post("/api/v3/credits/spend", tokenA, { amount: current - 100 });
        expect(drain.statusCode).toBe(200);
      } else if (current < 100) {
        await postWebhook(creditPurchaseEvent(uid("evt_topup"), uid("cs_topup"), 100 - current, bizA));
      }
      expect(await balanceOf(bizA)).toBe(100);

      const attempts = 20;
      const spend = 10;
      const results = await Promise.all(
        Array.from({ length: attempts }, (_, i) =>
          post("/api/v3/credits/spend", tokenA, {
            amount: spend,
            transaction_type: "enquiry_unlock",
            reference_type: "concurrency",
            reference_id: `race-${i}`,
          }),
        ),
      );

      const ok = results.filter((r) => r.statusCode === 200);
      const refused = results.filter((r) => r.statusCode === 402);
      expect(ok).toHaveLength(10);
      expect(refused).toHaveLength(attempts - 10);

      // This is the assertion that separates the row lock from the CHECK
      // constraint. The constraint alone WOULD keep the balance non-negative, but
      // it would do it by aborting the losing transactions — every over-spend
      // would surface as a 500 from a constraint violation. Demanding that every
      // loser is a clean 402, and that nothing 5xx'd, can only pass if the
      // FOR UPDATE lock serialised the spends and the `balance >= amount` guard
      // rejected them in application code before the write was attempted.
      expect(results.filter((r) => r.statusCode >= 500)).toHaveLength(0);
      expect(ok.length + refused.length).toBe(attempts);
      for (const r of refused) expect(r.json().code).toBe("INSUFFICIENT_CREDITS");

      const wallet = await masterKnex("credit_wallets").where({ business_id: bizA }).first();
      expect(wallet.balance).toBe(0);
      expect(wallet.subscription_balance).toBeGreaterThanOrEqual(0);
      expect(wallet.purchased_balance).toBeGreaterThanOrEqual(0);
      expect(wallet.balance).toBe(wallet.subscription_balance + wallet.purchased_balance);

      // Every accepted spend wrote exactly one ledger row, and no rejected one did.
      const debits = await masterKnex("credit_transactions")
        .where({ wallet_id: wallet.id, reference_type: "concurrency" })
        .sum<{ sum: string }[]>("amount as sum");
      expect(Number(debits[0].sum)).toBe(-100);

      const rows = await masterKnex("credit_transactions")
        .where({ wallet_id: wallet.id, reference_type: "concurrency" })
        .count<{ count: string }[]>("* as count");
      expect(Number(rows[0].count)).toBe(10);

      // The ledger's running balance never went below zero.
      const lowest = await masterKnex("credit_transactions")
        .where({ wallet_id: wallet.id })
        .min<{ min: number }[]>("balance_after as min");
      expect(Number(lowest[0].min)).toBeGreaterThanOrEqual(0);
    });
  });

  // ── subscriptions ─────────────────────────────────────────────────────────

  describe("subscriptions", () => {
    it("lists public plans", async () => {
      const res = await get("/api/v3/subscriptions/plans", tokenA);
      expect(res.statusCode).toBe(200);
      expect(res.json().some((p: any) => p.code === planCode)).toBe(true);
    });

    it("gates access with 402 when there is no subscription at all", async () => {
      const res = await get("/api/v3/subscriptions/access/has_ai_tools", tokenB);
      expect(res.statusCode).toBe(402);
      expect(res.json().code).toBe("SUBSCRIPTION_REQUIRED");
    });

    it("gates access with 402 when the subscription has lapsed", async () => {
      await masterKnex("business_subscriptions").insert({
        business_id: bizB,
        plan_id: planId,
        // Status still says active — only the period tells the truth.
        status: "active",
        current_period_start: new Date(Date.now() - 60 * 86_400_000),
        current_period_end: new Date(Date.now() - 30 * 86_400_000),
      });

      const res = await get("/api/v3/subscriptions/access/has_ai_tools", tokenB);
      expect(res.statusCode).toBe(402);
      expect(res.json().code).toBe("SUBSCRIPTION_REQUIRED");

      const current = await get("/api/v3/subscriptions/current", tokenB);
      expect(current.json().entitled).toBe(false);
    });

    it("settles a subscription checkout and grants the plan's monthly credits once", async () => {
      stripe.setStripeClient(stub.client);
      const opened = await post("/api/v3/subscriptions/checkout", tokenA, {
        plan_code: planCode,
        interval: "month",
        success_url: "https://app.test/ok",
        cancel_url: "https://app.test/no",
      });
      expect(opened.statusCode).toBe(201);
      const sessionId = opened.json().session_id;

      const verified = await post("/api/v3/subscriptions/checkout/verify", tokenA, {
        session_id: sessionId,
      });
      expect(verified.statusCode).toBe(200);
      expect(verified.json()).toMatchObject({ settled: true, status: "active", granted: 800 });
      expect(await balanceOf(bizA)).toBe(800);

      // Polling again must not grant a second time.
      const again = await post("/api/v3/subscriptions/checkout/verify", tokenA, {
        session_id: sessionId,
      });
      expect(again.json().granted).toBe(0);
      expect(await balanceOf(bizA)).toBe(800);

      // The denormalised columns on `businesses` were kept in step.
      const business = await masterKnex("businesses").where({ id: bizA }).first();
      expect(business.plan_code).toBe(planCode);
      expect(business.subscription_id).toMatch(/^sub_test_/);
    });

    it("allows a feature the live plan includes and refuses one it does not", async () => {
      const allowed = await get("/api/v3/subscriptions/access/has_ai_tools", tokenA);
      expect(allowed.statusCode).toBe(200);
      expect(allowed.json()).toMatchObject({ allowed: true, plan_code: planCode });

      const capped = await get("/api/v3/subscriptions/access/max_ad_campaigns", tokenA);
      expect(capped.statusCode).toBe(200);
      expect(capped.json().limit).toBe(5);

      const excluded = await get("/api/v3/subscriptions/access/has_api_access", tokenA);
      expect(excluded.statusCode).toBe(403);

      const unknown = await get("/api/v3/subscriptions/access/teleportation", tokenA);
      expect(unknown.statusCode).toBe(403);
    });

    it("cancels on customer.subscription.deleted and re-gates access", async () => {
      const subscription = await masterKnex("business_subscriptions").where({ business_id: bizA }).first();

      const res = await postWebhook({
        id: uid("evt_sub_deleted"),
        type: "customer.subscription.deleted",
        data: {
          object: {
            id: subscription.stripe_subscription_id,
            object: "subscription",
            status: "canceled",
            customer: subscription.stripe_customer_id,
          },
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ handled: true });

      const after = await get("/api/v3/subscriptions/access/has_ai_tools", tokenA);
      expect(after.statusCode).toBe(402);
    });

    it("returns a portal link, and 503 when Stripe is unavailable", async () => {
      stripe.setStripeClient(stub.client);
      const ok = await post("/api/v3/subscriptions/portal", tokenA, {
        return_url: "https://app.test/billing",
      });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().url).toMatch(/^https:\/\/stripe\.test\/portal\//);

      stripe.setStripeClient(null);
      const closed = await post("/api/v3/subscriptions/portal", tokenA, {
        return_url: "https://app.test/billing",
      });
      expect(closed.statusCode).toBe(503);
    });

    it("404s the portal for a business with no billing account", async () => {
      stripe.setStripeClient(stub.client);
      const res = await post("/api/v3/subscriptions/portal", tokenB, {
        return_url: "https://app.test/billing",
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── admin ─────────────────────────────────────────────────────────────────

  describe("admin", () => {
    it("manages the plan catalogue", async () => {
      const created = await post("/api/v3/admin/billing/plans", adminToken, {
        code: `${planCode}-admin`,
        name: "Admin created",
        monthly_price: 10,
        limits: { has_analytics: true },
      });
      expect(created.statusCode).toBe(201);
      const id = created.json().id;

      const patched = await app.inject({
        method: "PATCH",
        url: `/api/v3/admin/billing/plans/${id}`,
        headers: auth(adminToken),
        payload: { name: "Admin renamed", is_public: false },
      });
      expect(patched.statusCode).toBe(200);
      expect(patched.json().name).toBe("Admin renamed");

      const listed = await get("/api/v3/admin/billing/plans", adminToken);
      expect(listed.json().some((p: any) => p.id === id)).toBe(true);

      const removed = await app.inject({
        method: "DELETE",
        url: `/api/v3/admin/billing/plans/${id}`,
        headers: auth(adminToken),
      });
      expect(removed.statusCode).toBe(200);

      const gone = await app.inject({
        method: "DELETE",
        url: `/api/v3/admin/billing/plans/${id}`,
        headers: auth(adminToken),
      });
      expect(gone.statusCode).toBe(404);
    });

    it("rejects an impossible coupon", async () => {
      const res = await post("/api/v3/admin/billing/coupons", adminToken, {
        code: `BAD-${Date.now()}`,
        discount_type: "percentage",
        discount_value: 150,
      });
      expect(res.statusCode).toBe(400);
    });

    it("manages coupons", async () => {
      const code = `SAVE-${Date.now()}`;
      const created = await post("/api/v3/admin/billing/coupons", adminToken, {
        code,
        discount_type: "percentage",
        discount_value: 25,
        applicable_plans: [planCode],
      });
      expect(created.statusCode).toBe(201);
      const id = created.json().id;

      const patched = await app.inject({
        method: "PATCH",
        url: `/api/v3/admin/billing/coupons/${id}`,
        headers: auth(adminToken),
        payload: { is_active: false },
      });
      expect(patched.statusCode).toBe(200);
      expect(patched.json().is_active).toBe(false);

      const removed = await app.inject({
        method: "DELETE",
        url: `/api/v3/admin/billing/coupons/${id}`,
        headers: auth(adminToken),
      });
      expect(removed.statusCode).toBe(200);
    });

    it("lists subscribers across every business", async () => {
      const res = await get("/api/v3/admin/billing/subscribers?limit=100", adminToken);
      expect(res.statusCode).toBe(200);
      const ids = res.json().data.map((r: any) => r.business_id);
      expect(ids).toContain(bizA);
      expect(ids).toContain(bizB);
    });

    it("reads the credit ledger across every business, filterable", async () => {
      const all = await get("/api/v3/admin/billing/transactions?limit=100", adminToken);
      expect(all.statusCode).toBe(200);
      expect(all.json().meta.total).toBeGreaterThan(0);
      expect(all.json().data[0]).toHaveProperty("business_name");

      const filtered = await get(
        `/api/v3/admin/billing/transactions?business_id=${bizA}&transaction_type=enquiry_unlock&limit=100`,
        adminToken,
      );
      expect(filtered.statusCode).toBe(200);
      expect(filtered.json().data.every((r: any) => r.transaction_type === "enquiry_unlock")).toBe(true);
      expect(filtered.json().meta.total).toBe(10);
    });
  });
});
