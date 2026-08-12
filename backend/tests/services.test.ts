/**
 * Earn → My Services. Listing management plus the whole post-order lifecycle.
 *
 * Orders are inserted by fixture rather than created through an endpoint: buying happens on the public
 * marketplace, which this phase does not build. Everything downstream of an order existing is covered here.
 */

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  getApp,
  closeApp,
  resetDb,
  createUser,
  createCountryWithCity,
  createListing,
  createOrder,
  readOrder,
  readListing,
  auth,
  masterKnex,
} from "./helpers.js";
import { config } from "../src/config.js";
import { getDriver } from "../src/modules/services/payments/index.js";
import {
  makeDevSessionId,
  __seedRefund,
  __expireIdempotencyKeys,
  __countRefunds,
  __resetRefunds,
} from "../src/modules/services/payments/dev-driver.js";

const BASE = "/api/v3/my-services";

before(async () => {
  await getApp();
});
after(closeApp);
beforeEach(async () => {
  await resetDb();
  __resetRefunds();
});

/** A seller and a buyer, plus a $50 AUD listing owned by the seller. */
async function scenario() {
  const seller = await createUser();
  const buyer = await createUser();
  const listing = await createListing(seller.id);
  return { seller, buyer, listing };
}

/** An order already settled into `paid`, as the payment return would leave it. */
async function paidOrder(overrides: Record<string, unknown> = {}) {
  const s = await scenario();
  const order = await createOrder(s.listing, s.buyer.id, s.seller.id, {
    status: "paid",
    paid_at: new Date(),
    payment_provider: "dev",
    payment_session_id: makeDevSessionId({ amountMinor: s.listing.price_minor, currency: s.listing.currency }),
    payment_intent_id: "pi_dev_fixture",
    ...overrides,
  });
  return { ...s, order };
}

// ── Listings ───────────────────────────────────────────────────────────────

test("a listing is created with a price in minor units and read back", async () => {
  const app = await getApp();
  const seller = await createUser();

  const created = await app.inject({
    method: "POST",
    url: `${BASE}/listings`,
    headers: auth(seller.id, seller.email),
    payload: { title: "City Orientation", category: "city_orientation", price_minor: 5000, currency: "AUD" },
  });
  assert.equal(created.statusCode, 201);
  const listing = created.json();
  // $50.00 stays 5000 minor units end to end — never 50, never 0.5.
  assert.equal(listing.price_minor, 5000);
  assert.equal(listing.currency, "AUD");
  assert.equal(listing.is_active, true);
  assert.equal(listing.avg_rating, 0);
  assert.equal(listing.open_orders_count, 0);

  const listed = await app.inject({ method: "GET", url: `${BASE}/listings`, headers: auth(seller.id, seller.email) });
  assert.equal(listed.json().listings.length, 1);
});

test("a zero, negative or fractional price is refused", async () => {
  const app = await getApp();
  const seller = await createUser();
  const base = { title: "T", category: "other" as const, currency: "AUD" as const };

  for (const price_minor of [0, -100, 12.5]) {
    const res = await app.inject({
      method: "POST",
      url: `${BASE}/listings`,
      headers: auth(seller.id, seller.email),
      payload: { ...base, price_minor },
    });
    assert.equal(res.statusCode, 400, `price ${price_minor} should be rejected`);
  }
  assert.equal(await masterKnex("service_listings").count("id as c").first().then((r) => Number(r!.c)), 0);
});

test("a client cannot set the owner or any derived figure", async () => {
  const app = await getApp();
  const seller = await createUser();
  const other = await createUser();

  for (const forged of [
    { provider_id: other.id },
    { avg_rating: 5 },
    { total_reviews: 99 },
    { total_orders: 42 },
    { id: 1234 },
  ]) {
    const res = await app.inject({
      method: "POST",
      url: `${BASE}/listings`,
      headers: auth(seller.id, seller.email),
      payload: { title: "T", category: "other", price_minor: 1000, ...forged },
    });
    // .strict() — rejected loudly, not silently stripped.
    assert.equal(res.statusCode, 400, `${JSON.stringify(forged)} should be rejected`);
  }
});

test("another user cannot read, edit or delete my listing", async () => {
  const app = await getApp();
  const { seller, listing } = await scenario();
  const stranger = await createUser();
  const h = auth(stranger.id, stranger.email);

  assert.equal((await app.inject({ method: "GET", url: `${BASE}/listings/${listing.id}`, headers: h })).statusCode, 403);
  assert.equal(
    (await app.inject({ method: "PATCH", url: `${BASE}/listings/${listing.id}`, headers: h, payload: { title: "x" } }))
      .statusCode,
    403,
  );
  assert.equal((await app.inject({ method: "DELETE", url: `${BASE}/listings/${listing.id}`, headers: h })).statusCode, 403);

  // The stranger's own list is empty and the owner's listing is untouched.
  const mine = await app.inject({ method: "GET", url: `${BASE}/listings`, headers: h });
  assert.equal(mine.json().listings.length, 0);
  assert.equal((await readListing(listing.id)).provider_id, seller.id);
});

test("pausing hides nothing from the owner, and resuming restores it", async () => {
  const app = await getApp();
  const { seller, listing } = await scenario();
  const h = auth(seller.id, seller.email);

  const paused = await app.inject({
    method: "PATCH",
    url: `${BASE}/listings/${listing.id}`,
    headers: h,
    payload: { is_active: false },
  });
  assert.equal(paused.statusCode, 200);
  assert.equal(paused.json().is_active, false);

  // Still listed and still editable for its owner — paused is not hidden, only unlisted publicly.
  const listed = await app.inject({ method: "GET", url: `${BASE}/listings`, headers: h });
  assert.equal(listed.json().listings.length, 1);
  assert.equal(listed.json().listings[0].is_active, false);

  const resumed = await app.inject({
    method: "PATCH",
    url: `${BASE}/listings/${listing.id}`,
    headers: h,
    payload: { is_active: true },
  });
  assert.equal(resumed.json().is_active, true);
});

test("a city must belong to the chosen country, and changing country clears a stale city", async () => {
  const app = await getApp();
  const seller = await createUser();
  const h = auth(seller.id, seller.email);

  const home = await createCountryWithCity(1, "Testney");
  const elsewhere = await createCountryWithCity(2, "Otherton");

  // A city from another country would render as a mismatched location.
  const mismatched = await app.inject({
    method: "POST",
    url: `${BASE}/listings`,
    headers: h,
    payload: {
      title: "T",
      category: "other",
      price_minor: 1000,
      country_id: elsewhere.country.id,
      city_id: home.city.id,
    },
  });
  assert.equal(mismatched.statusCode, 400);

  const cityAlone = await app.inject({
    method: "POST",
    url: `${BASE}/listings`,
    headers: h,
    payload: { title: "T", category: "other", price_minor: 1000, city_id: home.city.id },
  });
  assert.equal(cityAlone.statusCode, 400);

  const ok = await app.inject({
    method: "POST",
    url: `${BASE}/listings`,
    headers: h,
    payload: { title: "T", category: "other", price_minor: 1000, country_id: home.country.id, city_id: home.city.id },
  });
  assert.equal(ok.statusCode, 201);
  assert.equal(ok.json().city_name, home.city.name);

  // Moving the country without naming a city drops the city rather than leaving a mismatched pair.
  const moved = await app.inject({
    method: "PATCH",
    url: `${BASE}/listings/${ok.json().id}`,
    headers: h,
    payload: { country_id: elsewhere.country.id },
  });
  assert.equal(moved.statusCode, 200);
  assert.equal(moved.json().city_id, null);
});

test("a listing holding an open order cannot be deleted, and the open orders are named", async () => {
  const app = await getApp();

  // Each of these statuses has money committed against it.
  for (const status of ["pending_payment", "paid", "disputed"]) {
    await resetDb();
    const { seller, buyer, listing } = await scenario();
    const order = await createOrder(listing, buyer.id, seller.id, { status });

    const res = await app.inject({
      method: "DELETE",
      url: `${BASE}/listings/${listing.id}`,
      headers: auth(seller.id, seller.email),
    });
    assert.equal(res.statusCode, 409, `${status} should block deletion`);
    // The message must name what to chase, and offer Pause as the alternative.
    // error-handler.plugin.ts serialises an AppError as { error, code }.
    assert.match(res.json().error, new RegExp(`#${order.id}`));
    assert.match(res.json().error, /Pause/i);
    assert.equal((await readListing(listing.id)).deleted_at, null);
  }
});

test("a listing with only closed orders deletes, and its order history survives", async () => {
  const app = await getApp();
  const { seller, buyer, listing } = await scenario();
  const order = await createOrder(listing, buyer.id, seller.id, { status: "completed", completed_at: new Date() });

  const res = await app.inject({
    method: "DELETE",
    url: `${BASE}/listings/${listing.id}`,
    headers: auth(seller.id, seller.email),
  });
  assert.equal(res.statusCode, 204);
  assert.notEqual((await readListing(listing.id)).deleted_at, null);

  // Soft delete: the buyer's history keeps its title instead of losing it with the listing.
  const detail = await app.inject({
    method: "GET",
    url: `${BASE}/orders/${order.id}`,
    headers: auth(buyer.id, buyer.email),
  });
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.json().listing_title, "Airport Pickup — Sydney");
  assert.equal(detail.json().listing_deleted, true);

  // ...and the deleted listing is gone from My Listings.
  const listed = await app.inject({ method: "GET", url: `${BASE}/listings`, headers: auth(seller.id, seller.email) });
  assert.equal(listed.json().listings.length, 0);
});

test("a paused listing's existing order still completes normally", async () => {
  const app = await getApp();
  const { seller, buyer, order } = await paidOrder();
  await masterKnex("service_listings").where({ provider_id: seller.id }).update({ is_active: false });

  await app.inject({ method: "POST", url: `${BASE}/orders/${order.id}/complete`, headers: auth(buyer.id, buyer.email) });
  const done = await app.inject({
    method: "POST",
    url: `${BASE}/orders/${order.id}/complete`,
    headers: auth(seller.id, seller.email),
  });
  assert.equal(done.json().status, "completed");
});

// ── Payment verification: the six-point reconciliation ─────────────────────

test("verification settles the order when every check passes", async () => {
  const app = await getApp();
  const { buyer, listing } = await scenario();
  const seller = await masterKnex("service_listings").where({ id: listing.id }).first().then((l) => l!.provider_id);
  const sessionId = makeDevSessionId({ amountMinor: 5000, currency: "AUD" });
  const order = await createOrder(listing, buyer.id, seller, { payment_session_id: sessionId });

  const res = await app.inject({
    method: "POST",
    url: `${BASE}/orders/payment/verify`,
    headers: auth(buyer.id, buyer.email),
    payload: { session_id: sessionId },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { success: true, order_id: order.id, already_verified: false });

  const row = await readOrder(order.id);
  assert.equal(row.status, "paid");
  assert.notEqual(row.paid_at, null);
  // The PaymentIntent is persisted at verify time — without it the order could never be refunded.
  assert.match(String(row.payment_intent_id), /^pi_dev_/);
  assert.equal(row.payment_provider, "dev");
  assert.equal((await readListing(listing.id)).total_orders, 1);

  // The dev driver reports currency lowercase, exactly as Stripe does, so this passing IS the
  // case-normalisation check working.
  const session = await getDriver().retrieveSession(sessionId);
  assert.equal(session.currency, "aud");
});

test("each reconciliation rule refuses to settle, leaving the order untouched", async () => {
  const app = await getApp();

  const cases: { name: string; session: string; expect: number }[] = [
    {
      name: "payment_status is not paid",
      session: makeDevSessionId({ paymentStatus: "unpaid", amountMinor: 5000, currency: "AUD" }),
      expect: 400,
    },
    {
      name: "amount does not match the order",
      session: makeDevSessionId({ amountMinor: 9900, currency: "AUD" }),
      expect: 400,
    },
    {
      name: "currency does not match the order",
      session: makeDevSessionId({ amountMinor: 5000, currency: "USD" }),
      expect: 400,
    },
    {
      name: "no payment intent exists",
      session: makeDevSessionId({ amountMinor: 5000, currency: "AUD", withIntent: false }),
      expect: 400,
    },
  ];

  for (const c of cases) {
    await resetDb();
    const { seller, buyer, listing } = await scenario();
    const order = await createOrder(listing, buyer.id, seller.id, { payment_session_id: c.session });

    const res = await app.inject({
      method: "POST",
      url: `${BASE}/orders/payment/verify`,
      headers: auth(buyer.id, buyer.email),
      payload: { session_id: c.session },
    });
    assert.equal(res.statusCode, c.expect, `${c.name}: expected ${c.expect}, got ${res.statusCode}`);

    // Nothing moved: not the status, not the timestamp, not the listing's order count.
    const row = await readOrder(order.id);
    assert.equal(row.status, "pending_payment", `${c.name}: status must not change`);
    assert.equal(row.paid_at, null, `${c.name}: paid_at must not be set`);
    assert.equal((await readListing(listing.id)).total_orders, 0, `${c.name}: total_orders must not move`);
  }
});

test("a session belonging to another account cannot settle its order", async () => {
  const app = await getApp();
  const { seller, buyer, listing } = await scenario();
  const sessionId = makeDevSessionId({ amountMinor: 5000, currency: "AUD" });
  const order = await createOrder(listing, buyer.id, seller.id, { payment_session_id: sessionId });

  // The provider is a party to the order but is not the payer.
  const asProvider = await app.inject({
    method: "POST",
    url: `${BASE}/orders/payment/verify`,
    headers: auth(seller.id, seller.email),
    payload: { session_id: sessionId },
  });
  assert.equal(asProvider.statusCode, 403);

  const stranger = await createUser();
  const asStranger = await app.inject({
    method: "POST",
    url: `${BASE}/orders/payment/verify`,
    headers: auth(stranger.id, stranger.email),
    payload: { session_id: sessionId },
  });
  assert.equal(asStranger.statusCode, 403);

  assert.equal((await readOrder(order.id)).status, "pending_payment");
});

test("an unknown session settles nothing, and one session cannot be shared by two orders", async () => {
  const app = await getApp();
  const { seller, buyer, listing } = await scenario();
  const sessionId = makeDevSessionId({ amountMinor: 5000, currency: "AUD" });
  await createOrder(listing, buyer.id, seller.id, { payment_session_id: sessionId });

  // The session→order lookup IS the binding between a payment and an order.
  const unknown = await app.inject({
    method: "POST",
    url: `${BASE}/orders/payment/verify`,
    headers: auth(buyer.id, buyer.email),
    payload: { session_id: makeDevSessionId({ amountMinor: 5000, currency: "AUD" }) },
  });
  assert.equal(unknown.statusCode, 404);

  // ...and the unique index is what makes that binding one-to-one.
  await assert.rejects(() => createOrder(listing, buyer.id, seller.id, { payment_session_id: sessionId }));
});

test("re-verifying is idempotent and never counts the order twice", async () => {
  const app = await getApp();
  const { seller, buyer, listing } = await scenario();
  const sessionId = makeDevSessionId({ amountMinor: 5000, currency: "AUD" });
  const order = await createOrder(listing, buyer.id, seller.id, { payment_session_id: sessionId });
  const call = () =>
    app.inject({
      method: "POST",
      url: `${BASE}/orders/payment/verify`,
      headers: auth(buyer.id, buyer.email),
      payload: { session_id: sessionId },
    });

  assert.equal((await call()).json().already_verified, false);

  // Reloading the return URL must read as success, never as a failure.
  for (let i = 0; i < 3; i++) {
    const again = await call();
    assert.equal(again.statusCode, 200);
    assert.deepEqual(again.json(), { success: true, order_id: order.id, already_verified: true });
  }
  assert.equal((await readListing(listing.id)).total_orders, 1);
});

test("a terminal order cannot be settled by a late payment return", async () => {
  const app = await getApp();
  const { seller, buyer, listing } = await scenario();
  const sessionId = makeDevSessionId({ amountMinor: 5000, currency: "AUD" });
  const order = await createOrder(listing, buyer.id, seller.id, {
    status: "cancelled",
    cancelled_at: new Date(),
    payment_session_id: sessionId,
  });

  const res = await app.inject({
    method: "POST",
    url: `${BASE}/orders/payment/verify`,
    headers: auth(buyer.id, buyer.email),
    payload: { session_id: sessionId },
  });
  assert.equal(res.statusCode, 409);
  assert.equal((await readOrder(order.id)).status, "cancelled");
});

// ── Completion ─────────────────────────────────────────────────────────────

test("one confirmation is not enough; both close the order", async () => {
  const app = await getApp();
  const { seller, buyer, order } = await paidOrder();

  const first = await app.inject({
    method: "POST",
    url: `${BASE}/orders/${order.id}/complete`,
    headers: auth(buyer.id, buyer.email),
  });
  assert.equal(first.statusCode, 200);
  // Still held. Neither party is told it finished.
  assert.equal(first.json().status, "paid");
  assert.equal(first.json().buyer_confirmed, true);
  assert.equal(first.json().provider_confirmed, false);
  assert.equal(first.json().awaiting_my_confirmation, false);
  assert.equal((await readOrder(order.id)).completed_at, null);

  const second = await app.inject({
    method: "POST",
    url: `${BASE}/orders/${order.id}/complete`,
    headers: auth(seller.id, seller.email),
  });
  assert.equal(second.json().status, "completed");
  assert.notEqual((await readOrder(order.id)).completed_at, null);
});

test("the confirming party is taken from the order, not the request", async () => {
  const app = await getApp();
  const { seller, buyer, order } = await paidOrder();

  // The provider confirming sets the *provider* flag, whoever asks.
  const res = await app.inject({
    method: "POST",
    url: `${BASE}/orders/${order.id}/complete`,
    headers: auth(seller.id, seller.email),
  });
  assert.equal(res.json().provider_confirmed, true);
  assert.equal(res.json().buyer_confirmed, false);
  assert.equal(res.json().role, "provider");

  // The same party cannot confirm twice to force the order closed on its own.
  const twice = await app.inject({
    method: "POST",
    url: `${BASE}/orders/${order.id}/complete`,
    headers: auth(seller.id, seller.email),
  });
  assert.equal(twice.statusCode, 409);
  assert.equal((await readOrder(order.id)).status, "paid");

  void buyer;
});

test("a stranger can neither see nor confirm an order", async () => {
  const app = await getApp();
  const { order } = await paidOrder();
  const stranger = await createUser();
  const h = auth(stranger.id, stranger.email);

  // 404, not 403 — a stranger learns nothing about whether the order exists.
  assert.equal((await app.inject({ method: "GET", url: `${BASE}/orders/${order.id}`, headers: h })).statusCode, 404);
  assert.equal(
    (await app.inject({ method: "POST", url: `${BASE}/orders/${order.id}/complete`, headers: h })).statusCode,
    403,
  );
});

test("an unpaid order cannot be confirmed", async () => {
  const app = await getApp();
  const { seller, buyer, listing } = await scenario();
  const order = await createOrder(listing, buyer.id, seller.id);

  const res = await app.inject({
    method: "POST",
    url: `${BASE}/orders/${order.id}/complete`,
    headers: auth(buyer.id, buyer.email),
  });
  assert.equal(res.statusCode, 409);
});

test("terminal and disputed orders offer nothing", async () => {
  const app = await getApp();

  // NOTE on `refunded`: these fixtures deliberately carry no payment_refund_id, so refund is refused on the
  // *status* check. An order that really was refunded — one that carries a refund id — instead returns an
  // idempotent success, because that short-circuit is what makes retrying a failed persist safe. Both paths
  // have their own test below; this one must not be read as "refund is always 409 once refunded".
  for (const status of ["completed", "refunded", "cancelled", "disputed"]) {
    await resetDb();
    const { seller, buyer, listing } = await scenario();
    const order = await createOrder(listing, buyer.id, seller.id, { status });

    for (const action of ["complete", "cancel", "refund"]) {
      const res = await app.inject({
        method: "POST",
        url: `${BASE}/orders/${order.id}/${action}`,
        headers: auth(action === "refund" ? seller.id : buyer.id, action === "refund" ? seller.email : buyer.email),
      });
      assert.equal(res.statusCode, 409, `${status}: ${action} should be refused`);
    }

    // A completed order is the one status where a review is legitimate, so only check the others.
    if (status !== "completed") {
      const review = await app.inject({
        method: "POST",
        url: `${BASE}/orders/${order.id}/review`,
        headers: auth(buyer.id, buyer.email),
        payload: { rating: 5 },
      });
      assert.equal(review.statusCode, 409, `${status}: review should be refused`);
    }
  }
});

// ── Reviews ────────────────────────────────────────────────────────────────

async function completedOrder() {
  const s = await scenario();
  const order = await createOrder(s.listing, s.buyer.id, s.seller.id, {
    status: "completed",
    paid_at: new Date(),
    completed_at: new Date(),
    buyer_confirmed: true,
    provider_confirmed: true,
    payment_intent_id: "pi_dev_fixture",
  });
  return { ...s, order };
}

test("the buyer reviews once, and the listing's rating is recomputed", async () => {
  const app = await getApp();
  const { buyer, listing, order } = await completedOrder();

  const res = await app.inject({
    method: "POST",
    url: `${BASE}/orders/${order.id}/review`,
    headers: auth(buyer.id, buyer.email),
    payload: { rating: 4, comment: "On time" },
  });
  assert.equal(res.statusCode, 201);
  assert.equal(res.json().rating, 4);

  // V2 never recomputed these — every listing showed 0 stars however many reviews it had.
  const row = await readListing(listing.id);
  assert.equal(Number(row.avg_rating), 4);
  assert.equal(row.total_reviews, 1);

  // The order now reports the review and stops offering the form.
  const detail = await app.inject({
    method: "GET",
    url: `${BASE}/orders/${order.id}`,
    headers: auth(buyer.id, buyer.email),
  });
  assert.equal(detail.json().has_review, true);
  assert.equal(detail.json().can_review, false);

  const again = await app.inject({
    method: "POST",
    url: `${BASE}/orders/${order.id}/review`,
    headers: auth(buyer.id, buyer.email),
    payload: { rating: 1 },
  });
  assert.equal(again.statusCode, 409);
  assert.equal((await readListing(listing.id)).total_reviews, 1);
});

test("the average is the mean of every review on the listing", async () => {
  const app = await getApp();
  const { seller, buyer, listing } = await scenario();
  const otherBuyer = await createUser();

  for (const [who, rating] of [
    [buyer, 5],
    [otherBuyer, 2],
  ] as const) {
    const order = await createOrder(listing, who.id, seller.id, {
      status: "completed",
      completed_at: new Date(),
      buyer_confirmed: true,
      provider_confirmed: true,
    });
    const res = await app.inject({
      method: "POST",
      url: `${BASE}/orders/${order.id}/review`,
      headers: auth(who.id, who.email),
      payload: { rating },
    });
    assert.equal(res.statusCode, 201);
  }

  const row = await readListing(listing.id);
  assert.equal(Number(row.avg_rating), 3.5);
  assert.equal(row.total_reviews, 2);
});

test("the provider is never offered a review, at any status", async () => {
  const app = await getApp();
  const { seller, order } = await completedOrder();

  const res = await app.inject({
    method: "POST",
    url: `${BASE}/orders/${order.id}/review`,
    headers: auth(seller.id, seller.email),
    payload: { rating: 5 },
  });
  assert.equal(res.statusCode, 403);

  const detail = await app.inject({
    method: "GET",
    url: `${BASE}/orders/${order.id}`,
    headers: auth(seller.id, seller.email),
  });
  assert.equal(detail.json().can_review, false);
  assert.equal(detail.json().role, "provider");
});

test("a review cannot be posted before both parties confirm", async () => {
  const app = await getApp();
  const { buyer, order } = await paidOrder();

  const res = await app.inject({
    method: "POST",
    url: `${BASE}/orders/${order.id}/review`,
    headers: auth(buyer.id, buyer.email),
    payload: { rating: 5 },
  });
  assert.equal(res.statusCode, 409);
});

test("a rating outside 1–5 is refused", async () => {
  const app = await getApp();
  const { buyer, order } = await completedOrder();

  for (const rating of [0, 6, -1, 2.5]) {
    const res = await app.inject({
      method: "POST",
      url: `${BASE}/orders/${order.id}/review`,
      headers: auth(buyer.id, buyer.email),
      payload: { rating },
    });
    assert.equal(res.statusCode, 400, `rating ${rating} should be refused`);
  }
});

// ── Cancel and dispute ─────────────────────────────────────────────────────

test("an unpaid order cancels; a held one must be refunded instead", async () => {
  const app = await getApp();
  const { seller, buyer, listing } = await scenario();
  const unpaid = await createOrder(listing, buyer.id, seller.id);

  const cancelled = await app.inject({
    method: "POST",
    url: `${BASE}/orders/${unpaid.id}/cancel`,
    headers: auth(buyer.id, buyer.email),
  });
  assert.equal(cancelled.json().status, "cancelled");
  assert.notEqual((await readOrder(unpaid.id)).cancelled_at, null);

  const held = await paidOrder();
  const refused = await app.inject({
    method: "POST",
    url: `${BASE}/orders/${held.order.id}/cancel`,
    headers: auth(held.buyer.id, held.buyer.email),
  });
  assert.equal(refused.statusCode, 409);
  // The message points at the action that actually applies.
  assert.match(refused.json().error, /refund/i);
});

test("reporting a problem disputes a held order and records why", async () => {
  const app = await getApp();
  const { buyer, order } = await paidOrder();

  const res = await app.inject({
    method: "POST",
    url: `${BASE}/orders/${order.id}/dispute`,
    headers: auth(buyer.id, buyer.email),
    payload: { reason: "Driver never arrived" },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().status, "disputed");
  assert.match(String((await readOrder(order.id)).notes), /Driver never arrived/);

  // An empty reason is not a report.
  const { buyer: b2, order: o2 } = await paidOrder();
  const empty = await app.inject({
    method: "POST",
    url: `${BASE}/orders/${o2.id}/dispute`,
    headers: auth(b2.id, b2.email),
    payload: { reason: "  " },
  });
  assert.equal(empty.statusCode, 400);
});

// ── Refund: idempotent across a Stripe/Postgres split failure ──────────────

test("the provider refunds a held payment and the refund id is persisted", async () => {
  const app = await getApp();
  const { seller, order } = await paidOrder();

  const res = await app.inject({
    method: "POST",
    url: `${BASE}/orders/${order.id}/refund`,
    headers: auth(seller.id, seller.email),
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().status, "refunded");

  const row = await readOrder(order.id);
  // A refund whose id is not stored is a refund nobody can audit.
  assert.match(String(row.payment_refund_id), /^re_dev_/);
  assert.notEqual(row.refunded_at, null);
  assert.equal(__countRefunds("pi_dev_fixture"), 1);
});

test("only the provider may refund, and only a held payment", async () => {
  const app = await getApp();
  const { buyer, order } = await paidOrder();

  const asBuyer = await app.inject({
    method: "POST",
    url: `${BASE}/orders/${order.id}/refund`,
    headers: auth(buyer.id, buyer.email),
  });
  assert.equal(asBuyer.statusCode, 403);
  assert.equal((await readOrder(order.id)).status, "paid");

  const unpaid = await scenario();
  const pending = await createOrder(unpaid.listing, unpaid.buyer.id, unpaid.seller.id);
  const tooEarly = await app.inject({
    method: "POST",
    url: `${BASE}/orders/${pending.id}/refund`,
    headers: auth(unpaid.seller.id, unpaid.seller.email),
  });
  assert.equal(tooEarly.statusCode, 409);
});

test("an already-refunded order short-circuits without calling the provider", async () => {
  const app = await getApp();
  const { seller, order } = await paidOrder({ status: "refunded", payment_refund_id: "re_dev_existing" });

  const res = await app.inject({
    method: "POST",
    url: `${BASE}/orders/${order.id}/refund`,
    headers: auth(seller.id, seller.email),
  });
  // Idempotent success, NOT a 409 — this short-circuit is what lets an operator safely retry a refund whose
  // database write failed, so refusing it would break the recovery path the tests above depend on.
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().status, "refunded");
  assert.equal(res.json().payment_refund_id, "re_dev_existing");
  // No outbound call at all: nothing was created against the PaymentIntent.
  assert.equal(__countRefunds("pi_dev_fixture"), 0);
});

test("a refunded row with no refund id is refused on status, not short-circuited", async () => {
  const app = await getApp();
  // A data anomaly rather than a real refund: there is nothing to be idempotent about, so the status check
  // must catch it instead of the endpoint attempting a fresh refund on a closed order.
  const { seller, order } = await paidOrder({ status: "refunded" });

  const res = await app.inject({
    method: "POST",
    url: `${BASE}/orders/${order.id}/refund`,
    headers: auth(seller.id, seller.email),
  });
  assert.equal(res.statusCode, 409);
  assert.equal(__countRefunds("pi_dev_fixture"), 0);
});

test("a retry immediately after a failed persist replays the same refund", async () => {
  const app = await getApp();
  const { seller, order } = await paidOrder();
  const h = auth(seller.id, seller.email);

  const first = await app.inject({ method: "POST", url: `${BASE}/orders/${order.id}/refund`, headers: h });
  const refundId = String((await readOrder(order.id)).payment_refund_id);
  assert.equal(first.statusCode, 200);

  // Simulate the dangerous interleaving: the provider refunded, the DB write did not land.
  await masterKnex("service_orders").where({ id: order.id }).update({ status: "paid", payment_refund_id: null });

  const retry = await app.inject({ method: "POST", url: `${BASE}/orders/${order.id}/refund`, headers: h });
  assert.equal(retry.statusCode, 200);
  assert.equal(String((await readOrder(order.id)).payment_refund_id), refundId);
  // One refund, not two — Stripe accepts repeated partial refunds, so this is the thing that must not slip.
  assert.equal(__countRefunds("pi_dev_fixture"), 1);
});

test("a retry after the idempotency key has expired still does not double-refund", async () => {
  const app = await getApp();
  const { seller, order } = await paidOrder();
  const h = auth(seller.id, seller.email);

  await app.inject({ method: "POST", url: `${BASE}/orders/${order.id}/refund`, headers: h });
  const refundId = String((await readOrder(order.id)).payment_refund_id);

  await masterKnex("service_orders").where({ id: order.id }).update({ status: "paid", payment_refund_id: null });
  // Stripe guarantees idempotent replay for 24h and may prune keys after that, so a retry days later reads as
  // a brand-new request. Only asking the provider what it already holds closes this.
  __expireIdempotencyKeys();

  const retry = await app.inject({ method: "POST", url: `${BASE}/orders/${order.id}/refund`, headers: h });
  assert.equal(retry.statusCode, 200);
  assert.equal(String((await readOrder(order.id)).payment_refund_id), refundId);
  assert.equal(__countRefunds("pi_dev_fixture"), 1);
});

test("a refund the provider already holds with no local row is reconciled, not duplicated", async () => {
  const app = await getApp();
  const { seller, order } = await paidOrder();

  // The state a failed persist leaves behind, reached without this endpoint having run.
  const seeded = __seedRefund("pi_dev_fixture", 5000);

  const res = await app.inject({
    method: "POST",
    url: `${BASE}/orders/${order.id}/refund`,
    headers: auth(seller.id, seller.email),
  });
  assert.equal(res.statusCode, 200);
  assert.equal(String((await readOrder(order.id)).payment_refund_id), seeded.refundId);
  assert.equal(__countRefunds("pi_dev_fixture"), 1);
});

// ── Order lists and summary ────────────────────────────────────────────────

test("purchases and received orders are separated by role and flag what needs attention", async () => {
  const app = await getApp();
  const { seller, buyer, order } = await paidOrder();

  const purchases = await app.inject({ method: "GET", url: `${BASE}/orders`, headers: auth(buyer.id, buyer.email) });
  assert.equal(purchases.json().orders.length, 1);
  assert.equal(purchases.json().orders[0].role, "buyer");
  // Held and unconfirmed by this caller — the row that should read "Confirm completion".
  assert.equal(purchases.json().orders[0].awaiting_my_confirmation, true);

  const received = await app.inject({
    method: "GET",
    url: `${BASE}/received-orders`,
    headers: auth(seller.id, seller.email),
  });
  assert.equal(received.json().orders.length, 1);
  assert.equal(received.json().orders[0].role, "provider");
  assert.equal(received.json().orders[0].awaiting_my_confirmation, true);

  // The seller's own purchases list is empty — the two tabs are not the same query.
  const sellerPurchases = await app.inject({
    method: "GET",
    url: `${BASE}/orders`,
    headers: auth(seller.id, seller.email),
  });
  assert.equal(sellerPurchases.json().orders.length, 0);

  // Once this caller confirms, their flag clears while the counterparty's does not.
  await app.inject({ method: "POST", url: `${BASE}/orders/${order.id}/complete`, headers: auth(buyer.id, buyer.email) });
  const after = await app.inject({ method: "GET", url: `${BASE}/orders`, headers: auth(buyer.id, buyer.email) });
  assert.equal(after.json().orders[0].awaiting_my_confirmation, false);
});

test("the summary buckets by currency, never converting, and never claims a payout", async () => {
  const app = await getApp();
  const seller = await createUser();
  const buyer = await createUser();

  const aud = await createListing(seller.id, { price_minor: 5000, currency: "AUD" });
  const gbp = await createListing(seller.id, { price_minor: 3000, currency: "GBP" });
  await createOrder(aud, buyer.id, seller.id, { status: "paid", paid_at: new Date() });
  await createOrder(gbp, buyer.id, seller.id, { status: "paid", paid_at: new Date() });
  await createOrder(gbp, buyer.id, seller.id, { status: "completed", completed_at: new Date() });

  const res = await app.inject({ method: "GET", url: `${BASE}/summary`, headers: auth(seller.id, seller.email) });
  const body = res.json();

  const byCurrency = Object.fromEntries(body.totals.map((t: { currency: string }) => [t.currency, t]));
  // A GBP listing viewed by anyone stays GBP — the two buckets are never summed into one figure.
  assert.equal(byCurrency.AUD.held_minor, 5000);
  assert.equal(byCurrency.AUD.confirmed_minor, 0);
  assert.equal(byCurrency.GBP.held_minor, 3000);
  assert.equal(byCurrency.GBP.confirmed_minor, 3000);

  assert.equal(body.listings_count, 2);
  assert.equal(body.received_count, 3);
  // No Connect account and no transfer exists, so the API says so rather than letting a client imply one.
  assert.equal(body.payouts_live, false);
});

// ── Storage-layer guarantees and driver selection ──────────────────────────

test("the database refuses an order where the buyer is the provider", async () => {
  const seller = await createUser();
  const listing = await createListing(seller.id);
  // Not merely a handler check — self-purchase is impossible at the storage layer.
  await assert.rejects(
    () => createOrder(listing, seller.id, seller.id),
    /service_orders_parties_chk/,
  );
});

test("the dev payment driver is refused in production, and only there", async () => {
  const originalEnv = config.NODE_ENV;
  const originalKey = config.STRIPE_SECRET_KEY;
  try {
    config.STRIPE_SECRET_KEY = undefined;

    config.NODE_ENV = "development";
    assert.equal(getDriver().name, "dev");

    // A driver that approves payments without charging must never serve production traffic. The guard is at
    // selection, so merely importing the module — in a test, a migration, a worker — does not throw.
    config.NODE_ENV = "production";
    assert.throws(() => getDriver(), /must never serve production traffic/);

    // With a real key configured, production is fine.
    config.STRIPE_SECRET_KEY = "sk_test_dummy";
    assert.equal(getDriver().name, "stripe");
  } finally {
    config.NODE_ENV = originalEnv;
    config.STRIPE_SECRET_KEY = originalKey;
  }
});

test("meta reports the taxonomy and what this environment can actually do", async () => {
  const app = await getApp();
  const user = await createUser();
  const res = await app.inject({ method: "GET", url: `${BASE}/meta`, headers: auth(user.id, user.email) });
  const body = res.json();

  assert.equal(body.categories.length, 7);
  assert.ok(body.categories.includes("airport_pickup"));
  assert.deepEqual(body.currencies, ["AUD", "USD", "GBP", "EUR"]);
  // Booleans, so the client can hide an affordance instead of offering one that can only fail.
  assert.equal(typeof body.cover_upload_available, "boolean");
  assert.equal(typeof body.payments_live, "boolean");
});

test("every route requires authentication", async () => {
  const app = await getApp();
  for (const url of [`${BASE}/meta`, `${BASE}/summary`, `${BASE}/listings`, `${BASE}/orders`, `${BASE}/received-orders`]) {
    const res = await app.inject({ method: "GET", url });
    assert.equal(res.statusCode, 401, `${url} should require auth`);
  }
});
