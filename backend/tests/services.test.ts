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
  categoryId,
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
const PUBLIC = "/api/v3/services";

/**
 * Resolved once. Categories are seeded by migration 20260813_001 and deliberately survive resetDb — they are
 * reference data an admin owns, not per-test fixtures.
 */
let otherCat: number;

before(async () => {
  await getApp();
  otherCat = await categoryId("other");
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
    payload: { title: "City Orientation", category_id: await categoryId("city_orientation"), price_minor: 5000, currency: "AUD" },
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
  const base = { title: "T", category_id: await categoryId("other"), currency: "AUD" as const };

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
      payload: { title: "T", category_id: otherCat, price_minor: 1000, ...forged },
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
      category_id: otherCat,
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
    payload: { title: "T", category_id: otherCat, price_minor: 1000, city_id: home.city.id },
  });
  assert.equal(cityAlone.statusCode, 400);

  const ok = await app.inject({
    method: "POST",
    url: `${BASE}/listings`,
    headers: h,
    payload: { title: "T", category_id: otherCat, price_minor: 1000, country_id: home.country.id, city_id: home.city.id },
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
  const order = await createOrder(listing, buyer.id, seller.id, { status: "refunded", refunded_at: new Date() });

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

test("pausing a listing does not disturb an order already running against it", async () => {
  const app = await getApp();
  const { seller, buyer, order } = await paidOrder();
  await masterKnex("service_listings").where({ provider_id: seller.id }).update({ is_active: false });

  // Pause takes the listing off the marketplace; it does not reach back into orders already placed.
  const sent = await app.inject({
    method: "POST",
    url: `${BASE}/orders/${order.id}/messages`,
    headers: auth(buyer.id, buyer.email),
    payload: { body: "Still on for Tuesday?" },
  });
  assert.equal(sent.statusCode, 201);
  assert.equal((await readOrder(order.id)).status, "paid");
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

// ── Order messages ──────────────────────────────────────────────────────────
//
// The post-purchase conversation replaced dual confirmation: nothing closes an order any more, so talking to
// the other party is what a buyer does next.

test("both parties can talk on a paid order, and each sees who said what", async () => {
  const app = await getApp();
  const { seller, buyer, order } = await paidOrder();

  const sent = await app.inject({
    method: "POST",
    url: `${BASE}/orders/${order.id}/messages`,
    headers: auth(buyer.id, buyer.email),
    payload: { body: "Landing Tuesday 6am, terminal 1." },
  });
  assert.equal(sent.statusCode, 201);
  assert.equal(sent.json().is_mine, true);

  const replied = await app.inject({
    method: "POST",
    url: `${BASE}/orders/${order.id}/messages`,
    headers: auth(seller.id, seller.email),
    payload: { body: "I'll be at arrivals with a sign." },
  });
  assert.equal(replied.statusCode, 201);

  // is_mine is resolved server-side per reader, so neither client compares ids to lay out the thread.
  const asBuyer = await app.inject({
    method: "GET",
    url: `${BASE}/orders/${order.id}/messages`,
    headers: auth(buyer.id, buyer.email),
  });
  const messages = asBuyer.json().messages;
  assert.equal(messages.length, 2);
  // Oldest first — a conversation reads top to bottom.
  assert.match(messages[0].body, /Landing Tuesday/);
  assert.equal(messages[0].is_mine, true);
  assert.equal(messages[1].is_mine, false);
  assert.equal(messages[1].sender_id, seller.id);

  const asSeller = await app.inject({
    method: "GET",
    url: `${BASE}/orders/${order.id}/messages`,
    headers: auth(seller.id, seller.email),
  });
  assert.equal(asSeller.json().messages[0].is_mine, false);

  // The count rides along on the order, so a row can say "2 messages" without opening the thread.
  const detail = await app.inject({
    method: "GET",
    url: `${BASE}/orders/${order.id}`,
    headers: auth(buyer.id, buyer.email),
  });
  assert.equal(detail.json().message_count, 2);
});

test("a stranger cannot read or write an order's thread", async () => {
  const app = await getApp();
  const { buyer, order } = await paidOrder();
  const stranger = await createUser();
  const h = auth(stranger.id, stranger.email);

  await app.inject({
    method: "POST",
    url: `${BASE}/orders/${order.id}/messages`,
    headers: auth(buyer.id, buyer.email),
    payload: { body: "private" },
  });

  // 404, not 403 — a stranger learns nothing about whether the order exists.
  assert.equal(
    (await app.inject({ method: "GET", url: `${BASE}/orders/${order.id}/messages`, headers: h })).statusCode,
    404,
  );
  const wrote = await app.inject({
    method: "POST",
    url: `${BASE}/orders/${order.id}/messages`,
    headers: h,
    payload: { body: "let me in" },
  });
  assert.equal(wrote.statusCode, 404);
  assert.equal(await masterKnex("service_order_messages").where({ order_id: order.id }).count("id as c").first().then((r) => Number(r.c)), 1);
});

test("an empty message is refused by the schema and by the database", async () => {
  const app = await getApp();
  const { buyer, order } = await paidOrder();

  for (const body of ["", "   ", "\n\t "]) {
    const res = await app.inject({
      method: "POST",
      url: `${BASE}/orders/${order.id}/messages`,
      headers: auth(buyer.id, buyer.email),
      payload: { body },
    });
    assert.equal(res.statusCode, 400, `"${body}" should be refused`);
  }

  // The CHECK is the backstop for anything that bypasses the API.
  await assert.rejects(
    () => masterKnex("service_order_messages").insert({ order_id: order.id, sender_id: buyer.id, body: "  " }),
    /service_order_messages_body_chk/,
  );
});

test("the thread opens when the money is committed and closes when the order does", async () => {
  const app = await getApp();

  // Nothing to discuss before payment: the order may never be paid at all.
  const unpaid = await scenario();
  const pending = await createOrder(unpaid.listing, unpaid.buyer.id, unpaid.seller.id);
  const early = await app.inject({
    method: "POST",
    url: `${BASE}/orders/${pending.id}/messages`,
    headers: auth(unpaid.buyer.id, unpaid.buyer.email),
    payload: { body: "hello?" },
  });
  assert.equal(early.statusCode, 409);

  // Disputed stays open on purpose — that is exactly when they need to sort it out.
  const dis = await paidOrder({ status: "disputed" });
  const during = await app.inject({
    method: "POST",
    url: `${BASE}/orders/${dis.order.id}/messages`,
    headers: auth(dis.buyer.id, dis.buyer.email),
    payload: { body: "the driver never came" },
  });
  assert.equal(during.statusCode, 201);

  for (const status of ["cancelled", "refunded"] as const) {
    const closed = await paidOrder({ status });
    const late = await app.inject({
      method: "POST",
      url: `${BASE}/orders/${closed.order.id}/messages`,
      headers: auth(closed.buyer.id, closed.buyer.email),
      payload: { body: "one more thing" },
    });
    assert.equal(late.statusCode, 409, `${status} should close the conversation`);
    // Still readable — a closed conversation is history, not a deletion.
    const read = await app.inject({
      method: "GET",
      url: `${BASE}/orders/${closed.order.id}/messages`,
      headers: auth(closed.buyer.id, closed.buyer.email),
    });
    assert.equal(read.statusCode, 200);
  }
});

test("confirming completion is gone, not merely hidden", async () => {
  const app = await getApp();
  const { buyer, order } = await paidOrder();

  // The route was removed with the flow; a client still calling it gets a 404 rather than a silent no-op.
  const res = await app.inject({
    method: "POST",
    url: `${BASE}/orders/${order.id}/complete`,
    headers: auth(buyer.id, buyer.email),
  });
  assert.equal(res.statusCode, 404);
  assert.equal((await readOrder(order.id)).status, "paid");
});

// ── Reviews ────────────────────────────────────────────────────────────────
//
// Open to any signed-in user: buying is not required. The purchase gate is replaced by one-per-person,
// no-self-review, and a verified-purchase marker on the reviews that did come from a buyer.

test("anyone signed in can review, and the listing's rating is recomputed", async () => {
  const app = await getApp();
  const { seller, listing } = await scenario();
  const passerby = await createUser();

  const posted = await app.inject({
    method: "POST",
    url: `${BASE}/listings/${listing.id}/reviews`,
    headers: auth(passerby.id, passerby.email),
    payload: { rating: 4, comment: "Heard good things." },
  });
  assert.equal(posted.statusCode, 201);
  // No order behind it, so it is not a verified purchase — but it counts toward the rating.
  assert.equal(posted.json().order_id, null);
  assert.equal(posted.json().is_verified_purchase, false);

  // V2 never recomputed at all; the aggregates must follow from the rows.
  const row = await readListing(listing.id);
  assert.equal(Number(row.avg_rating), 4);
  assert.equal(row.total_reviews, 1);

  const publicView = await app.inject({ method: "GET", url: `${PUBLIC}/${listing.id}/reviews` });
  assert.equal(publicView.json().reviews.length, 1);
  assert.equal(publicView.json().reviews[0].is_verified_purchase, false);
  assert.equal(seller.id > 0, true);
});

test("a reviewer who bought is marked as a verified purchase", async () => {
  const app = await getApp();
  const { buyer, listing, order } = await paidOrder();

  const posted = await app.inject({
    method: "POST",
    url: `${BASE}/listings/${listing.id}/reviews`,
    headers: auth(buyer.id, buyer.email),
    payload: { rating: 5, comment: "Exactly as described." },
  });
  assert.equal(posted.statusCode, 201);
  // The order is attached automatically — the buyer never tells us which one.
  assert.equal(posted.json().order_id, order.id);
  assert.equal(posted.json().is_verified_purchase, true);

  const publicView = await app.inject({ method: "GET", url: `${PUBLIC}/${listing.id}/reviews` });
  assert.equal(publicView.json().reviews[0].is_verified_purchase, true);
});

test("a review no longer waits for the order to close", async () => {
  const app = await getApp();
  // The old rule refused anything but a completed order. Nothing closes an order now, so a held payment must
  // be reviewable or no buyer could ever review at all.
  const { buyer, listing } = await paidOrder();

  const res = await app.inject({
    method: "POST",
    url: `${BASE}/listings/${listing.id}/reviews`,
    headers: auth(buyer.id, buyer.email),
    payload: { rating: 5 },
  });
  assert.equal(res.statusCode, 201);
});

test("one review per person per listing", async () => {
  const app = await getApp();
  const { listing } = await scenario();
  const reviewer = await createUser();
  const h = auth(reviewer.id, reviewer.email);
  const post = (rating: number) =>
    app.inject({ method: "POST", url: `${BASE}/listings/${listing.id}/reviews`, headers: h, payload: { rating } });

  assert.equal((await post(5)).statusCode, 201);
  // Without this, one account could rate a rival into the ground.
  assert.equal((await post(1)).statusCode, 409);
  assert.equal((await readListing(listing.id)).total_reviews, 1);

  // The unique index is the real guarantee, so a direct insert loses too.
  await assert.rejects(
    () => masterKnex("service_reviews").insert({ listing_id: listing.id, reviewer_id: reviewer.id, rating: 3 }),
    /service_reviews_listing_reviewer_uniq/,
  );
});

test("you cannot review your own service", async () => {
  const app = await getApp();
  const { seller, listing } = await scenario();

  const res = await app.inject({
    method: "POST",
    url: `${BASE}/listings/${listing.id}/reviews`,
    headers: auth(seller.id, seller.email),
    payload: { rating: 5, comment: "I am excellent." },
  });
  // Rating your own listing is not a review, it is an advert.
  assert.equal(res.statusCode, 403);
  assert.equal((await readListing(listing.id)).total_reviews, 0);

  const mine = await app.inject({
    method: "GET",
    url: `${BASE}/listings/${listing.id}/my-review`,
    headers: auth(seller.id, seller.email),
  });
  assert.equal(mine.json().can_review, false);
  assert.equal(mine.json().reason, "own_listing");
});

test("my-review tells the viewer what they may do", async () => {
  const app = await getApp();
  const { listing } = await scenario();
  const reviewer = await createUser();
  const h = auth(reviewer.id, reviewer.email);

  const before = await app.inject({ method: "GET", url: `${BASE}/listings/${listing.id}/my-review`, headers: h });
  assert.equal(before.json().can_review, true);
  assert.equal(before.json().review, null);

  await app.inject({ method: "POST", url: `${BASE}/listings/${listing.id}/reviews`, headers: h, payload: { rating: 4 } });

  const after = await app.inject({ method: "GET", url: `${BASE}/listings/${listing.id}/my-review`, headers: h });
  assert.equal(after.json().can_review, false);
  assert.equal(after.json().reason, "already_reviewed");
  assert.equal(after.json().review.rating, 4);
});

test("the average is the mean of every review on the listing", async () => {
  const app = await getApp();
  const { listing } = await scenario();

  for (const rating of [5, 4, 3]) {
    const reviewer = await createUser();
    const res = await app.inject({
      method: "POST",
      url: `${BASE}/listings/${listing.id}/reviews`,
      headers: auth(reviewer.id, reviewer.email),
      payload: { rating },
    });
    assert.equal(res.statusCode, 201);
  }

  const row = await readListing(listing.id);
  assert.equal(Number(row.avg_rating), 4);
  assert.equal(row.total_reviews, 3);
});

test("a rating outside 1–5 is refused", async () => {
  const app = await getApp();
  const { listing } = await scenario();

  for (const rating of [0, 6, 2.5, -1]) {
    const reviewer = await createUser();
    const res = await app.inject({
      method: "POST",
      url: `${BASE}/listings/${listing.id}/reviews`,
      headers: auth(reviewer.id, reviewer.email),
      payload: { rating },
    });
    assert.equal(res.statusCode, 400, `rating ${rating} should be refused`);
  }
  assert.equal((await readListing(listing.id)).total_reviews, 0);
});

test("reviewing needs an account — the public prefix is readable but not writable", async () => {
  const app = await getApp();
  const { listing } = await scenario();

  // The public allow-list matches on path; without the GET-only check, this POST would have skipped auth.
  const anon = await app.inject({
    method: "POST",
    url: `${PUBLIC}/${listing.id}/reviews`,
    payload: { rating: 5 },
  });
  assert.equal(anon.statusCode, 401);
  assert.equal((await readListing(listing.id)).total_reviews, 0);
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

test("purchases and received orders are separated by role and carry the thread count", async () => {
  const app = await getApp();
  const { seller, buyer, order } = await paidOrder();
  await app.inject({
    method: "POST",
    url: `${BASE}/orders/${order.id}/messages`,
    headers: auth(buyer.id, buyer.email),
    payload: { body: "On my way" },
  });

  const purchases = await app.inject({ method: "GET", url: `${BASE}/orders`, headers: auth(buyer.id, buyer.email) });
  assert.equal(purchases.json().orders.length, 1);
  assert.equal(purchases.json().orders[0].role, "buyer");
  // The row can say "1 message" without opening the thread.
  assert.equal(purchases.json().orders[0].message_count, 1);

  const received = await app.inject({
    method: "GET",
    url: `${BASE}/received-orders`,
    headers: auth(seller.id, seller.email),
  });
  assert.equal(received.json().orders.length, 1);
  assert.equal(received.json().orders[0].role, "provider");
  assert.equal(received.json().orders[0].message_count, 1);

  // The seller's own purchases list is empty — the two tabs are not the same query.
  const sellerPurchases = await app.inject({
    method: "GET",
    url: `${BASE}/orders`,
    headers: auth(seller.id, seller.email),
  });
  assert.equal(sellerPurchases.json().orders.length, 0);

  // The count follows the thread, and both sides see the same number.
  await app.inject({
    method: "POST",
    url: `${BASE}/orders/${order.id}/messages`,
    headers: auth(seller.id, seller.email),
    payload: { body: "See you there" },
  });
  const after = await app.inject({ method: "GET", url: `${BASE}/orders`, headers: auth(buyer.id, buyer.email) });
  assert.equal(after.json().orders[0].message_count, 2);
});

test("the summary buckets by currency, never converting, and never claims a payout", async () => {
  const app = await getApp();
  const seller = await createUser();
  const buyer = await createUser();

  const aud = await createListing(seller.id, { price_minor: 5000, currency: "AUD" });
  const gbp = await createListing(seller.id, { price_minor: 3000, currency: "GBP" });
  await createOrder(aud, buyer.id, seller.id, { status: "paid", paid_at: new Date() });
  await createOrder(gbp, buyer.id, seller.id, { status: "paid", paid_at: new Date() });
  await createOrder(gbp, buyer.id, seller.id, { status: "refunded", refunded_at: new Date() });

  const res = await app.inject({ method: "GET", url: `${BASE}/summary`, headers: auth(seller.id, seller.email) });
  const body = res.json();

  const byCurrency = Object.fromEntries(body.totals.map((t: { currency: string }) => [t.currency, t]));
  // A GBP listing viewed by anyone stays GBP — the two buckets are never summed into one figure.
  assert.equal(byCurrency.AUD.held_minor, 5000);
  assert.equal(byCurrency.AUD.refunded_minor, 0);
  assert.equal(byCurrency.GBP.held_minor, 3000);
  assert.equal(byCurrency.GBP.refunded_minor, 3000);

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

  // Rows now, not an enum: an admin can add or retire one without a deploy.
  assert.ok(body.categories.length >= 7);
  const slugs = body.categories.map((c: { slug: string }) => c.slug);
  assert.ok(slugs.includes("airport_pickup"), "the seeded taxonomy should be present");
  for (const c of body.categories) {
    assert.equal(typeof c.id, "number");
    assert.equal(typeof c.name, "string");
  }
  assert.deepEqual(body.currencies, ["AUD", "USD", "GBP", "EUR"]);
  // Booleans, so the client can hide an affordance instead of offering one that can only fail.
  assert.equal(typeof body.cover_upload_available, "boolean");
  assert.equal(typeof body.payments_live, "boolean");
});

test("every seller route requires authentication", async () => {
  const app = await getApp();
  for (const url of [`${BASE}/meta`, `${BASE}/summary`, `${BASE}/listings`, `${BASE}/orders`, `${BASE}/received-orders`]) {
    const res = await app.inject({ method: "GET", url });
    assert.equal(res.statusCode, 401, `${url} should require auth`);
  }
});

// ── The public marketplace ─────────────────────────────────────────────────

test("browse, detail, reviews and categories are readable with no token at all", async () => {
  const app = await getApp();
  const { listing } = await scenario();

  for (const url of [PUBLIC, `${PUBLIC}/categories`, `${PUBLIC}/${listing.id}`, `${PUBLIC}/${listing.id}/reviews`]) {
    const res = await app.inject({ method: "GET", url });
    assert.equal(res.statusCode, 200, `${url} should be public`);
  }

  const browse = await app.inject({ method: "GET", url: PUBLIC });
  assert.equal(browse.json().services.length, 1);
  const card = browse.json().services[0];
  assert.equal(card.title, "Airport Pickup — Sydney");
  assert.equal(card.price_minor, 5000);
  assert.equal(card.category_name, "Airport Pickup");
  // The seller is named so a buyer knows who they are dealing with...
  assert.equal(typeof card.provider_name, "string");
  // ...but nothing about the seller's own book is exposed.
  assert.equal(card.cover_storage_path, undefined);
  assert.equal(card.open_orders_count, undefined);
});

test("a paused or deleted listing disappears from the marketplace entirely", async () => {
  const app = await getApp();
  const { seller, listing } = await scenario();
  const h = auth(seller.id, seller.email);

  await app.inject({ method: "PATCH", url: `${BASE}/listings/${listing.id}`, headers: h, payload: { is_active: false } });

  assert.equal((await app.inject({ method: "GET", url: PUBLIC })).json().services.length, 0);
  // 404, not 403: a buyer has no business learning that a seller took something down.
  assert.equal((await app.inject({ method: "GET", url: `${PUBLIC}/${listing.id}` })).statusCode, 404);

  await app.inject({ method: "PATCH", url: `${BASE}/listings/${listing.id}`, headers: h, payload: { is_active: true } });
  assert.equal((await app.inject({ method: "GET", url: PUBLIC })).json().services.length, 1);

  await app.inject({ method: "DELETE", url: `${BASE}/listings/${listing.id}`, headers: h });
  assert.equal((await app.inject({ method: "GET", url: PUBLIC })).json().services.length, 0);
});

test("browse filters and pages", async () => {
  const app = await getApp();
  const seller = await createUser();
  const pickupCat = await categoryId("airport_pickup");
  await createListing(seller.id, { title: "Airport run to the city", category_id: pickupCat });
  await createListing(seller.id, { title: "Maths tutoring", category_id: otherCat, currency: "GBP", price_minor: 2000 });
  await createListing(seller.id, { title: "Essay proofreading", category_id: otherCat });

  const byCategory = await app.inject({ method: "GET", url: `${PUBLIC}?category_id=${pickupCat}` });
  assert.equal(byCategory.json().services.length, 1);

  const bySearch = await app.inject({ method: "GET", url: `${PUBLIC}?search=tutoring` });
  assert.equal(bySearch.json().services.length, 1);
  assert.equal(bySearch.json().services[0].title, "Maths tutoring");

  const byCurrency = await app.inject({ method: "GET", url: `${PUBLIC}?currency=GBP` });
  assert.equal(byCurrency.json().services.length, 1);

  const paged = await app.inject({ method: "GET", url: `${PUBLIC}?limit=2&page=1` });
  assert.equal(paged.json().services.length, 2);
  assert.equal(paged.json().meta.total, 3);
  assert.equal(paged.json().meta.totalPages, 2);
});

// ── Placing and paying for an order ────────────────────────────────────────

test("a buyer orders a listing, and the price comes from the listing", async () => {
  const app = await getApp();
  const { seller, buyer, listing } = await scenario();

  const res = await app.inject({
    method: "POST",
    url: `${BASE}/orders`,
    headers: auth(buyer.id, buyer.email),
    payload: { listing_id: listing.id },
  });
  assert.equal(res.statusCode, 201);
  const order = res.json();
  assert.equal(order.status, "pending_payment");
  assert.equal(order.role, "buyer");
  // Snapshotted from the listing — the buyer never sends an amount.
  assert.equal(order.amount_minor, 5000);
  assert.equal(order.currency, "AUD");

  const row = await readOrder(order.id);
  assert.equal(row.provider_id, seller.id);

  // It shows up on both sides immediately.
  assert.equal((await app.inject({ method: "GET", url: `${BASE}/orders`, headers: auth(buyer.id, buyer.email) })).json().orders.length, 1);
  assert.equal(
    (await app.inject({ method: "GET", url: `${BASE}/received-orders`, headers: auth(seller.id, seller.email) })).json().orders.length,
    1,
  );
});

test("a client cannot name its own price, provider or status when ordering", async () => {
  const app = await getApp();
  const { buyer, listing } = await scenario();
  const attacker = await createUser();

  for (const forged of [{ amount_minor: 1 }, { currency: "GBP" }, { provider_id: attacker.id }, { status: "paid" }]) {
    const res = await app.inject({
      method: "POST",
      url: `${BASE}/orders`,
      headers: auth(buyer.id, buyer.email),
      payload: { listing_id: listing.id, ...forged },
    });
    assert.equal(res.statusCode, 400, `${JSON.stringify(forged)} should be rejected`);
  }
});

test("you cannot buy your own service, or one that is paused", async () => {
  const app = await getApp();
  const { seller, buyer, listing } = await scenario();

  const own = await app.inject({
    method: "POST",
    url: `${BASE}/orders`,
    headers: auth(seller.id, seller.email),
    payload: { listing_id: listing.id },
  });
  assert.equal(own.statusCode, 400);

  await app.inject({
    method: "PATCH",
    url: `${BASE}/listings/${listing.id}`,
    headers: auth(seller.id, seller.email),
    payload: { is_active: false },
  });
  const paused = await app.inject({
    method: "POST",
    url: `${BASE}/orders`,
    headers: auth(buyer.id, buyer.email),
    payload: { listing_id: listing.id },
  });
  assert.equal(paused.statusCode, 409);
});

test("pressing Buy twice resumes the same unpaid order instead of stacking rows", async () => {
  const app = await getApp();
  const { buyer, listing } = await scenario();
  const place = () =>
    app.inject({
      method: "POST",
      url: `${BASE}/orders`,
      headers: auth(buyer.id, buyer.email),
      payload: { listing_id: listing.id },
    });

  const first = (await place()).json();
  const second = (await place()).json();
  assert.equal(second.id, first.id);
  // Otherwise every abandoned checkout would separately block the seller from deleting the listing.
  assert.equal(await masterKnex("service_orders").count("id as c").first().then((r) => Number(r!.c)), 1);
});

test("checkout hands back somewhere to pay and binds the session to the order", async () => {
  const app = await getApp();
  const { buyer, listing } = await scenario();
  const order = (
    await app.inject({
      method: "POST",
      url: `${BASE}/orders`,
      headers: auth(buyer.id, buyer.email),
      payload: { listing_id: listing.id },
    })
  ).json();

  const checkout = await app.inject({
    method: "POST",
    url: `${BASE}/orders/${order.id}/checkout`,
    headers: auth(buyer.id, buyer.email),
  });
  assert.equal(checkout.statusCode, 200);
  const { url, session_id } = checkout.json();
  assert.ok(url.includes("/payment-success"), "should return somewhere that lands on the return page");
  assert.ok(url.includes(session_id), "the placeholder must be substituted, not passed through");
  assert.equal((await readOrder(order.id)).payment_session_id, session_id);

  // Only the buyer pays, and only while it is unpaid.
  const seller = await masterKnex("service_listings").where({ id: listing.id }).first();
  const asProvider = await app.inject({
    method: "POST",
    url: `${BASE}/orders/${order.id}/checkout`,
    headers: auth(seller!.provider_id, "provider@example.com"),
  });
  assert.equal(asProvider.statusCode, 403);
});

test("the whole buyer journey: order → pay → held → talk → review", async () => {
  const app = await getApp();
  const { seller, buyer, listing } = await scenario();
  const buyerH = auth(buyer.id, buyer.email);
  const sellerH = auth(seller.id, seller.email);

  // 1. Order it.
  const order = (
    await app.inject({ method: "POST", url: `${BASE}/orders`, headers: buyerH, payload: { listing_id: listing.id } })
  ).json();

  // 2. Pay — the dev driver hands back the return URL with a session encoding the real amount.
  const { session_id } = (
    await app.inject({ method: "POST", url: `${BASE}/orders/${order.id}/checkout`, headers: buyerH })
  ).json();

  // 3. Come back and settle.
  const verified = await app.inject({
    method: "POST",
    url: `${BASE}/orders/payment/verify`,
    headers: buyerH,
    payload: { session_id },
  });
  assert.equal(verified.json().already_verified, false);
  assert.equal((await readOrder(order.id)).status, "paid");
  assert.equal((await readListing(listing.id)).total_orders, 1);

  // 4. They sort out the details between themselves. This is what replaced dual confirmation.
  await app.inject({
    method: "POST",
    url: `${BASE}/orders/${order.id}/messages`,
    headers: buyerH,
    payload: { body: "Landing Tuesday 6am." },
  });
  const reply = await app.inject({
    method: "POST",
    url: `${BASE}/orders/${order.id}/messages`,
    headers: sellerH,
    payload: { body: "See you at arrivals." },
  });
  assert.equal(reply.statusCode, 201);

  // 5. The order stays held — nothing closes it now, and the refund path is the only way value moves back.
  assert.equal((await readOrder(order.id)).status, "paid");

  // 6. The buyer reviews, and it reaches the public listing as a verified purchase.
  const review = await app.inject({
    method: "POST",
    url: `${BASE}/listings/${listing.id}/reviews`,
    headers: buyerH,
    payload: { rating: 5, comment: "Spot on" },
  });
  assert.equal(review.json().is_verified_purchase, true);
  const publicView = await app.inject({ method: "GET", url: `${PUBLIC}/${listing.id}` });
  assert.equal(publicView.json().avg_rating, 5);
  assert.equal(publicView.json().total_reviews, 1);

  const publicReviews = await app.inject({ method: "GET", url: `${PUBLIC}/${listing.id}/reviews` });
  assert.equal(publicReviews.json().reviews.length, 1);
  assert.equal(publicReviews.json().reviews[0].comment, "Spot on");
  assert.equal(publicReviews.json().reviews[0].is_verified_purchase, true);
});

// ── Categories are administered data ───────────────────────────────────────

test("a listing can use any active category, and a retired one is refused", async () => {
  const app = await getApp();
  const seller = await createUser();
  const h = auth(seller.id, seller.email);

  // An admin adding a category makes it immediately usable — the old CHECK constraint made that impossible.
  const [fresh] = await masterKnex("service_categories")
    .insert({ slug: `test_cat_${Date.now()}`, name: "Bike Repair", is_active: true, scope: "personal" })
    .returning("*");

  const created = await app.inject({
    method: "POST",
    url: `${BASE}/listings`,
    headers: h,
    payload: { title: "Bike fix", category_id: fresh.id, price_minor: 1500 },
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.json().category_name, "Bike Repair");

  await masterKnex("service_categories").where({ id: fresh.id }).update({ is_active: false });
  const retired = await app.inject({
    method: "POST",
    url: `${BASE}/listings`,
    headers: h,
    payload: { title: "Another", category_id: fresh.id, price_minor: 1500 },
  });
  assert.equal(retired.statusCode, 400);

  // A category that does not exist at all is refused too, rather than reaching the FK as a 500.
  const missing = await app.inject({
    method: "POST",
    url: `${BASE}/listings`,
    headers: h,
    payload: { title: "Another", category_id: 999999, price_minor: 1500 },
  });
  assert.equal(missing.statusCode, 400);

  // A category with listings against it cannot be deleted — RESTRICT, so an admin has to retire it rather
  // than orphan live listings. This is why retiring exists as a separate concept.
  await assert.rejects(
    () => masterKnex("service_categories").where({ id: fresh.id }).del(),
    /violates|RESTRICT/i,
  );

  // Teardown: the listing goes first, then the category is deletable.
  await masterKnex("service_listings").where({ category_id: fresh.id }).del();
  await masterKnex("service_categories").where({ id: fresh.id }).del();
});

test("a business service category is not on offer to a person", async () => {
  const app = await getApp();
  const seller = await createUser();
  const h = auth(seller.id, seller.email);

  // service_categories serves two taxonomies. This one belongs to the business side, which has nothing to
  // do with Earn: a student must not be able to list under it, and must not even see it.
  const [business] = await masterKnex("service_categories")
    .insert({ slug: `biz_cat_${Date.now()}`, name: "Campus Catering Contracts", is_active: true, scope: "business" })
    .returning("*");

  const refused = await app.inject({
    method: "POST",
    url: `${BASE}/listings`,
    headers: h,
    payload: { title: "Catering", category_id: business.id, price_minor: 1500 },
  });
  assert.equal(refused.statusCode, 400);

  // Absent from the seller's picker and from the public marketplace filter — not merely rejected on submit.
  const meta = await app.inject({ method: "GET", url: `${BASE}/meta`, headers: h });
  const offered = meta.json().categories.map((c: { id: number }) => c.id);
  assert.ok(!offered.includes(business.id), "a business category must not be offered to a seller");
  assert.ok(offered.includes(otherCat), "the personal categories are still offered");

  const publicCats = await app.inject({ method: "GET", url: `${PUBLIC}/categories` });
  assert.ok(!publicCats.json().categories.some((c: { id: number }) => c.id === business.id));

  await masterKnex("service_categories").where({ id: business.id }).del();
});
