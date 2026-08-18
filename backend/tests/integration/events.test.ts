// Events, ticketing, registrations and paid checkout.
//
// Runs entirely offline. The only outbound dependency is billing's StripeClient
// interface, stubbed here; the fail-closed path is proven by clearing the stub
// and asserting 503 *and* that the seat hold was rolled back — a 503 that leaked
// a seat would be a silent oversell waiting to happen.

import Fastify, { type FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dbAvailable, uniqueEmail } from "../helpers/db.js";

const describeDb = describe.skipIf(!dbAvailable);

type StripeModule = typeof import("../../src/modules/billing/services/stripe.client.js");
type StripeClient = ReturnType<StripeModule["getStripeClient"]>;

/** Minimal Checkout stub. Session ids are unique per run — the real Stripe never reissues one. */
function makeStripeStub(runId: string) {
  const sessions = new Map<string, Record<string, unknown>>();
  let counter = 0;
  const client = {
    async createCheckoutSession(params: any) {
      counter += 1;
      const id = `cs_test_${runId}_${counter}`;
      const session = {
        id,
        url: `https://stripe.test/checkout/${id}`,
        status: "complete",
        payment_status: "paid",
        amount_total: (params.unitAmount ?? 0) * params.quantity,
        currency: params.currency,
        customer: null,
        subscription: null,
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
    async retrieveSubscription() {
      throw new Error("not used");
    },
    async createBillingPortalSession() {
      return { url: "https://stripe.test/portal" };
    },
  };
  return client as unknown as StripeClient;
}

describeDb("events", () => {
  let app: FastifyInstance;
  let masterKnex: Knex;
  let shutdownPools: () => Promise<void>;
  let config: Record<string, any>;
  let stripe: StripeModule;
  let signature: typeof import("../../src/modules/billing/services/stripe.signature.js");

  let runId = "";
  let hostUser = 0;
  let bizA = 0;
  let bizB = 0;
  let tokenA = "";
  let tokenB = "";
  let adminToken = "";
  let attendee = 0;
  let attendeeToken = "";
  /** Ten separate identities for the concurrency test. */
  const racers: Array<{ id: number; token: string }> = [];

  const WEBHOOK_SECRET = "whsec_events_test";

  beforeAll(async () => {
    const jwt = (await import("jsonwebtoken")).default;
    ({ masterKnex } = await import("../../src/core/db/master-pool.js"));
    ({ shutdownAll: shutdownPools } = await import("../../src/core/db/pool-manager.js"));
    ({ config } = (await import("../../src/config.js")) as unknown as {
      config: Record<string, any>;
    });
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

    const newUser = async (label: string) => {
      const [row] = await masterKnex("platform_users")
        .insert({ first_name: "Ev", last_name: label, email: uniqueEmail(`events.${label}`), account_status: 1 })
        .returning(["id"]);
      return row.id as number;
    };

    hostUser = await newUser("host");
    attendee = await newUser("attendee");

    const newBusiness = async (label: string) => {
      const [row] = await masterKnex("businesses")
        .insert({
          owner_id: hostUser,
          subdomain: `events-${label}-${runId}`,
          business_name: `Events ${label} ${runId}`,
          account_status: 1,
          status: "active",
        })
        .returning(["id", "schema_name"]);
      return row;
    };

    const a = await newBusiness("a");
    const b = await newBusiness("b");
    bizA = a.id;
    bizB = b.id;

    const sign = (claims: Record<string, unknown>) =>
      jwt.sign({ email: "events@vitest.local", ...claims }, config.JWT_SECRET as string);

    tokenA = sign({ sub: String(hostUser), type: "platform_user", orgId: a.schema_name });
    tokenB = sign({ sub: String(hostUser), type: "platform_user", orgId: b.schema_name });
    adminToken = sign({ sub: "1", type: "admin", role: "super_admin" });
    attendeeToken = sign({ sub: String(attendee), type: "platform_user" });

    for (let i = 0; i < 10; i++) {
      const id = await newUser(`racer${i}`);
      racers.push({ id, token: sign({ sub: String(id), type: "platform_user" }) });
    }

    stripe.setStripeClient(makeStripeStub(runId));
  });

  afterAll(async () => {
    stripe?.setStripeClient(null);
    if (config) delete config.STRIPE_WEBHOOK_SECRET;
    await app?.close();
    await shutdownPools?.();
    await masterKnex?.destroy();
  });

  // ── helpers ─────────────────────────────────────────────────────────────

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const get = (url: string, token?: string) =>
    app.inject({ method: "GET", url, headers: token ? auth(token) : {} });
  const post = (url: string, token: string, payload?: unknown) =>
    app.inject({ method: "POST", url, headers: auth(token), payload: (payload ?? {}) as object });
  const patch = (url: string, token: string, payload: unknown) =>
    app.inject({ method: "PATCH", url, headers: auth(token), payload: payload as object });
  const del = (url: string, token: string) => app.inject({ method: "DELETE", url, headers: auth(token) });

  const soon = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

  async function createEvent(token: string, overrides: Record<string, unknown> = {}) {
    const res = await post("/api/v3/business/events", token, {
      title: `Event ${runId} ${Math.random().toString(36).slice(2, 8)}`,
      event_type: "online",
      status: "published",
      starts_at: soon(24),
      ends_at: soon(26),
      ...overrides,
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  async function createTicket(token: string, eventId: number, overrides: Record<string, unknown> = {}) {
    const res = await post(`/api/v3/business/events/${eventId}/tickets`, token, {
      name: "General",
      price: 0,
      ...overrides,
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  const ticketRow = (id: number) => masterKnex("event_tickets").where({ id }).first();

  // ── schema + placement ──────────────────────────────────────────────────

  it("puts events in the master schema with a polymorphic host reference", async () => {
    const columns = await masterKnex("information_schema.columns")
      .where({ table_schema: "public", table_name: "events" })
      .pluck("column_name");
    expect(columns).toEqual(expect.arrayContaining(["host_org_type", "host_org_id", "v1_id", "deleted_at"]));
  });

  // Regression: the row type omitted six columns the create schema accepts and the
  // table stores, so serializeEvent silently dropped them. A host who opened the edit
  // form and saved without retyping them blanked their own data.
  it("returns every field the create schema accepts, so an edit cannot blank them", async () => {
    const written = {
      venue_address: "12 Test Street",
      online_platform: "Zoom",
      timezone: "Australia/Sydney",
      tags: ["intake", "webinar"],
      contact_email: "host@example.test",
      contact_phone: "+61 400 000 000",
    };
    const event = await createEvent(tokenA, written);
    const read = await get(`/api/v3/business/events/${event.id}`, tokenA);
    expect(read.statusCode).toBe(200);
    for (const [field, value] of Object.entries(written)) {
      expect({ field, value: read.json()[field] }).toEqual({ field, value });
    }
  });

  it("refuses to let any path oversell, at the database level", async () => {
    const event = await createEvent(tokenA);
    const ticket = await createTicket(tokenA, event.id, { quantity: 2 });
    await expect(
      masterKnex("event_tickets").where({ id: ticket.id }).update({ claimed_count: 3 }),
    ).rejects.toThrow(/event_tickets_no_oversell_check/);
  });

  // ── the oversell race ───────────────────────────────────────────────────

  it("cannot oversell a ticket under genuinely concurrent registration", async () => {
    const event = await createEvent(tokenA);
    // max_capacity stays null on purpose: no event lock is taken, so the only
    // thing standing between 10 racers and an oversell is the conditional UPDATE.
    const ticket = await createTicket(tokenA, event.id, { quantity: 3, name: "Limited" });

    const responses = await Promise.all(
      racers.map((r) =>
        post(`/api/v3/events/${event.id}/registrations`, r.token, { ticket_id: ticket.id, quantity: 1 }),
      ),
    );

    const created = responses.filter((r) => r.statusCode === 201);
    const rejected = responses.filter((r) => r.statusCode === 409);
    expect(created).toHaveLength(3);
    expect(rejected).toHaveLength(7);

    // The ledger, not the responses, is the thing that matters.
    const row = await ticketRow(ticket.id);
    expect(row.claimed_count).toBe(3);

    const [{ seats }] = await masterKnex("event_registrations")
      .where({ event_id: event.id })
      .whereNot("status", "cancelled")
      .select(masterKnex.raw("coalesce(sum(quantity), 0)::int as seats"));
    expect(seats).toBe(3);
  });

  it("returns seats to the ledger when a registration is cancelled", async () => {
    const event = await createEvent(tokenA);
    const ticket = await createTicket(tokenA, event.id, { quantity: 1 });

    const created = await post(`/api/v3/events/${event.id}/registrations`, attendeeToken, {
      ticket_id: ticket.id,
    });
    expect(created.statusCode).toBe(201);
    expect((await ticketRow(ticket.id)).claimed_count).toBe(1);

    const cancelled = await del(`/api/v3/events/me/registrations/${created.json().id}`, attendeeToken);
    expect(cancelled.statusCode).toBe(204);
    expect((await ticketRow(ticket.id)).claimed_count).toBe(0);

    // Double cancel must not release the seat twice.
    await del(`/api/v3/events/me/registrations/${created.json().id}`, attendeeToken);
    expect((await ticketRow(ticket.id)).claimed_count).toBe(0);
  });

  it("enforces the event-wide capacity across ticket types", async () => {
    const event = await createEvent(tokenA, { max_capacity: 1 });
    const ticket = await createTicket(tokenA, event.id);

    const first = await post(`/api/v3/events/${event.id}/registrations`, racers[0].token, {
      ticket_id: ticket.id,
    });
    expect(first.statusCode).toBe(201);

    const second = await post(`/api/v3/events/${event.id}/registrations`, racers[1].token, {
      ticket_id: ticket.id,
    });
    expect(second.statusCode).toBe(409);
  });

  it("dedupes a plain RSVP even though ticket_id is null", async () => {
    const event = await createEvent(tokenA);
    const first = await post(`/api/v3/events/${event.id}/registrations`, attendeeToken, {});
    expect(first.statusCode).toBe(201);
    const second = await post(`/api/v3/events/${event.id}/registrations`, attendeeToken, {});
    expect(second.statusCode).toBe(409);
  });

  // ── payments ────────────────────────────────────────────────────────────

  it("rejects a paid ticket on the free registration path", async () => {
    const event = await createEvent(tokenA);
    const ticket = await createTicket(tokenA, event.id, { price: 25 });
    const res = await post(`/api/v3/events/${event.id}/registrations`, attendeeToken, {
      ticket_id: ticket.id,
    });
    expect(res.statusCode).toBe(400);
  });

  it("claims the seat at checkout, before Stripe is ever called", async () => {
    const event = await createEvent(tokenA);
    const ticket = await createTicket(tokenA, event.id, { price: 10, quantity: 5 });

    const res = await post(`/api/v3/events/${event.id}/payment/checkout`, racers[2].token, {
      ticket_id: ticket.id,
      quantity: 2,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().url).toMatch(/^https:\/\/stripe\.test\//);

    // Seats are held while the buyer is still on Stripe's page — this is the
    // race V1 left open by only counting at settlement.
    expect((await ticketRow(ticket.id)).claimed_count).toBe(2);
    const registration = await masterKnex("event_registrations")
      .where({ stripe_session_id: res.json().session_id })
      .first();
    expect(registration.payment_status).toBe("pending");
    expect(registration.hold_expires_at).not.toBeNull();
  });

  it("settles a duplicate payment webhook exactly once", async () => {
    const event = await createEvent(tokenA);
    const ticket = await createTicket(tokenA, event.id, { price: 15, quantity: 4 });

    const checkout = await post(`/api/v3/events/${event.id}/payment/checkout`, racers[3].token, {
      ticket_id: ticket.id,
      quantity: 1,
    });
    expect(checkout.statusCode).toBe(200);
    const sessionId = checkout.json().session_id;
    const claimedAfterCheckout = (await ticketRow(ticket.id)).claimed_count;
    expect(claimedAfterCheckout).toBe(1);

    const body = JSON.stringify({
      id: `evt_${runId}_dup`,
      type: "checkout.session.completed",
      data: { object: { id: sessionId, object: "checkout_session", payment_status: "paid" } },
    });
    const send = () =>
      app.inject({
        method: "POST",
        url: "/api/v3/events/payment/webhook",
        headers: {
          "content-type": "application/json",
          "stripe-signature": signature.buildSignatureHeader(body, WEBHOOK_SECRET),
        },
        payload: body,
      });

    const first = await send();
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ handled: true, duplicate: false });

    const second = await send();
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({ duplicate: true });

    // Settlement moves no ledger by design, so a replay cannot double-count.
    expect((await ticketRow(ticket.id)).claimed_count).toBe(claimedAfterCheckout);
    const paid = await masterKnex("event_registrations")
      .where({ event_id: event.id, payment_status: "paid" })
      .select("id");
    expect(paid).toHaveLength(1);
  });

  it("rejects a webhook whose signature does not match the body", async () => {
    const body = JSON.stringify({ id: "evt_x", type: "checkout.session.completed", data: { object: {} } });
    const res = await app.inject({
      method: "POST",
      url: "/api/v3/events/payment/webhook",
      headers: {
        "content-type": "application/json",
        "stripe-signature": signature.buildSignatureHeader(body, "whsec_wrong_secret"),
      },
      payload: body,
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 503 — never a fake success — when Stripe is not configured, and holds no seat", async () => {
    const event = await createEvent(tokenA);
    const ticket = await createTicket(tokenA, event.id, { price: 40, quantity: 2 });

    stripe.setStripeClient(null);
    const previousKey = config.STRIPE_SECRET_KEY;
    delete config.STRIPE_SECRET_KEY;
    try {
      const res = await post(`/api/v3/events/${event.id}/payment/checkout`, racers[4].token, {
        ticket_id: ticket.id,
        quantity: 1,
      });
      expect(res.statusCode).toBe(503);
      expect(res.json().code).toBe("STRIPE_UNAVAILABLE");

      // The auth, validation and DB work all ran; the transaction rolled back.
      expect((await ticketRow(ticket.id)).claimed_count).toBe(0);
      const orphans = await masterKnex("event_registrations").where({ event_id: event.id });
      expect(orphans).toHaveLength(0);
    } finally {
      if (previousKey !== undefined) config.STRIPE_SECRET_KEY = previousKey;
      stripe.setStripeClient(makeStripeStub(`${runId}b`));
    }
  });

  it("validates before it reaches the payment provider", async () => {
    const event = await createEvent(tokenA);
    const ticket = await createTicket(tokenA, event.id, { price: 0 });
    const res = await post(`/api/v3/events/${event.id}/payment/checkout`, attendeeToken, {
      ticket_id: ticket.id,
    });
    expect(res.statusCode).toBe(400);
  });

  // ── cross-tenant isolation ──────────────────────────────────────────────

  it("never lets business B read or mutate business A's event", async () => {
    const event = await createEvent(tokenA);
    const ticket = await createTicket(tokenA, event.id);

    for (const res of await Promise.all([
      get(`/api/v3/business/events/${event.id}`, tokenB),
      get(`/api/v3/business/events/${event.id}/tickets`, tokenB),
      get(`/api/v3/business/events/${event.id}/registrations`, tokenB),
      patch(`/api/v3/business/events/${event.id}`, tokenB, { title: "Hijacked" }),
      del(`/api/v3/business/events/${event.id}`, tokenB),
      patch(`/api/v3/business/events/${event.id}/tickets/${ticket.id}`, tokenB, { price: 0 }),
      del(`/api/v3/business/events/${event.id}/tickets/${ticket.id}`, tokenB),
      post(`/api/v3/business/events/${event.id}/updates`, tokenB, { content: "spoof" }),
    ])) {
      expect(res.statusCode).toBe(404);
    }

    // And A's event is still intact.
    const stillThere = await get(`/api/v3/business/events/${event.id}`, tokenA);
    expect(stillThere.statusCode).toBe(200);
    expect(stillThere.json().title).toBe(event.title);
  });

  it("never lets business B touch a registration on business A's event", async () => {
    const event = await createEvent(tokenA);
    const created = await post(`/api/v3/events/${event.id}/registrations`, racers[5].token, {});
    expect(created.statusCode).toBe(201);

    const hijack = await patch(
      `/api/v3/business/events/registrations/${created.json().id}`,
      tokenB,
      { status: "checked_in" },
    );
    expect(hijack.statusCode).toBe(404);

    const legit = await patch(
      `/api/v3/business/events/registrations/${created.json().id}`,
      tokenA,
      { status: "checked_in" },
    );
    expect(legit.statusCode).toBe(200);
    expect(legit.json().status).toBe("checked_in");
  });

  it("only lists a business's own events", async () => {
    await createEvent(tokenA);
    const listB = await get("/api/v3/business/events", tokenB);
    expect(listB.statusCode).toBe(200);
    for (const row of listB.json().data) expect(row.host.org_id).toBe(bizB);
    expect(bizA).not.toBe(bizB);
  });

  // ── attendee + public surface ───────────────────────────────────────────

  it("hides drafts from the public browse and detail", async () => {
    const draft = await createEvent(tokenA, { status: "draft" });
    const listed = await get("/api/v3/events?limit=100");
    expect(listed.statusCode).toBe(200);
    expect(listed.json().data.map((e: { id: number }) => e.id)).not.toContain(draft.id);
    expect((await get(`/api/v3/events/${draft.id}`)).statusCode).toBe(404);
  });

  it("serves a published event publicly, with its tickets and remaining count", async () => {
    const event = await createEvent(tokenA);
    const ticket = await createTicket(tokenA, event.id, { quantity: 5, name: "Seat" });

    const detail = await get(`/api/v3/events/${event.slug}`);
    expect(detail.statusCode).toBe(200);
    expect(detail.json().id).toBe(event.id);

    const tickets = await get(`/api/v3/events/${event.id}/tickets`);
    expect(tickets.statusCode).toBe(200);
    expect(tickets.json()).toContainEqual(
      expect.objectContaining({ id: ticket.id, remaining: 5, is_free: true }),
    );
  });

  it("lists only the caller's own registrations", async () => {
    const event = await createEvent(tokenA);
    await post(`/api/v3/events/${event.id}/registrations`, racers[6].token, {});

    const mine = await get("/api/v3/events/me/registrations", racers[6].token);
    expect(mine.statusCode).toBe(200);
    expect(mine.json().data.some((r: { event_id: number }) => r.event_id === event.id)).toBe(true);

    const theirs = await get("/api/v3/events/me/registrations", racers[7].token);
    expect(theirs.json().data.some((r: { event_id: number }) => r.event_id === event.id)).toBe(false);
  });

  it("refuses registration once the deadline has passed or the event is cancelled", async () => {
    const past = await createEvent(tokenA, {
      registration_deadline: new Date(Date.now() - 60_000).toISOString(),
    });
    expect((await post(`/api/v3/events/${past.id}/registrations`, attendeeToken, {})).statusCode).toBe(400);

    const event = await createEvent(tokenA);
    await patch(`/api/v3/business/events/${event.id}`, tokenA, { status: "cancelled" });
    expect((await post(`/api/v3/events/${event.id}/registrations`, attendeeToken, {})).statusCode).toBe(400);
  });

  it("will not shrink a ticket below the seats already claimed", async () => {
    const event = await createEvent(tokenA);
    const ticket = await createTicket(tokenA, event.id, { quantity: 5 });
    await post(`/api/v3/events/${event.id}/registrations`, racers[8].token, {
      ticket_id: ticket.id,
      quantity: 2,
    });

    const res = await patch(`/api/v3/business/events/${event.id}/tickets/${ticket.id}`, tokenA, {
      quantity: 1,
    });
    expect(res.statusCode).toBe(400);
    expect((await ticketRow(ticket.id)).claimed_count).toBe(2);
  });

  // ── admin monitoring ────────────────────────────────────────────────────

  it("serves platform-wide stats and a searchable list to admins only", async () => {
    const event = await createEvent(tokenA, { title: `Findable ${runId}` });

    const stats = await get("/api/v3/admin/events/stats", adminToken);
    expect(stats.statusCode).toBe(200);
    expect(stats.json().events.total).toBeGreaterThan(0);

    const found = await get(`/api/v3/admin/events?q=Findable+${runId}`, adminToken);
    expect(found.statusCode).toBe(200);
    expect(found.json().data.map((e: { id: number }) => e.id)).toContain(event.id);

    const detail = await get(`/api/v3/admin/events/${event.id}`, adminToken);
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toHaveProperty("tickets");

    expect((await get("/api/v3/admin/events/stats", attendeeToken)).statusCode).toBe(403);
    expect((await get("/api/v3/admin/events", tokenA)).statusCode).toBe(403);
  });

  it("requires a business context for the host surface", async () => {
    expect((await get("/api/v3/business/events", attendeeToken)).statusCode).toBe(403);
  });
});
