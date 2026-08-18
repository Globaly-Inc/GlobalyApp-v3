// Wave COV-2: the paid-ticket guards events.test.ts left uncovered.
//
// events.test.ts pins the happy path, the oversell race, webhook signature
// rejection and webhook replay idempotency. What it never reached is the refusal
// side: capacity, per-order caps, buyer-initiated verify, and the webhook's
// "not one of ours" filter. Those are the branches where a bug either oversells
// a room or confirms a ticket nobody paid for, so every test asserts the
// registration row, not just the status code.

import Fastify, { type FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dbAvailable, uniqueEmail } from "../helpers/db.js";

const describeDb = describe.skipIf(!dbAvailable);

const WEBHOOK_SECRET = "whsec_cov2_event_payments";

function makeStripeStub(runId: string) {
  const sessions = new Map<string, Record<string, unknown>>();
  let counter = 0;
  return {
    /** Set to make the next createCheckoutSession return a session with no url. */
    urllessNext: false,
    async createCheckoutSession(params: { unitAmount: number | null; quantity: number; currency: string; metadata: unknown }) {
      counter += 1;
      const id = `cs_evp_${runId}_${counter}`;
      const session = {
        id,
        url: this.urllessNext ? null : `https://stripe.test/checkout/${id}`,
        status: "complete",
        payment_status: "paid",
        amount_total: (params.unitAmount ?? 0) * params.quantity,
        currency: params.currency,
        metadata: params.metadata,
      };
      this.urllessNext = false;
      sessions.set(id, session);
      return session;
    },
    async retrieveCheckoutSession(id: string) {
      const session = sessions.get(id);
      if (!session) throw new Error(`unknown session ${id}`);
      return session;
    },
    async retrieveSubscription() {
      throw new Error("not used");
    },
    async createBillingPortalSession() {
      return { url: "https://stripe.test/portal" };
    },
    __patch(id: string, patch: Record<string, unknown>) {
      sessions.set(id, { ...sessions.get(id), ...patch });
    },
  };
}

describeDb("event ticket payments", () => {
  let app: FastifyInstance;
  let db: Knex;
  let shutdownPools: () => Promise<void>;
  let config: Record<string, unknown>;
  let stripe: typeof import("../../src/modules/billing/services/stripe.client.js");
  let signature: typeof import("../../src/modules/billing/services/stripe.signature.js");

  let stub: ReturnType<typeof makeStripeStub>;
  let runId = "";
  let hostToken = "";
  const buyers: Array<{ id: number; token: string }> = [];
  /** A user row with no email at all — the "No email on account" guard. */
  let emaillessToken = "";

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
    const { authPlugin } = await import("../../src/core/plugins/auth.plugin.js");
    const { tenantPlugin } = await import("../../src/core/plugins/tenant.plugin.js");
    const eventsModule = (await import("../../src/modules/events/index.js")).default;
    const { publicEventsModule } = await import("../../src/modules/events/index.js");

    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    await app.register(requestContextPlugin);
    await app.register(async (protectedApp) => {
      await protectedApp.register(authPlugin);
      await protectedApp.register(tenantPlugin);
      await protectedApp.register(eventsModule);
    });
    await app.register(publicEventsModule);
    await app.ready();

    runId = `${process.pid}${Date.now() % 1_000_000}`;
    stub = makeStripeStub(runId);
    stripe.setStripeClient(stub as never);

    const sign = (claims: Record<string, unknown>) =>
      jwt.sign({ email: "evp@vitest.local", ...claims }, config.JWT_SECRET as string);

    const newUser = async (label: string, email: string | null = null) => {
      const [row] = await db("platform_users")
        .insert({
          first_name: "Evp",
          last_name: label,
          email: email ?? uniqueEmail(`evp.${label}`),
          account_status: 1,
        })
        .returning(["id"]);
      return row.id as number;
    };

    const hostUser = await newUser("host");
    const [biz] = await db("businesses")
      .insert({
        owner_id: hostUser,
        subdomain: `evp-${runId}`,
        business_name: `Evp Host ${runId}`,
        account_status: 1,
        status: "active",
      })
      .returning(["id", "schema_name"]);
    hostToken = sign({ sub: String(hostUser), type: "platform_user", orgId: biz.schema_name });

    for (let i = 0; i < 6; i++) {
      const id = await newUser(`buyer${i}`);
      buyers.push({ id, token: sign({ sub: String(id), type: "platform_user" }) });
    }

    // `email` is NOT NULL on platform_users, so the only way to reach the
    // "No email on account" guard is a row whose email is blank — and blank is
    // subject to the same unique index, so at most one such row can exist.
    // Re-use it across runs rather than colliding with our own leftovers.
    const blank = await db("platform_users").where({ email: "" }).first();
    const emaillessId = blank?.id ?? (await newUser("noemail", ""));
    emaillessToken = sign({ sub: String(emaillessId), type: "platform_user" });
  });

  afterAll(async () => {
    stripe?.setStripeClient(null);
    if (config) delete config.STRIPE_WEBHOOK_SECRET;
    await app?.close();
    await shutdownPools?.();
    await db?.destroy();
  });

  // ── helpers ───────────────────────────────────────────────────────────────

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const post = (url: string, token: string, payload?: unknown) =>
    app.inject({ method: "POST", url, headers: auth(token), payload: (payload ?? {}) as object });

  const soon = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

  async function createEvent(overrides: Record<string, unknown> = {}) {
    const res = await post("/api/v3/business/events", hostToken, {
      title: `Evp Event ${runId} ${Math.random().toString(36).slice(2, 8)}`,
      event_type: "online",
      status: "published",
      starts_at: soon(24),
      ends_at: soon(26),
      ...overrides,
    });
    expect(res.statusCode, res.body).toBe(201);
    return res.json();
  }

  async function createTicket(eventId: number, overrides: Record<string, unknown> = {}) {
    const res = await post(`/api/v3/business/events/${eventId}/tickets`, hostToken, {
      name: "General",
      price: 20,
      ...overrides,
    });
    expect(res.statusCode, res.body).toBe(201);
    return res.json();
  }

  const checkout = (eventId: number, token: string, payload: Record<string, unknown>) =>
    post(`/api/v3/events/${eventId}/payment/checkout`, token, payload);

  const verify = (token: string, sessionId: string) =>
    post("/api/v3/events/payment/verify", token, { session_id: sessionId });

  function sendWebhook(event: unknown, opts: { rawBody?: string; secret?: string } = {}) {
    const body = opts.rawBody ?? JSON.stringify(event);
    return app.inject({
      method: "POST",
      url: "/api/v3/events/payment/webhook",
      headers: {
        "content-type": "application/json",
        "stripe-signature": signature.buildSignatureHeader(body, opts.secret ?? WEBHOOK_SECRET),
      },
      payload: body,
    });
  }

  const checkoutCompleted = (sessionId: string | number | null, over: Record<string, unknown> = {}) => ({
    id: `evt_evp_${runId}_${Math.random().toString(36).slice(2, 8)}`,
    type: "checkout.session.completed",
    data: {
      object: { id: sessionId, object: "checkout_session", payment_status: "paid", ...over },
    },
  });

  const registrationOf = (sessionId: string) =>
    db("event_registrations").where({ stripe_session_id: sessionId }).first();
  const ticketRow = (id: number) => db("event_tickets").where({ id }).first();

  // ── checkout refusals ─────────────────────────────────────────────────────

  it("refuses more of a ticket than its per-order cap, and holds no seat", async () => {
    const event = await createEvent();
    const ticket = await createTicket(event.id, { price: 20, quantity: 50, max_per_order: 3 });

    const res = await checkout(event.id, buyers[0].token, { ticket_id: ticket.id, quantity: 4 });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/at most 3/i);
    expect((await ticketRow(ticket.id)).claimed_count).toBe(0);

    // Exactly the cap is allowed — the boundary is inclusive.
    const ok = await checkout(event.id, buyers[0].token, { ticket_id: ticket.id, quantity: 3 });
    expect(ok.statusCode).toBe(200);
    expect((await ticketRow(ticket.id)).claimed_count).toBe(3);
  });

  it("refuses a buyer with no email on the account before anything is claimed", async () => {
    const event = await createEvent();
    const ticket = await createTicket(event.id, { price: 20, quantity: 5 });

    const res = await checkout(event.id, emaillessToken, { ticket_id: ticket.id, quantity: 1 });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/no email/i);
    expect((await ticketRow(ticket.id)).claimed_count).toBe(0);
  });

  it("refuses a second checkout from a buyer who already holds a registration", async () => {
    const event = await createEvent();
    const ticket = await createTicket(event.id, { price: 20, quantity: 10 });

    const first = await checkout(event.id, buyers[1].token, { ticket_id: ticket.id, quantity: 1 });
    expect(first.statusCode).toBe(200);
    expect((await ticketRow(ticket.id)).claimed_count).toBe(1);

    const second = await checkout(event.id, buyers[1].token, { ticket_id: ticket.id, quantity: 1 });
    expect(second.statusCode).toBe(409);
    // The refusal claimed nothing extra — a leaked seat here is a slow oversell.
    expect((await ticketRow(ticket.id)).claimed_count).toBe(1);
  });

  it("refuses a checkout beyond the ticket's own allocation", async () => {
    const event = await createEvent();
    const ticket = await createTicket(event.id, { price: 20, quantity: 2 });

    expect((await checkout(event.id, buyers[2].token, { ticket_id: ticket.id, quantity: 2 })).statusCode).toBe(200);
    const soldOut = await checkout(event.id, buyers[3].token, { ticket_id: ticket.id, quantity: 1 });
    expect(soldOut.statusCode).toBe(409);
    expect(soldOut.json().error).toMatch(/sold out/i);
    expect((await ticketRow(ticket.id)).claimed_count).toBe(2);
  });

  it("refuses a checkout beyond the event's overall capacity even when the ticket has stock", async () => {
    // Capacity 2 across the whole event, but 100 of this ticket exist. The
    // event-level lock is the only thing stopping a third seat.
    const event = await createEvent({ max_capacity: 2 });
    const ticket = await createTicket(event.id, { price: 20, quantity: 100 });

    expect((await checkout(event.id, buyers[4].token, { ticket_id: ticket.id, quantity: 2 })).statusCode).toBe(200);

    const full = await checkout(event.id, buyers[5].token, { ticket_id: ticket.id, quantity: 1 });
    expect(full.statusCode).toBe(409);
    expect(full.json().error).toMatch(/full/i);
    // The ticket still has stock, so only the capacity check can have refused it.
    expect((await ticketRow(ticket.id)).claimed_count).toBe(2);
  });

  it("rolls the seat back when Stripe returns a session with no url", async () => {
    const event = await createEvent();
    const ticket = await createTicket(event.id, { price: 20, quantity: 5 });

    stub.urllessNext = true;
    const res = await checkout(event.id, buyers[0].token, { ticket_id: ticket.id, quantity: 1 });
    expect(res.statusCode).toBe(400);
    // An unusable session must not leave a phantom hold behind.
    expect((await ticketRow(ticket.id)).claimed_count).toBe(0);
    expect(await db("event_registrations").where({ event_id: event.id })).toHaveLength(0);
  });

  // ── buyer-initiated verify ────────────────────────────────────────────────

  it("404s a verify for a session that belongs to no registration", async () => {
    const res = await verify(buyers[0].token, `cs_never_existed_${runId}`);
    expect(res.statusCode).toBe(404);
  });

  it("403s a verify from someone other than the buyer, and leaves it pending", async () => {
    const event = await createEvent();
    const ticket = await createTicket(event.id, { price: 20, quantity: 5 });
    const opened = await checkout(event.id, buyers[1].token, { ticket_id: ticket.id, quantity: 1 });
    const sessionId = opened.json().session_id;

    const res = await verify(buyers[2].token, sessionId);
    expect(res.statusCode).toBe(403);
    // The imposter's call must not settle the real buyer's ticket either.
    expect((await registrationOf(sessionId)).payment_status).toBe("pending");
  });

  it("settles the buyer's own verify, then reports a repeat as already verified", async () => {
    const event = await createEvent();
    const ticket = await createTicket(event.id, { price: 20, quantity: 5 });
    const opened = await checkout(event.id, buyers[3].token, { ticket_id: ticket.id, quantity: 1 });
    const sessionId = opened.json().session_id;

    const first = await verify(buyers[3].token, sessionId);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ success: true, already_verified: false });
    const settled = await registrationOf(sessionId);
    expect(settled.payment_status).toBe("paid");
    // Settlement clears the hold — the reaper must not claw a paid seat back.
    expect(settled.hold_expires_at).toBeNull();

    const again = await verify(buyers[3].token, sessionId);
    expect(again.statusCode).toBe(200);
    // already_verified:true is what stops the confirmation notification being
    // published a second time — it is the only observable signal of that here,
    // because the fan-out is queued to LavinMQ (inert in tests), not written
    // inline.
    expect(again.json()).toMatchObject({ success: true, already_verified: true });
  });

  it("refuses to settle a verify Stripe has not marked paid", async () => {
    const event = await createEvent();
    const ticket = await createTicket(event.id, { price: 20, quantity: 5 });
    const opened = await checkout(event.id, buyers[4].token, { ticket_id: ticket.id, quantity: 1 });
    const sessionId = opened.json().session_id;
    stub.__patch(sessionId, { payment_status: "unpaid" });

    const res = await verify(buyers[4].token, sessionId);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/not completed/i);
    // This is the assertion that matters: an unpaid ticket stays unpaid.
    expect((await registrationOf(sessionId)).payment_status).toBe("pending");
  });

  // ── webhook filtering ─────────────────────────────────────────────────────

  it("returns 503 rather than trusting a webhook when no signing secret is configured", async () => {
    const saved = config.STRIPE_WEBHOOK_SECRET;
    delete config.STRIPE_WEBHOOK_SECRET;
    try {
      const res = await sendWebhook(checkoutCompleted(`cs_noconf_${runId}`), { secret: saved as string });
      expect(res.statusCode).toBe(503);
    } finally {
      config.STRIPE_WEBHOOK_SECRET = saved;
    }
  });

  it("rejects a webhook with no signature header at all", async () => {
    const body = JSON.stringify(checkoutCompleted(`cs_nosig_${runId}`));
    const res = await app.inject({
      method: "POST",
      url: "/api/v3/events/payment/webhook",
      headers: { "content-type": "application/json" },
      payload: body,
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a tampered body, and does not settle the session it names", async () => {
    const event = await createEvent();
    const ticket = await createTicket(event.id, { price: 20, quantity: 5 });
    const opened = await checkout(event.id, buyers[5].token, { ticket_id: ticket.id, quantity: 1 });
    const sessionId = opened.json().session_id;

    const honest = JSON.stringify(checkoutCompleted(sessionId));
    const header = signature.buildSignatureHeader(honest, WEBHOOK_SECRET);
    const res = await app.inject({
      method: "POST",
      url: "/api/v3/events/payment/webhook",
      headers: { "content-type": "application/json", "stripe-signature": header },
      payload: honest.replace(/}$/, ',"injected":true}'),
    });
    expect(res.statusCode).toBe(400);
    expect((await registrationOf(sessionId)).payment_status).toBe("pending");
  });

  it("acknowledges an event type this module does not own without settling it", async () => {
    const event = await createEvent();
    const ticket = await createTicket(event.id, { price: 20, quantity: 5 });
    const opened = await checkout(event.id, buyers[0].token, { ticket_id: ticket.id, quantity: 1 });
    const sessionId = opened.json().session_id;

    const res = await sendWebhook({
      ...checkoutCompleted(sessionId),
      type: "customer.subscription.updated",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      received: true,
      handled: false,
      duplicate: false,
      event_type: "customer.subscription.updated",
    });
    expect((await registrationOf(sessionId)).payment_status).toBe("pending");
  });

  it("settles an async payment success, because that is a real ticket sale", async () => {
    const event = await createEvent();
    const ticket = await createTicket(event.id, { price: 20, quantity: 5 });
    const opened = await checkout(event.id, buyers[1].token, { ticket_id: ticket.id, quantity: 1 });
    const sessionId = opened.json().session_id;

    const res = await sendWebhook({
      ...checkoutCompleted(sessionId),
      type: "checkout.session.async_payment_succeeded",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ handled: true, duplicate: false });
    expect((await registrationOf(sessionId)).payment_status).toBe("paid");
  });

  it("refuses to confirm a ticket from a session Stripe has not marked paid", async () => {
    const event = await createEvent();
    const ticket = await createTicket(event.id, { price: 20, quantity: 5 });
    const opened = await checkout(event.id, buyers[2].token, { ticket_id: ticket.id, quantity: 1 });
    const sessionId = opened.json().session_id;

    const res = await sendWebhook(checkoutCompleted(sessionId, { payment_status: "unpaid" }));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ handled: false });
    // The whole point: an unpaid webhook must never confirm a ticket.
    expect((await registrationOf(sessionId)).payment_status).toBe("pending");
  });

  it("acknowledges a paid session that is not one of ours", async () => {
    // A billing credit-purchase checkout hits the same Stripe endpoint config.
    const res = await sendWebhook(checkoutCompleted(`cs_billing_not_ours_${runId}`));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ received: true, handled: false, duplicate: false });
  });

  it("acknowledges a paid session whose id is not even a string", async () => {
    for (const id of [12345, null]) {
      const res = await sendWebhook(checkoutCompleted(id));
      expect(res.statusCode, String(id)).toBe(200);
      expect(res.json(), String(id)).toMatchObject({ handled: false });
    }
  });

  it("reports a redelivery as a duplicate and leaves the ticket count untouched", async () => {
    const event = await createEvent();
    const ticket = await createTicket(event.id, { price: 20, quantity: 5 });
    const opened = await checkout(event.id, buyers[3].token, { ticket_id: ticket.id, quantity: 2 });
    const sessionId = opened.json().session_id;
    const claimed = (await ticketRow(ticket.id)).claimed_count;

    const first = await sendWebhook(checkoutCompleted(sessionId));
    expect(first.json()).toMatchObject({ handled: true, duplicate: false });

    // A distinct event id — so only settlePayment's conditional UPDATE can be
    // what makes the second delivery a no-op.
    const replay = await sendWebhook(checkoutCompleted(sessionId));
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toMatchObject({ handled: true, duplicate: true });

    expect((await ticketRow(ticket.id)).claimed_count).toBe(claimed);
    const paid = await db("event_registrations").where({ event_id: event.id, payment_status: "paid" });
    expect(paid).toHaveLength(1);
  });

  it("still confirms the buyer when the event row has vanished under the settlement", async () => {
    // settle() interpolates the event title into the confirmation. A deleted event
    // must fall back to generic wording, not throw — a crash here would leave a
    // paid ticket the buyer is never told about, and Stripe retrying forever.
    const event = await createEvent();
    const ticket = await createTicket(event.id, { price: 20, quantity: 5 });
    const opened = await checkout(event.id, buyers[4].token, { ticket_id: ticket.id, quantity: 1 });
    const sessionId = opened.json().session_id;

    await db("events").where({ id: event.id }).update({ deleted_at: new Date() });

    const res = await sendWebhook(checkoutCompleted(sessionId));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ handled: true, duplicate: false });
    expect((await registrationOf(sessionId)).payment_status).toBe("paid");
  });
});
