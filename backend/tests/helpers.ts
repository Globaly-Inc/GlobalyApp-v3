/**
 * Test harness. Runs against a scratch database (DB_NAME=globalyapp_test) so nothing here can touch dev
 * data. Requests go through app.inject() with a real signed JWT, so the auth plugin, the zod schemas and
 * the route handlers are all exercised — these are not unit tests of the services.
 */

import Fastify from "fastify";
import jwt from "jsonwebtoken";
import { config } from "../src/config.js";
import { masterKnex } from "../src/core/db/master-pool.js";
import { errorHandlerPlugin } from "../src/core/plugins/error-handler.plugin.js";
import { requestContextPlugin } from "../src/core/plugins/request-context.plugin.js";
import { authPlugin } from "../src/core/plugins/auth.plugin.js";
import platformUsersModule from "../src/modules/platform-users/index.js";
import feedModule from "../src/modules/feed/index.js";
import notificationsModule from "../src/modules/notifications/index.js";
import personalHomeModule from "../src/modules/personal-home/index.js";
import filesModule from "../src/modules/files/index.js";
import servicesModule from "../src/modules/services/index.js";
import multipart from "@fastify/multipart";

/**
 * A lean app with the same core plugins and the modules under test — deliberately not the full
 * buildServer(), which also starts the pool-eviction timer, the queue workers and the extraction module.
 * Those would keep the test process alive and make these tests depend on LavinMQ being up.
 */
async function buildTestApp() {
  const app = Fastify({ logger: false });
  await app.register(multipart);
  await app.register(errorHandlerPlugin);
  await app.register(requestContextPlugin);
  await app.register(authPlugin);
  await app.register(platformUsersModule);
  await app.register(feedModule);
  await app.register(notificationsModule);
  await app.register(personalHomeModule);
  await app.register(filesModule);
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

/** Wipe every table these tests write to. Order respects FKs. */
export async function resetDb() {
  await masterKnex.raw(`
    TRUNCATE uploaded_files, feed_reactions, feed_posts, enquiries, user_favorites, notifications,
             business_invitation_index, user_business_index,
             service_reviews, service_orders, service_listings,
             platform_user_work_experiences, platform_user_language_tests,
             platform_user_qualifications, platform_user_profiles, platform_users,
             businesses, institutions
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

export async function createProfile(userId: number, overrides: Record<string, unknown> = {}) {
  const [profile] = await masterKnex("platform_user_profiles")
    .insert({ user_id: userId, onboarding_completed: true, ...overrides })
    .returning("*");
  return profile;
}

export async function createBusiness(overrides: Record<string, unknown> = {}) {
  const owner = overrides.owner_id ? { id: overrides.owner_id as number } : await createUser();
  const [business] = await masterKnex("businesses")
    .insert({
      owner_id: owner.id,
      business_name: "Northbridge Education",
      subdomain: `biz-${Date.now()}-${Math.round(performance.now() * 1000)}`,
      schema_name: crypto.randomUUID(),
      account_status: 1,
      ...overrides,
    })
    .returning("*");
  return business as { id: number; schema_name: string; business_name: string };
}

export async function addMembership(userId: number, businessId: number, extra: Record<string, unknown> = {}) {
  const [row] = await masterKnex("user_business_index")
    .insert({ platform_user_id: userId, business_id: businessId, role: "member", is_owner: false, ...extra })
    .returning("*");
  return row as { id: number };
}

export async function createPost(authorId: number, overrides: Record<string, unknown> = {}) {
  const [post] = await masterKnex("feed_posts")
    .insert({ author_platform_user_id: authorId, content: "hello", post_type: "social", visibility: "everyone", ...overrides })
    .returning("*");
  return post as { id: number };
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
 * phase does not build (see the PRD's scope). Everything downstream of an order existing is what these
 * tests cover, so the fixture is the order itself.
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
