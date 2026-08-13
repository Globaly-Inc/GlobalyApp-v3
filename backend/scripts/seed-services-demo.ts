/**
 * Dev-only demo data for Earn → My Services.
 *
 * Nothing creates orders in this phase — a buyer acquires a service on the public marketplace, which is not
 * built yet — so the My Purchases and Received Orders tabs have nothing to show against a fresh account.
 * This seeds orders across every status so the whole post-order lifecycle can be walked in a browser.
 *
 * Run:  node --import tsx scripts/seed-services-demo.ts --email=you@example.com
 *
 * A standalone script, not a knex seeder: seeders run as a batch via `npm run seed:globalyapp` and this must
 * never fire as a side effect of seeding reference data. It is idempotent — re-running replaces the demo rows
 * it created rather than stacking more.
 *
 * ponytail: writes rows directly instead of going through the API, because half these states have no
 * endpoint that can produce them (that is the point). Never point this at production.
 */

import "dotenv/config";
import { config } from "../src/config.js";
import { masterKnex } from "../src/core/db/master-pool.js";
import { makeDevSessionId } from "../src/modules/services/payments/dev-driver.js";

const TAG = "[services-demo]";

if (config.NODE_ENV === "production") {
  console.error(`${TAG} refusing to run with NODE_ENV=production`);
  process.exit(1);
}

const emailArg = process.argv.find((a) => a.startsWith("--email="))?.slice("--email=".length);

async function main() {
  // ── The account under test ──
  const me = emailArg
    ? await masterKnex("platform_users").whereRaw("lower(email) = lower(?)", [emailArg]).first()
    : await masterKnex("platform_users").orderBy("id").first();

  if (!me) {
    console.error(
      emailArg
        ? `${TAG} no platform_users row for ${emailArg} — sign in once first, then re-run`
        : `${TAG} no platform_users rows at all — sign in once first, then re-run`,
    );
    process.exit(1);
  }
  console.log(`${TAG} seeding for ${me.email} (id ${me.id})`);

  // ── Counterparties ──
  // Two of them: one buys from me (fills Received Orders), one sells to me (fills My Purchases).
  const counterparty = async (email: string, firstName: string) => {
    const existing = await masterKnex("platform_users").whereRaw("lower(email) = lower(?)", [email]).first();
    if (existing) return existing;
    const [created] = await masterKnex("platform_users")
      .insert({
        first_name: firstName,
        last_name: "Demo",
        email,
        account_status: 1,
        is_personal_account: true,
      })
      .returning("*");
    return created;
  };

  const buyer = await counterparty("demo-buyer@globaly.test", "Priya");
  const otherSeller = await counterparty("demo-seller@globaly.test", "Marco");

  // ── Reset only what this script previously created ──
  const demoTitles = [
    "Airport Pickup — Sydney",
    "Assignment Help — Statistics",
    "Rental Support — Inner West",
    "City Orientation — Melbourne CBD",
  ];
  const priorListings = await masterKnex("service_listings")
    .whereIn("provider_id", [me.id, otherSeller.id])
    .whereIn("title", demoTitles)
    .pluck("id");
  if (priorListings.length) {
    await masterKnex("service_reviews").whereIn("listing_id", priorListings).del();
    await masterKnex("service_orders").whereIn("listing_id", priorListings).del();
    await masterKnex("service_listings").whereIn("id", priorListings).del();
    console.log(`${TAG} cleared ${priorListings.length} previously seeded listing(s)`);
  }

  const listing = async (providerId: number, title: string, category: string, priceMinor: number, currency: string) => {
    const [row] = await masterKnex("service_listings")
      .insert({ provider_id: providerId, title, category, price_minor: priceMinor, currency, is_active: true })
      .returning("*");
    return row as { id: number; price_minor: number; currency: string; title: string };
  };

  // Mine — one AUD, one GBP so the summary shows two currency buckets that are never summed together.
  const pickup = await listing(me.id, demoTitles[0], "airport_pickup", 5000, "AUD");
  const tutoring = await listing(me.id, demoTitles[1], "assignment_help", 3500, "GBP");
  // Someone else's, so I appear as a buyer on it.
  const rental = await listing(otherSeller.id, demoTitles[2], "rental_support", 12000, "AUD");
  const orientation = await listing(otherSeller.id, demoTitles[3], "city_orientation", 2500, "AUD");

  const order = async (
    l: { id: number; price_minor: number; currency: string },
    buyerId: number,
    providerId: number,
    extra: Record<string, unknown>,
  ) => {
    const [row] = await masterKnex("service_orders")
      .insert({
        listing_id: l.id,
        buyer_id: buyerId,
        provider_id: providerId,
        amount_minor: l.price_minor,
        currency: l.currency,
        ...extra,
      })
      .returning("*");
    return row as { id: number };
  };

  const held = (l: { price_minor: number; currency: string }) => ({
    status: "paid",
    paid_at: new Date(),
    payment_provider: "dev",
    payment_session_id: makeDevSessionId({ amountMinor: l.price_minor, currency: l.currency }),
    payment_intent_id: `pi_dev_${Math.random().toString(36).slice(2, 10)}`,
  });

  // ── Received Orders (I am the provider) ──
  const awaitingMe = await order(pickup, buyer.id, me.id, { ...held(pickup), buyer_confirmed: true });
  const awaitingThem = await order(pickup, buyer.id, me.id, { ...held(pickup), provider_confirmed: true });
  const closed = await order(tutoring, buyer.id, me.id, {
    status: "completed",
    paid_at: new Date(),
    completed_at: new Date(),
    buyer_confirmed: true,
    provider_confirmed: true,
    payment_provider: "dev",
    payment_intent_id: `pi_dev_${Math.random().toString(36).slice(2, 10)}`,
  });
  const unpaid = await order(pickup, buyer.id, me.id, { status: "pending_payment" });

  // ── My Purchases (I am the buyer) ──
  const iOweConfirmation = await order(rental, me.id, otherSeller.id, { ...held(rental) });
  const toReview = await order(orientation, me.id, otherSeller.id, {
    status: "completed",
    paid_at: new Date(),
    completed_at: new Date(),
    buyer_confirmed: true,
    provider_confirmed: true,
    payment_provider: "dev",
    payment_intent_id: `pi_dev_${Math.random().toString(36).slice(2, 10)}`,
  });
  const inDispute = await order(rental, me.id, otherSeller.id, {
    ...held(rental),
    status: "disputed",
    notes: `[${new Date().toISOString()}] Problem reported: Keys were never handed over`,
  });

  // A payment waiting to be verified, so /payment-success can be walked for real.
  const pendingSession = makeDevSessionId({ amountMinor: orientation.price_minor, currency: orientation.currency });
  const awaitingReturn = await order(orientation, me.id, otherSeller.id, {
    status: "pending_payment",
    payment_provider: "dev",
    payment_session_id: pendingSession,
  });

  // ...and one whose session disagrees with the order, so the reconciliation can be seen refusing a payment
  // rather than only being asserted in a test.
  const mismatchedSession = makeDevSessionId({ amountMinor: 99_900, currency: orientation.currency });
  const shouldFail = await order(orientation, me.id, otherSeller.id, {
    status: "pending_payment",
    payment_provider: "dev",
    payment_session_id: mismatchedSession,
  });

  console.log(`
${TAG} done.

  Received Orders (you are the provider)
    #${awaitingMe.id}   Payment held — buyer confirmed, awaiting YOU
    #${awaitingThem.id}   Payment held — you confirmed, awaiting the buyer
    #${closed.id}   Completed (GBP)
    #${unpaid.id}   Pending payment — cancellable

  My Purchases (you are the buyer)
    #${iOweConfirmation.id}   Payment held — awaiting YOU
    #${toReview.id}   Completed and unreviewed — leave a review
    #${inDispute.id}   Disputed — read-only

  Payment return, walk these in the browser:
    verifies : /personal/earn/services/payment-success?session_id=${pendingSession}
               (reload it — it must still read as success, and order #${awaitingReturn.id} must count once)
    refuses  : /personal/earn/services/payment-success?session_id=${mismatchedSession}
               (amount disagrees with order #${shouldFail.id} — must fail, not succeed)
`);
}

try {
  await main();
} finally {
  await masterKnex.destroy();
}
