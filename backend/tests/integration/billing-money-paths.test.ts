// Wave COV-2: the Stripe webhook branches billing.test.ts never reached, and the
// credit/verify guards that stand between a hostile payload and free credits.
//
// billing.test.ts already pins signature rejection, replay idempotency and the
// credit-purchase happy path. What it never exercised is the *subscription*
// family — created / updated / payment_failed / unknown type — and the malformed
// bodies. Those are the branches where a bug grants credits nobody paid for, so
// every test here asserts the wallet as well as the status code.
//
// Own business, own plan, own event ids: nothing here depends on billing.test.ts
// having run, or on the order the two files run in.

import Fastify, { type FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dbAvailable, uniqueEmail } from "../helpers/db.js";

const describeDb = describe.skipIf(!dbAvailable);

const WEBHOOK_SECRET = "whsec_cov2_money_paths";

/** Minimal Stripe stub — only the calls these tests reach. */
function makeStripeStub(runId: string) {
  const sessions = new Map<string, Record<string, unknown>>();
  let counter = 0;
  const client = {
    async createCheckoutSession(params: {
      metadata?: Record<string, string>;
      quantity: number;
      unitAmount: number | null;
      currency: string;
    }) {
      counter += 1;
      const id = `cs_cov2_${runId}_${counter}`;
      const session = {
        id,
        url: `https://stripe.test/checkout/${id}`,
        status: "complete",
        payment_status: "paid",
        amount_total: (params.unitAmount ?? 0) * params.quantity,
        currency: params.currency,
        customer: `cus_cov2_${runId}_${counter}`,
        subscription: null,
        metadata: params.metadata ?? {},
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
      throw new Error(`retrieveSubscription should not be reached (${id})`);
    },
    async createBillingPortalSession({ customerId }: { customerId: string }) {
      return { url: `https://stripe.test/portal/${customerId}` };
    },
    /** Let a test rewrite a stubbed session, to model Stripe reporting it unpaid. */
    __patch(id: string, patch: Record<string, unknown>) {
      sessions.set(id, { ...sessions.get(id), ...patch });
    },
  };
  return client;
}

describeDb("billing money paths", () => {
  let app: FastifyInstance;
  let db: Knex;
  let shutdownPools: () => Promise<void>;
  let config: Record<string, unknown>;
  let stripe: typeof import("../../src/modules/billing/services/stripe.client.js");
  let signature: typeof import("../../src/modules/billing/services/stripe.signature.js");

  let stub: ReturnType<typeof makeStripeStub>;
  let runId = "";
  let userId = 0;
  let bizId = 0;
  let otherBizId = 0;
  let planId = 0;
  let planCode = "";
  let monthlyPriceId = "";
  let annualPriceId = "";
  let token = "";
  let otherToken = "";

  beforeAll(async () => {
    const jwt = (await import("jsonwebtoken")).default;
    ({ masterKnex: db } = await import("../../src/core/db/master-pool.js"));
    ({ shutdownAll: shutdownPools } = await import("../../src/core/db/pool-manager.js"));
    ({ config } = (await import("../../src/config.js")) as unknown as { config: Record<string, unknown> });
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

    runId = `${process.pid}${Date.now() % 1_000_000}`;
    stub = makeStripeStub(runId);
    stripe.setStripeClient(stub as never);

    const [user] = await db("platform_users")
      .insert({
        first_name: "Money",
        last_name: "Paths",
        email: uniqueEmail("cov2.money"),
        account_status: 1,
      })
      .returning(["id"]);
    userId = user.id;

    const insertBusiness = async (label: string) => {
      const [row] = await db("businesses")
        .insert({
          owner_id: userId,
          subdomain: `cov2-${label}-${runId}`,
          business_name: `Cov2 ${label} ${runId}`,
          account_status: 1,
          status: "active",
        })
        .returning(["id", "schema_name"]);
      return row;
    };
    const primary = await insertBusiness("primary");
    const other = await insertBusiness("other");
    bizId = primary.id;
    otherBizId = other.id;

    planCode = `cov2-plan-${runId}`;
    monthlyPriceId = `price_cov2_month_${runId}`;
    annualPriceId = `price_cov2_year_${runId}`;
    const [plan] = await db("subscription_plans")
      .insert({
        code: planCode,
        name: "Cov2 Plan",
        monthly_price: 99,
        annual_price: 990,
        currency: "AUD",
        stripe_monthly_price_id: monthlyPriceId,
        stripe_annual_price_id: annualPriceId,
        monthly_credit_grant: 500,
        limits: JSON.stringify({ has_ai_tools: true, seats: 3, tier_name: "gold", max_ads: 0 }),
      })
      .returning(["id"]);
    planId = plan.id;

    const sign = (claims: Record<string, unknown>) =>
      jwt.sign({ email: "cov2@vitest.local", ...claims }, config.JWT_SECRET as string);
    token = sign({ sub: String(userId), type: "platform_user", orgId: primary.schema_name });
    otherToken = sign({ sub: String(userId), type: "platform_user", orgId: other.schema_name });
  });

  afterAll(async () => {
    stripe?.setStripeClient(null);
    if (config) delete config.STRIPE_WEBHOOK_SECRET;
    await app?.close();
    await shutdownPools?.();
    await db?.destroy();
  });

  // ── helpers ───────────────────────────────────────────────────────────────

  const auth = (t: string) => ({ authorization: `Bearer ${t}` });
  const get = (url: string, t = token) => app.inject({ method: "GET", url, headers: auth(t) });
  const post = (url: string, payload: unknown, t = token) =>
    app.inject({ method: "POST", url, headers: auth(t), payload: payload as object });

  function postWebhook(event: unknown, opts: { rawBody?: string } = {}) {
    const body = opts.rawBody ?? JSON.stringify(event);
    return app.inject({
      method: "POST",
      url: "/api/v3/billing/webhook",
      headers: {
        "content-type": "application/json",
        "stripe-signature": signature.buildSignatureHeader(body, WEBHOOK_SECRET),
      },
      payload: body,
    });
  }

  const uid = (name: string) => `${name}_${runId}`;

  async function balance(businessId = bizId): Promise<number> {
    const wallet = await db("credit_wallets").where({ business_id: businessId }).first();
    return wallet?.balance ?? 0;
  }

  async function subscriptionRow(businessId = bizId) {
    return db("business_subscriptions").where({ business_id: businessId }).whereNull("deleted_at").first();
  }

  const NOW = Math.floor(Date.now() / 1000);

  /** A `customer.subscription.*` payload in Stripe's own shape. */
  function subscriptionEvent(
    eventId: string,
    over: {
      type?: string;
      subscriptionId?: string;
      status?: string;
      interval?: "month" | "year";
      priceId?: string | null;
      planCode?: string | null;
      businessId?: number | null;
      periodStart?: number | null;
      periodEnd?: number | null;
      cancelAt?: number | null;
      customer?: unknown;
    } = {},
  ) {
    const metadata: Record<string, string> = {};
    if (over.businessId !== null) metadata.business_id = String(over.businessId ?? bizId);
    if (over.planCode !== null) metadata.plan_code = over.planCode ?? planCode;

    return {
      id: eventId,
      type: over.type ?? "customer.subscription.created",
      data: {
        object: {
          id: over.subscriptionId ?? uid("sub_cov2"),
          object: "subscription",
          status: over.status ?? "active",
          customer: over.customer ?? `cus_cov2_${runId}`,
          current_period_start: over.periodStart === undefined ? NOW : over.periodStart,
          current_period_end: over.periodEnd === undefined ? NOW + 30 * 86_400 : over.periodEnd,
          cancel_at: over.cancelAt ?? null,
          items: {
            data: [
              {
                price: {
                  id: over.priceId === null ? undefined : (over.priceId ?? monthlyPriceId),
                  recurring: { interval: over.interval ?? "month" },
                },
              },
            ],
          },
          metadata,
        },
      },
    };
  }

  // ── malformed bodies ──────────────────────────────────────────────────────
  // A correctly signed body is still not necessarily a Stripe event. These must
  // be 400s, not 500s, and must claim nothing.

  it("rejects a correctly signed body that is not JSON", async () => {
    const res = await postWebhook(null, { rawBody: "not-json-at-all" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/not valid JSON/i);
  });

  it("rejects a correctly signed JSON body that is not a Stripe event", async () => {
    for (const body of [
      {},
      { id: uid("evt_shape_a") },
      { id: uid("evt_shape_b"), type: "customer.subscription.created" },
      { id: uid("evt_shape_c"), type: "customer.subscription.created", data: {} },
      { type: "customer.subscription.created", data: { object: { id: "sub_x" } } },
    ]) {
      const res = await postWebhook(body);
      expect(res.statusCode, JSON.stringify(body)).toBe(400);
      expect(res.json().error).toMatch(/not a Stripe event/i);
    }
    // Nothing was claimed, so a corrected redelivery is still processable.
    const claimed = await db("billing_events").whereIn("event_id", [
      uid("evt_shape_a"),
      uid("evt_shape_b"),
      uid("evt_shape_c"),
    ]);
    expect(claimed).toEqual([]);
  });

  // ── subscription.created / updated ────────────────────────────────────────

  it("settles customer.subscription.created and grants the plan's credits exactly once", async () => {
    const subscriptionId = uid("sub_created");
    const event = subscriptionEvent(uid("evt_sub_created"), { subscriptionId });

    const first = await postWebhook(event);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ received: true, duplicate: false, handled: true });

    const row = await subscriptionRow();
    expect(row).toMatchObject({
      plan_id: planId,
      status: "active",
      billing_interval: "month",
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: `cus_cov2_${runId}`,
    });
    expect(new Date(row.current_period_end).getTime()).toBe((NOW + 30 * 86_400) * 1000);
    expect(row.trial_ends_at).toBeNull();
    expect(row.canceled_at).toBeNull();
    expect(await balance()).toBe(500);

    // Stripe retries the same event id: the claim rejects it and no money moves.
    const replay = await postWebhook(event);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toMatchObject({ duplicate: true, handled: false });
    expect(await balance()).toBe(500);

    // And a *new* event id for the same period must not re-grant either — the
    // grant's idempotency key is period-derived, not event-derived.
    const sameperiod = await postWebhook({ ...event, id: uid("evt_sub_created_again") });
    expect(sameperiod.statusCode).toBe(200);
    expect(await balance()).toBe(500);

    const grants = await db("credit_transactions")
      .where({ reference_id: subscriptionId, transaction_type: "subscription_grant" })
      .select("id");
    expect(grants).toHaveLength(1);
  });

  it("grants again for a new billing period, because that is a new month of credits", async () => {
    const nextPeriodStart = NOW + 30 * 86_400;
    const res = await postWebhook(
      subscriptionEvent(uid("evt_sub_renewed"), {
        type: "customer.subscription.updated",
        subscriptionId: uid("sub_created"),
        periodStart: nextPeriodStart,
        periodEnd: nextPeriodStart + 30 * 86_400,
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ handled: true });
    expect(await balance()).toBe(1000);
  });

  it("reads the billing interval off the Stripe price, not a default", async () => {
    const res = await postWebhook(
      subscriptionEvent(uid("evt_sub_annual"), {
        type: "customer.subscription.updated",
        subscriptionId: uid("sub_created"),
        interval: "year",
        priceId: annualPriceId,
        periodStart: NOW + 60 * 86_400,
        periodEnd: NOW + 425 * 86_400,
      }),
    );
    expect(res.statusCode).toBe(200);
    expect((await subscriptionRow()).billing_interval).toBe("year");
  });

  it("resolves the plan from the Stripe price id when the payload carries no plan_code", async () => {
    const res = await postWebhook(
      subscriptionEvent(uid("evt_sub_byprice"), {
        type: "customer.subscription.updated",
        subscriptionId: uid("sub_created"),
        planCode: null,
        priceId: annualPriceId,
        periodStart: NOW + 90 * 86_400,
        periodEnd: NOW + 455 * 86_400,
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ handled: true });
    expect((await subscriptionRow()).plan_id).toBe(planId);
  });

  it("refuses to settle against a deleted plan, whichever price id the payload carries", async () => {
    // Defect COV2-1: findPlanByStripePrice built
    //   monthly = ? or annual = ? and deleted_at is null
    // and SQL binds AND tighter than OR, so the deleted_at filter only ever
    // applied to the annual branch. A soft-deleted plan matched on its MONTHLY
    // price id still resolved — and settleSubscription then paid out its
    // monthly_credit_grant for as long as Stripe kept sending that price.
    const deletedCode = `cov2-deleted-${runId}`;
    const deletedMonthly = `price_cov2_deleted_month_${runId}`;
    const deletedAnnual = `price_cov2_deleted_year_${runId}`;
    await db("subscription_plans").insert({
      code: deletedCode,
      name: "Withdrawn",
      monthly_price: 49,
      annual_price: 490,
      currency: "AUD",
      stripe_monthly_price_id: deletedMonthly,
      stripe_annual_price_id: deletedAnnual,
      monthly_credit_grant: 5_000,
      deleted_at: new Date(),
    });

    for (const [label, priceId] of [
      ["monthly", deletedMonthly],
      ["annual", deletedAnnual],
    ] as const) {
      const before = await balance(otherBizId);
      const res = await postWebhook(
        subscriptionEvent(uid(`evt_sub_deletedplan_${label}`), {
          businessId: otherBizId,
          subscriptionId: uid(`sub_deletedplan_${label}`),
          planCode: null,
          priceId,
        }),
      );
      expect(res.statusCode, label).toBe(404);
      expect(await balance(otherBizId), label).toBe(before);
      expect(
        await db("billing_events").where({ event_id: uid(`evt_sub_deletedplan_${label}`) }).first(),
      ).toBeUndefined();
    }
  });

  it("rolls the event claim back when no plan can be resolved, so Stripe retries", async () => {
    const before = await balance();
    const res = await postWebhook(
      subscriptionEvent(uid("evt_sub_noplan"), {
        subscriptionId: uid("sub_noplan"),
        planCode: null,
        priceId: "price_that_does_not_exist",
      }),
    );
    expect(res.statusCode).toBe(404);
    expect(await balance()).toBe(before);
    // The claim must NOT survive: a swallowed event is money we never settle.
    const claimed = await db("billing_events").where({ event_id: uid("evt_sub_noplan") }).first();
    expect(claimed).toBeUndefined();
  });

  it("records a trial as trialing with the period end as the trial end", async () => {
    const trialEnd = NOW + 14 * 86_400;
    const res = await postWebhook(
      subscriptionEvent(uid("evt_sub_trial"), {
        businessId: otherBizId,
        subscriptionId: uid("sub_trial"),
        status: "trialing",
        customer: `cus_cov2_trial_${runId}`,
        periodEnd: trialEnd,
      }),
    );
    expect(res.statusCode).toBe(200);
    const row = await subscriptionRow(otherBizId);
    expect(row.status).toBe("trialing");
    expect(new Date(row.trial_ends_at).getTime()).toBe(trialEnd * 1000);
    // A trial is entitled, and it grants credits.
    expect((await get("/api/v3/subscriptions/access/has_ai_tools", otherToken)).statusCode).toBe(200);
    expect(await balance(otherBizId)).toBe(500);
  });

  it("grants NO credits for a subscription Stripe reports as unpaid", async () => {
    const before = await balance(otherBizId);
    const res = await postWebhook(
      subscriptionEvent(uid("evt_sub_unpaid"), {
        type: "customer.subscription.updated",
        businessId: otherBizId,
        subscriptionId: uid("sub_trial"),
        status: "unpaid",
        periodStart: NOW + 20 * 86_400,
        periodEnd: NOW + 50 * 86_400,
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ handled: true });
    // "unpaid" maps onto our past_due, which is not entitled — so no grant, and
    // the feature gate closes. This is the branch that would hand out free
    // credits to a lapsed card if ENTITLED_STATUSES were dropped from the check.
    expect((await subscriptionRow(otherBizId)).status).toBe("past_due");
    expect(await balance(otherBizId)).toBe(before);
    expect((await get("/api/v3/subscriptions/access/has_ai_tools", otherToken)).statusCode).toBe(402);
  });

  it("maps an unrecognised Stripe status to expired rather than guessing", async () => {
    const res = await postWebhook(
      subscriptionEvent(uid("evt_sub_weird"), {
        type: "customer.subscription.updated",
        businessId: otherBizId,
        subscriptionId: uid("sub_trial"),
        status: "incomplete_expired",
        periodStart: NOW + 60 * 86_400,
        periodEnd: NOW + 90 * 86_400,
      }),
    );
    expect(res.statusCode).toBe(200);
    expect((await subscriptionRow(otherBizId)).status).toBe("expired");
    expect((await get("/api/v3/subscriptions/access/has_ai_tools", otherToken)).statusCode).toBe(402);
  });

  it("records a scheduled cancellation as a downgrade date without cancelling now", async () => {
    const cancelAt = NOW + 25 * 86_400;
    const res = await postWebhook(
      subscriptionEvent(uid("evt_sub_downgrade"), {
        type: "customer.subscription.updated",
        subscriptionId: uid("sub_created"),
        cancelAt,
        periodStart: NOW + 120 * 86_400,
        periodEnd: NOW + 150 * 86_400,
      }),
    );
    expect(res.statusCode).toBe(200);
    const row = await subscriptionRow();
    expect(new Date(row.downgrade_at).getTime()).toBe(cancelAt * 1000);
    expect(row.status).toBe("active");
    expect(row.canceled_at).toBeNull();
  });

  // ── business resolution ──────────────────────────────────────────────────

  it("resolves the business from the subscription id when metadata is absent", async () => {
    const before = await balance();
    const res = await postWebhook(
      subscriptionEvent(uid("evt_sub_bysubid"), {
        type: "customer.subscription.updated",
        subscriptionId: uid("sub_created"),
        businessId: null, // no metadata.business_id
        customer: "cus_totally_unknown",
        periodStart: NOW + 180 * 86_400,
        periodEnd: NOW + 210 * 86_400,
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ handled: true });
    // It landed on OUR business, not some other one, and paid out one period.
    expect((await subscriptionRow()).stripe_subscription_id).toBe(uid("sub_created"));
    expect(await balance()).toBe(before + 500);
  });

  it("resolves the business from an expanded customer object on a non-subscription payload", async () => {
    // invoice.payment_failed carries an invoice, not a subscription, and Stripe
    // may send `customer` expanded. Both fallbacks have to work or a real card
    // failure is silently acknowledged and never re-gated.
    const customerId = (await subscriptionRow()).stripe_customer_id;
    const res = await postWebhook({
      id: uid("evt_invoice_failed"),
      type: "invoice.payment_failed",
      data: {
        object: {
          id: uid("in_failed"),
          object: "invoice",
          customer: { id: customerId, object: "customer" },
          metadata: {},
        },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ handled: true });
    expect((await subscriptionRow()).status).toBe("past_due");
    expect((await get("/api/v3/subscriptions/access/has_ai_tools")).statusCode).toBe(402);
  });

  it("acknowledges a payment failure for an unknown customer without inventing a subscription", async () => {
    const res = await postWebhook({
      id: uid("evt_invoice_orphan"),
      type: "invoice.payment_failed",
      data: {
        object: { id: uid("in_orphan"), object: "invoice", customer: "cus_no_such_customer", metadata: {} },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ handled: false });
    // Recorded for reconciliation even though nothing was settled.
    expect(await db("billing_events").where({ event_id: uid("evt_invoice_orphan") }).first()).toBeTruthy();
  });

  it("acknowledges a mapped event type it does not handle, and settles nothing", async () => {
    const before = await balance();
    const res = await postWebhook({
      id: uid("evt_unhandled"),
      type: "invoice.paid",
      data: {
        object: { id: uid("in_paid"), object: "invoice", metadata: { business_id: String(bizId) } },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ received: true, duplicate: false, handled: false, event_type: "invoice.paid" });
    expect(await balance()).toBe(before);
    // Ack'd but journalled, so reconciliation can see what we chose to ignore.
    const claimed = await db("billing_events").where({ event_id: uid("evt_unhandled") }).first();
    expect(claimed.business_id).toBe(bizId);
  });

  it("acknowledges a deletion for a business that has no subscription row", async () => {
    const res = await postWebhook(
      subscriptionEvent(uid("evt_del_nosub"), {
        type: "customer.subscription.deleted",
        subscriptionId: uid("sub_never_existed"),
        businessId: null,
        customer: `cus_cov2_${runId}`,
      }),
    );
    // Resolves to our business via the customer id, but the delete handler only
    // reports handled when there was something to cancel.
    expect(res.statusCode).toBe(200);
    expect(res.json().received).toBe(true);
  });

  // ── credit purchase webhook guards ───────────────────────────────────────

  function creditEvent(eventId: string, sessionId: string, metadata: Record<string, string>, over: Record<string, unknown> = {}) {
    return {
      id: eventId,
      type: "checkout.session.completed",
      data: {
        object: {
          id: sessionId,
          object: "checkout_session",
          payment_status: "paid",
          customer: `cus_cov2_${runId}`,
          metadata,
          ...over,
        },
      },
    };
  }

  it("ignores a checkout session that is not a credit purchase", async () => {
    const before = await balance();
    const res = await postWebhook(
      creditEvent(uid("evt_cs_subkind"), uid("cs_subkind"), {
        kind: "subscription",
        business_id: String(bizId),
        credits: "999",
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ handled: false });
    expect(await balance()).toBe(before);
  });

  it("ignores a credit checkout Stripe has not marked paid", async () => {
    const before = await balance();
    const res = await postWebhook(
      creditEvent(
        uid("evt_cs_unpaid"),
        uid("cs_unpaid"),
        { kind: "credit_purchase", business_id: String(bizId), credits: "250" },
        { payment_status: "unpaid" },
      ),
    );
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ handled: false });
    expect(await balance()).toBe(before);
  });

  it("refuses to grant credits from a payload with a nonsense quantity", async () => {
    const before = await balance();
    for (const credits of ["0", "-40", "12.5", "lots", ""]) {
      const res = await postWebhook(
        creditEvent(uid(`evt_cs_bad_${credits || "empty"}`), uid(`cs_bad_${credits || "empty"}`), {
          kind: "credit_purchase",
          business_id: String(bizId),
          credits,
        }),
      );
      expect(res.statusCode, credits).toBe(200);
      expect(res.json(), credits).toMatchObject({ handled: false });
    }
    expect(await balance()).toBe(before);
  });

  // ── credits: verify guards ───────────────────────────────────────────────

  it("404s a verify for a session belonging to another business, and moves no money", async () => {
    const opened = await post("/api/v3/credits/purchase", {
      credits: 30,
      success_url: "https://app.test/ok",
      cancel_url: "https://app.test/no",
    });
    expect(opened.statusCode).toBe(201);
    const sessionId = opened.json().session_id;

    const before = await balance(otherBizId);
    const res = await post("/api/v3/credits/purchase/verify", { session_id: sessionId }, otherToken);
    expect(res.statusCode).toBe(404);
    expect(await balance(otherBizId)).toBe(before);
  });

  it("reports an unpaid session as unsettled rather than granting on optimism", async () => {
    const opened = await post("/api/v3/credits/purchase", {
      credits: 30,
      success_url: "https://app.test/ok",
      cancel_url: "https://app.test/no",
    });
    const sessionId = opened.json().session_id;
    stub.__patch(sessionId, { payment_status: "unpaid" });

    const before = await balance();
    const res = await post("/api/v3/credits/purchase/verify", { session_id: sessionId });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ settled: false, payment_status: "unpaid", balance: before });
    expect(await balance()).toBe(before);
  });

  it("404s a verify for a paid session that carries no credit quantity", async () => {
    const opened = await post("/api/v3/credits/purchase", {
      credits: 30,
      success_url: "https://app.test/ok",
      cancel_url: "https://app.test/no",
    });
    const sessionId = opened.json().session_id;
    stub.__patch(sessionId, { metadata: { kind: "credit_purchase", business_id: String(bizId) } });

    const before = await balance();
    const res = await post("/api/v3/credits/purchase/verify", { session_id: sessionId });
    expect(res.statusCode).toBe(404);
    expect(await balance()).toBe(before);
  });

  it("404s a credit purchase whose coupon does not exist, before reaching Stripe", async () => {
    const res = await post("/api/v3/credits/purchase", {
      credits: 30,
      coupon_code: `no-such-coupon-${runId}`,
      success_url: "https://app.test/ok",
      cancel_url: "https://app.test/no",
    });
    expect(res.statusCode).toBe(404);
  });

  it("404s a credit purchase whose coupon exists but is deactivated", async () => {
    const code = `cov2-dead-${runId}`;
    await db("coupons").insert({ code, discount_type: "percentage", discount_value: 10, is_active: false });
    const res = await post("/api/v3/credits/purchase", {
      credits: 30,
      coupon_code: code,
      success_url: "https://app.test/ok",
      cancel_url: "https://app.test/no",
    });
    expect(res.statusCode).toBe(404);
  });

  // ── subscription checkout coupon guards ──────────────────────────────────

  it("404s a subscription checkout with an unknown coupon", async () => {
    const res = await post("/api/v3/subscriptions/checkout", {
      plan_code: planCode,
      interval: "month",
      coupon_code: `ghost-${runId}`,
      success_url: "https://app.test/ok",
      cancel_url: "https://app.test/no",
    });
    expect(res.statusCode).toBe(404);
  });

  it("400s a subscription checkout with a coupon restricted to other plans", async () => {
    const code = `cov2-otherplans-${runId}`;
    await db("coupons").insert({
      code,
      discount_type: "percentage",
      discount_value: 25,
      is_active: true,
      applicable_plans: ["some-other-plan"],
    });
    const res = await post("/api/v3/subscriptions/checkout", {
      plan_code: planCode,
      interval: "month",
      coupon_code: code,
      success_url: "https://app.test/ok",
      cancel_url: "https://app.test/no",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/does not apply/i);
  });

  it("accepts a coupon whose plan list is empty as applying to every plan", async () => {
    const code = `cov2-allplans-${runId}`;
    await db("coupons").insert({
      code,
      discount_type: "percentage",
      discount_value: 25,
      is_active: true,
      applicable_plans: [],
    });
    const res = await post("/api/v3/subscriptions/checkout", {
      plan_code: planCode,
      interval: "month",
      coupon_code: code,
      success_url: "https://app.test/ok",
      cancel_url: "https://app.test/no",
    });
    expect(res.statusCode).toBe(201);
  });

  it("fails closed when the requested interval has no Stripe price configured", async () => {
    const code = `cov2-nomonthly-${runId}`;
    await db("subscription_plans").insert({
      code,
      name: "Annual only",
      monthly_price: 0,
      annual_price: 500,
      currency: "AUD",
      stripe_monthly_price_id: null,
      stripe_annual_price_id: `price_annualonly_${runId}`,
      monthly_credit_grant: 0,
    });
    const monthly = await post("/api/v3/subscriptions/checkout", {
      plan_code: code,
      interval: "month",
      success_url: "https://app.test/ok",
      cancel_url: "https://app.test/no",
    });
    // A configuration gap must be a 503, never a checkout against the wrong price.
    expect(monthly.statusCode).toBe(503);
    expect(monthly.json().code).toBe("STRIPE_UNAVAILABLE");

    const annual = await post("/api/v3/subscriptions/checkout", {
      plan_code: code,
      interval: "year",
      success_url: "https://app.test/ok",
      cancel_url: "https://app.test/no",
    });
    expect(annual.statusCode).toBe(201);
  });

  it("404s a subscription checkout for a plan that has been deactivated", async () => {
    const code = `cov2-inactive-${runId}`;
    await db("subscription_plans").insert({
      code,
      name: "Retired",
      monthly_price: 10,
      annual_price: 100,
      currency: "AUD",
      is_active: false,
      stripe_monthly_price_id: `price_retired_${runId}`,
      monthly_credit_grant: 0,
    });
    const res = await post("/api/v3/subscriptions/checkout", {
      plan_code: code,
      interval: "month",
      success_url: "https://app.test/ok",
      cancel_url: "https://app.test/no",
    });
    expect(res.statusCode).toBe(404);
  });

  // ── subscription verify guards ───────────────────────────────────────────

  it("404s a subscription verify for a session belonging to another business", async () => {
    const opened = await post("/api/v3/subscriptions/checkout", {
      plan_code: planCode,
      interval: "month",
      success_url: "https://app.test/ok",
      cancel_url: "https://app.test/no",
    });
    const sessionId = opened.json().session_id;
    const res = await post("/api/v3/subscriptions/checkout/verify", { session_id: sessionId }, otherToken);
    expect(res.statusCode).toBe(404);
  });

  it("reports an incomplete subscription checkout as unsettled", async () => {
    const opened = await post("/api/v3/subscriptions/checkout", {
      plan_code: planCode,
      interval: "month",
      success_url: "https://app.test/ok",
      cancel_url: "https://app.test/no",
    });
    const sessionId = opened.json().session_id;
    stub.__patch(sessionId, { status: "open" });

    const before = await balance();
    const res = await post("/api/v3/subscriptions/checkout/verify", { session_id: sessionId });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ settled: false, status: "open" });
    expect(await balance()).toBe(before);
  });

  it("reports a complete checkout with no subscription attached as unsettled", async () => {
    const opened = await post("/api/v3/subscriptions/checkout", {
      plan_code: planCode,
      interval: "month",
      success_url: "https://app.test/ok",
      cancel_url: "https://app.test/no",
    });
    const sessionId = opened.json().session_id;
    // status complete, but the stub leaves `subscription` null.
    const res = await post("/api/v3/subscriptions/checkout/verify", { session_id: sessionId });
    expect(res.statusCode).toBe(200);
    expect(res.json().settled).toBe(false);
  });

  // ── access gate limit shapes ─────────────────────────────────────────────

  it("returns the numeric limit, the string limit, and null for a boolean feature", async () => {
    // Put the primary business back on a live subscription first.
    await postWebhook(
      subscriptionEvent(uid("evt_sub_relive"), {
        type: "customer.subscription.updated",
        subscriptionId: uid("sub_created"),
        periodStart: NOW + 240 * 86_400,
        periodEnd: NOW + 270 * 86_400,
      }),
    );

    const boolean = await get("/api/v3/subscriptions/access/has_ai_tools");
    expect(boolean.statusCode).toBe(200);
    expect(boolean.json().limit).toBeNull();

    const numeric = await get("/api/v3/subscriptions/access/seats");
    expect(numeric.statusCode).toBe(200);
    expect(numeric.json().limit).toBe(3);

    const text = await get("/api/v3/subscriptions/access/tier_name");
    expect(text.statusCode).toBe(200);
    expect(text.json().limit).toBe("gold");

    // A zero cap is not "unlimited" — it is 403.
    expect((await get("/api/v3/subscriptions/access/max_ads")).statusCode).toBe(403);
  });

  it("404s the access gate when the subscribed plan has been deleted underneath it", async () => {
    const row = await subscriptionRow();
    const [orphanPlan] = await db("subscription_plans")
      .insert({
        code: `cov2-orphan-${runId}`,
        name: "Orphan",
        monthly_price: 1,
        annual_price: 10,
        currency: "AUD",
        monthly_credit_grant: 0,
      })
      .returning(["id"]);
    await db("business_subscriptions").where({ id: row.id }).update({ plan_id: orphanPlan.id });
    // Soft delete, which is what DELETE /admin/billing/plans/:id actually does —
    // and it has no guard against deleting a plan that still has subscribers.
    await db("subscription_plans").where({ id: orphanPlan.id }).update({ deleted_at: new Date() });
    try {
      const res = await get("/api/v3/subscriptions/access/has_ai_tools");
      expect(res.statusCode).toBe(404);
      // /current tolerates it, because a dashboard must still render.
      const current = await get("/api/v3/subscriptions/current");
      expect(current.statusCode).toBe(200);
      expect(current.json().plan).toBeNull();
    } finally {
      await db("business_subscriptions").where({ id: row.id }).update({ plan_id: planId });
    }
  });

  // ── credits: reads and bucket accounting ─────────────────────────────────

  it("reports an empty ledger for a business that has never transacted", async () => {
    const [fresh] = await db("businesses")
      .insert({
        owner_id: userId,
        subdomain: `cov2-fresh-${runId}`,
        business_name: `Cov2 Fresh ${runId}`,
        account_status: 1,
        status: "active",
      })
      .returning(["id", "schema_name"]);
    const jwt = (await import("jsonwebtoken")).default;
    const freshToken = jwt.sign(
      { sub: String(userId), email: "cov2@vitest.local", type: "platform_user", orgId: fresh.schema_name },
      config.JWT_SECRET as string,
    );

    const wallet = await db("credit_wallets").where({ business_id: fresh.id }).first();
    expect(wallet).toBeUndefined();

    const ledger = await get("/api/v3/credits/transactions?page=1&limit=10", freshToken);
    expect(ledger.statusCode).toBe(200);
    expect(ledger.json()).toMatchObject({ data: [], meta: { page: 1, limit: 10, total: 0 } });

    // Reading the ledger must not provision a wallet as a side effect.
    expect(await db("credit_wallets").where({ business_id: fresh.id }).first()).toBeUndefined();

    const balanceRes = await get("/api/v3/credits/balance", freshToken);
    expect(balanceRes.statusCode).toBe(200);
    expect(balanceRes.json()).toMatchObject({ balance: 0, subscription_balance: 0, purchased_balance: 0 });

    // A spend against an empty wallet is a clean 402 quoting the real balance.
    const spend = await app.inject({
      method: "POST",
      url: "/api/v3/credits/spend",
      headers: auth(freshToken),
      payload: { amount: 5 },
    });
    expect(spend.statusCode).toBe(402);
    expect(spend.json().code).toBe("INSUFFICIENT_CREDITS");
  });

  it("drains the subscription bucket before the purchased one and records the split", async () => {
    const wallet = await db("credit_wallets").where({ business_id: bizId }).first();
    // Level the wallet: 100 subscription, 60 purchased.
    await db("credit_wallets")
      .where({ id: wallet.id })
      .update({ subscription_balance: 100, purchased_balance: 60, balance: 160 });

    const res = await post("/api/v3/credits/spend", {
      amount: 130,
      transaction_type: "ai_deduct",
      reference_type: "cov2-split",
      reference_id: "bucket-split",
    });
    expect(res.statusCode).toBe(200);

    const after = await db("credit_wallets").where({ id: wallet.id }).first();
    expect(after.subscription_balance).toBe(0);
    expect(after.purchased_balance).toBe(30);
    expect(after.balance).toBe(30);

    const ledgerRow = await db("credit_transactions")
      .where({ wallet_id: wallet.id, reference_id: "bucket-split" })
      .first();
    expect(ledgerRow.amount).toBe(-130);
    // The split is what makes revenue attribution possible: 100 from the grant,
    // 30 from money the business actually paid.
    expect(ledgerRow.subscription_amount).toBe(-100);
    expect(ledgerRow.purchased_amount).toBe(-30);
  });

  it("records a purchased-only spend with no subscription component", async () => {
    const wallet = await db("credit_wallets").where({ business_id: bizId }).first();
    await db("credit_wallets")
      .where({ id: wallet.id })
      .update({ subscription_balance: 0, purchased_balance: 50, balance: 50 });

    const res = await post("/api/v3/credits/spend", {
      amount: 20,
      transaction_type: "enquiry_unlock",
      reference_type: "cov2-split",
      reference_id: "purchased-only",
    });
    expect(res.statusCode).toBe(200);

    const ledgerRow = await db("credit_transactions")
      .where({ wallet_id: wallet.id, reference_id: "purchased-only" })
      .first();
    expect(ledgerRow.subscription_amount).toBeNull();
    expect(ledgerRow.purchased_amount).toBe(-20);
  });

  it("treats a repeated spend idempotency key as the same spend, not a second debit", async () => {
    const wallet = await db("credit_wallets").where({ business_id: bizId }).first();
    await db("credit_wallets")
      .where({ id: wallet.id })
      .update({ subscription_balance: 0, purchased_balance: 100, balance: 100 });

    const body = {
      amount: 25,
      transaction_type: "ai_deduct",
      idempotency_key: `cov2-spend-once-${runId}`,
      reference_type: "cov2-split",
      reference_id: "idempotent",
    };
    const first = await post("/api/v3/credits/spend", body);
    expect(first.statusCode).toBe(200);
    expect(first.json().duplicate).toBe(false);
    expect(first.json().balance).toBe(75);

    const second = await post("/api/v3/credits/spend", body);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({ duplicate: true, balance: 75 });

    expect((await db("credit_wallets").where({ id: wallet.id }).first()).balance).toBe(75);
    const rows = await db("credit_transactions").where({ idempotency_key: body.idempotency_key });
    expect(rows).toHaveLength(1);
  });
});
