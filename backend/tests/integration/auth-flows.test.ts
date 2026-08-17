// Account flows: onboarding, admin invitations, business registration + context switching.
//
// Replaces the hand-rolled tests/auth.ts script (which needed a live server on :3000).
// Everything here runs through app.inject() against the real test database.

import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { dbAvailable, uniqueEmail } from "../helpers/db.js";
import { waitForOtp, type PublishedEmail } from "../helpers/mail-capture.js";

const { published, offlineQueues } = vi.hoisted(() => ({
  published: [] as PublishedEmail[],
  // Queues that should behave as if LavinMQ were down, to exercise fallback paths.
  offlineQueues: new Set<string>(),
}));

vi.mock("../../src/shared/queue/queueService.js", () => ({
  queueService: {
    publish: async (queue: string, message: unknown) => {
      if (offlineQueues.has(queue)) throw new Error(`queue unavailable: ${queue}`);
      published.push({ queue, message } as PublishedEmail);
    },
  },
  default: {},
}));

const describeDb = describe.skipIf(!dbAvailable);

describeDb("account flows", () => {
  let app: FastifyInstance;
  let masterKnex: import("knex").Knex;
  let shutdownPools: () => Promise<void>;
  let countryId: number;

  beforeAll(async () => {
    const { buildTestApp } = await import("../helpers/app.js");
    ({ masterKnex } = await import("../../src/core/db/master-pool.js"));
    ({ shutdownAll: shutdownPools } = await import("../../src/core/db/pool-manager.js"));
    app = await buildTestApp({ modules: true });

    const country = await masterKnex("countries").orderBy("id").first();
    expect(country, "countries reference data must be seeded").toBeTruthy();
    countryId = country.id;
  });

  afterAll(async () => {
    await app?.close();
    await shutdownPools?.();
    await masterKnex?.destroy();
  });

  beforeEach(() => {
    published.length = 0;
    offlineQueues.clear();
  });

  // ── helpers ──

  async function login(email: string) {
    const sent = await app.inject({ method: "POST", url: "/api/v3/auth/send-otp", payload: { email } });
    expect(sent.statusCode).toBe(200);
    const otp = await waitForOtp(published, email);
    const res = await app.inject({
      method: "POST",
      url: "/api/v3/auth/verify-otp",
      payload: { email, otp },
    });
    expect(res.statusCode).toBe(200);
    return res.json();
  }

  async function registerAndVerify(prefix: string) {
    const email = uniqueEmail(prefix);
    const reg = await app.inject({
      method: "POST",
      url: "/api/v3/auth/register",
      payload: { first_name: "Flow", last_name: "Tester", email },
    });
    expect(reg.statusCode).toBe(201);
    const otp = await waitForOtp(published, email);
    const res = await app.inject({
      method: "POST",
      url: "/api/v3/auth/verify-otp",
      payload: { email, otp },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    return { email, userId: body.user.id as number, accessToken: body.access_token as string };
  }

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  // ── 1. personal onboarding ──

  describe("personal onboarding", () => {
    it("stores the profile for an activated personal account", async () => {
      const user = await registerAndVerify("onboard");

      const res = await app.inject({
        method: "POST",
        url: "/api/v3/platform-users/me/onboarding/personal",
        headers: auth(user.accessToken),
        payload: {
          individual_category: "student",
          nationality_id: countryId,
          country_of_residence_id: countryId,
          city_of_residence: "Sydney",
          date_of_birth: "2000-01-01",
          gender: "male",
          degree_level: "Bachelor",
        },
      });

      expect(res.statusCode).toBe(201);

      const profile = await masterKnex("platform_user_profiles")
        .where({ user_id: user.userId })
        .first();
      expect(profile).toBeTruthy();
      expect(profile.city_of_residence).toBe("Sydney");
    });

    it("rejects onboarding without a token", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v3/platform-users/me/onboarding/personal",
        payload: { individual_category: "student" },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ── 2. admin invitations ──

  describe("admin invitations", () => {
    let superAdminToken: string;
    let superAdminEmail: string;

    beforeAll(async () => {
      const user = await registerAndVerify("superadmin");
      superAdminEmail = user.email;
      await masterKnex("superadmin.admin_users").insert({
        platform_user_id: user.userId,
        role: "super_admin",
        is_active: true,
      });
    });

    it("logs an admin in through the same unified OTP flow", async () => {
      const body = await login(superAdminEmail);
      expect(body.user.type).toBe("admin");
      expect(body.user.role).toBe("super_admin");
      superAdminToken = body.access_token;
    });

    /** Invite an admin and return the accept token. */
    async function invite(email: string, role = "admin") {
      const res = await app.inject({
        method: "POST",
        url: "/api/v3/admin/users/invite",
        headers: auth(superAdminToken),
        payload: { email, first_name: "New", last_name: "Admin", role },
      });
      expect(res.statusCode).toBe(201);
      const token = res.json().invite_token;
      expect(token).toBeTypeOf("string");
      return token;
    }

    it("hands the admin role-link off to a worker when the queue is up", async () => {
      const email = uniqueEmail("invited-queued");
      const token = await invite(email);

      const accept = await app.inject({
        method: "POST",
        url: "/api/v3/admin/users/invite/accept",
        payload: { token },
      });
      expect(accept.statusCode).toBe(200);

      const job = published.find((p) => p.queue === "admin_invitation_accept");
      expect(job, "accepting an invitation must enqueue the role-link job").toBeTruthy();
      expect(job!.message).toMatchObject({ role: "admin" });

      // The platform user exists but stays a plain user until the worker runs.
      const user = await masterKnex("platform_users").where({ email }).first();
      expect(user).toBeTruthy();
      const admin = await masterKnex("superadmin.admin_users")
        .where({ platform_user_id: user.id })
        .first();
      expect(admin).toBeUndefined();
    });

    it("creates the admin inline when the queue is down, and the invitee can log in as admin", async () => {
      const email = uniqueEmail("invited-inline");
      const token = await invite(email);

      offlineQueues.add("admin_invitation_accept");
      const accept = await app.inject({
        method: "POST",
        url: "/api/v3/admin/users/invite/accept",
        payload: { token },
      });
      expect(accept.statusCode).toBe(200);
      offlineQueues.clear();

      const invitation = await masterKnex("superadmin.admin_invitations")
        .where({ email })
        .first();
      expect(invitation.status).not.toBe("pending");

      const body = await login(email);
      expect(body.user.type).toBe("admin");
      expect(body.user.role).toBe("admin");
    });

    it("refuses an invitation from a non-admin caller", async () => {
      const plain = await registerAndVerify("not-admin");
      const res = await app.inject({
        method: "POST",
        url: "/api/v3/admin/users/invite",
        headers: auth(plain.accessToken),
        payload: { email: uniqueEmail("nope"), first_name: "N", last_name: "O", role: "admin" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("rejects an unknown invitation token", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v3/admin/users/invite/accept",
        payload: { token: "definitely-not-a-real-token" },
      });
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      expect(res.statusCode).toBeLessThan(500);
    });
  });

  // ── 3. business registration + account switching ──

  describe("business registration and account switching", () => {
    let owner: Awaited<ReturnType<typeof registerAndVerify>>;
    let orgId: string;
    let businessToken: string;
    const subdomain = `test-corp-${Date.now().toString(36)}`;

    beforeAll(async () => {
      owner = await registerAndVerify("biz-owner");
    });

    it("provisions a business and returns its org id", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v3/businesses/register",
        headers: auth(owner.accessToken),
        payload: { business_name: "Test Corp", subdomain },
      });

      expect(res.statusCode).toBe(201);
      const org = res.json().org;
      expect(org.business_name).toBe("Test Corp");
      expect(org.org_id).toBeTypeOf("string");
      orgId = org.org_id;
    });

    it("rejects a duplicate subdomain with 409", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v3/businesses/register",
        headers: auth(owner.accessToken),
        payload: { business_name: "Copycat", subdomain },
      });
      expect(res.statusCode).toBe(409);
    });

    it("lists the business on /auth/me with the owner role", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v3/auth/me",
        headers: auth(owner.accessToken),
      });
      expect(res.statusCode).toBe(200);

      const businesses = res.json().user.businesses ?? [];
      const found = businesses.find((b: { org_id: string }) => b.org_id === orgId);
      expect(found, "registered business should appear on /auth/me").toBeTruthy();
      expect(found.role).toBe("owner");
    });

    it("issues a business-scoped token via switch-account", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v3/auth/switch-account",
        headers: auth(owner.accessToken),
        payload: { org_id: orgId },
      });
      expect(res.statusCode).toBe(200);
      businessToken = res.json().access_token;
      expect(businessToken).toBeTypeOf("string");
      expect(businessToken).not.toBe(owner.accessToken);
    });

    it("serves the business profile in business context", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v3/businesses/me",
        headers: auth(businessToken),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().business_name).toBe("Test Corp");
    });

    it("reports the business context on /auth/me when scoped", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v3/auth/me",
        headers: auth(businessToken),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().user.orgId).toBe(orgId);
      expect(res.json().user.orgRole).toBe("owner");
    });

    it("refuses business routes without business context", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v3/businesses/me",
        headers: auth(owner.accessToken),
      });
      expect(res.statusCode).toBe(403);
    });

    it("seeds exactly one owner agent in the new tenant schema", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v3/agents",
        headers: auth(businessToken),
      });
      expect(res.statusCode).toBe(200);
      const agents = res.json().data;
      expect(agents).toHaveLength(1);
      expect(agents[0].is_owner).toBe(true);
      expect(agents[0].role).toBe("owner");
    });

    it("seeds the five default roles in the new tenant schema", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v3/agents/roles",
        headers: auth(businessToken),
      });
      expect(res.statusCode).toBe(200);
      const roles = res.json();
      expect(roles).toHaveLength(5);
      expect(roles.map((r: { name: string }) => r.name).sort()).toEqual(
        ["admin", "counsellor", "manager", "member", "owner"],
      );
    });

    it("refuses to switch into a business the user does not belong to", async () => {
      const stranger = await registerAndVerify("stranger");
      const res = await app.inject({
        method: "POST",
        url: "/api/v3/auth/switch-account",
        headers: auth(stranger.accessToken),
        payload: { org_id: orgId },
      });
      expect(res.statusCode).toBe(401);
    });
  });
});
