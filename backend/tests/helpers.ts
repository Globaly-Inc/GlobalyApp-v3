/**
 * Test harness. Runs against a scratch database (DB_NAME=globalyapp_test) so nothing here can touch dev
 * data. Requests go through app.inject() with a real signed JWT, so the auth plugin, the zod schemas and the
 * route handlers are all exercised — these are not unit tests of the services.
 *
 * Create the scratch DB once, then migrate it:
 *   createdb globalyapp_test
 *   DB_NAME=globalyapp_test node --import tsx node_modules/knex/bin/cli.js \
 *     migrate:latest --knexfile knexfile.ts --env globalyapp
 */

import Fastify from "fastify";
import jwt from "jsonwebtoken";
import multipart from "@fastify/multipart";
import { config } from "../src/config.js";
import { masterKnex } from "../src/core/db/master-pool.js";
import { errorHandlerPlugin } from "../src/core/plugins/error-handler.plugin.js";
import { requestContextPlugin } from "../src/core/plugins/request-context.plugin.js";
import { authPlugin } from "../src/core/plugins/auth.plugin.js";
import platformUsersModule from "../src/modules/platform-users/index.js";
import servicesModule from "../src/modules/services/index.js";

/**
 * A lean app with the same core plugins and the modules under test — deliberately not the full
 * buildServer(), which also starts the pool-eviction timer and the queue-backed modules. Those would keep
 * the test process alive and make these tests depend on LavinMQ being up.
 */
async function buildTestApp() {
  const app = Fastify({ logger: false });
  await app.register(multipart);
  await app.register(errorHandlerPlugin);
  await app.register(requestContextPlugin);
  await app.register(authPlugin);
  await app.register(platformUsersModule);
  await app.register(servicesModule);
  return app;
}

export { masterKnex };

export function tokenFor(userId: number, email = `user${userId}@example.com`) {
  return jwt.sign({ sub: String(userId), type: "platform_user", email }, config.JWT_SECRET, { expiresIn: "1h" });
}

export function auth(userId: number, email?: string) {
  return { authorization: `Bearer ${tokenFor(userId, email)}` };
}

let app: Awaited<ReturnType<typeof buildTestApp>> | null = null;

export async function getApp() {
  app ??= await buildTestApp();
  await app.ready();
  return app;
}

export async function closeApp() {
  if (app) await app.close();
  app = null;
  await masterKnex.destroy();
}

/** Wipe every table these tests write to. Order respects FKs; CASCADE covers the rest. */
export async function resetDb() {
  await masterKnex.raw(`
    TRUNCATE uploaded_files,
             service_reviews, service_orders, service_listings,
             platform_user_work_experiences, platform_user_language_tests,
             platform_user_qualifications, platform_user_profiles, platform_users
    RESTART IDENTITY CASCADE
  `);
}

export async function createUser(overrides: Record<string, unknown> = {}) {
  const [user] = await masterKnex("platform_users")
    .insert({
      first_name: "Test",
      last_name: "User",
      email: overrides.email ?? `user-${Date.now()}-${Math.round(performance.now() * 1000)}@example.com`,
      account_status: 1,
      is_personal_account: true,
      ...overrides,
    })
    .returning("*");
  return user as { id: number; email: string; uuid: string };
}

/**
 * A country with one city in it, addressed by `slot` so a test can ask for two distinct ones.
 *
 * Find-or-create, not insert. `countries` and `cities` are shared reference data — seeded by
 * countries_seeder and read by other features — so resetDb deliberately does NOT truncate them. An
 * insert-only fixture therefore collides with itself on the second run, and a random one quietly
 * accumulates rows forever. The Q-prefixed codes are not real ISO codes, so they cannot clash with seeded
 * data either.
 */
export async function createCountryWithCity(slot: 1 | 2 = 1, cityName = "Testville") {
  const iso2 = `Q${slot}`;
  const country =
    (await masterKnex("countries").where({ iso2 }).first()) ??
    (
      await masterKnex("countries")
        .insert({ name: `Test Country ${iso2}`, iso2, iso3: `Q${slot}X` })
        .returning("*")
    )[0];
  const city =
    (await masterKnex("cities").where({ country_id: country.id, name: cityName }).first()) ??
    (await masterKnex("cities").insert({ country_id: country.id, name: cityName }).returning("*"))[0];
  return {
    country: country as { id: number; name: string },
    city: city as { id: number; name: string },
  };
}

export async function createListing(providerId: number, overrides: Record<string, unknown> = {}) {
  const [listing] = await masterKnex("service_listings")
    .insert({
      provider_id: providerId,
      title: "Airport Pickup — Sydney",
      category: "airport_pickup",
      price_minor: 5000, // $50.00
      currency: "AUD",
      ...overrides,
    })
    .returning("*");
  return listing as { id: number; price_minor: number; currency: string };
}

/**
 * Insert an order directly.
 *
 * There is no order-creation endpoint — a buyer acquires a service on the public marketplace, which this
 * phase does not build (see the PRD's scope). Everything downstream of an order existing is what these tests
 * cover, so the fixture is the order itself.
 */
export async function createOrder(
  listing: { id: number; price_minor: number; currency: string },
  buyerId: number,
  providerId: number,
  overrides: Record<string, unknown> = {},
) {
  const [order] = await masterKnex("service_orders")
    .insert({
      listing_id: listing.id,
      buyer_id: buyerId,
      provider_id: providerId,
      amount_minor: listing.price_minor,
      currency: listing.currency,
      status: "pending_payment",
      ...overrides,
    })
    .returning("*");
  return order as {
    id: number;
    amount_minor: number;
    currency: string;
    status: string;
    payment_session_id: string | null;
    payment_intent_id: string | null;
  };
}

/** Read an order row straight from the DB, to assert what an endpoint actually persisted. */
export async function readOrder(id: number) {
  return masterKnex("service_orders").where({ id }).first() as Promise<Record<string, unknown>>;
}

export async function readListing(id: number) {
  return masterKnex("service_listings").where({ id }).first() as Promise<Record<string, unknown>>;
}
