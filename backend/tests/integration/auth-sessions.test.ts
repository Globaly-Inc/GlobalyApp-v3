// Session lifecycle — refresh rotation, reuse rejection, logout vs logout-all.
// Spec: plan §7.2. Real Postgres, Fastify inject, no live server.

import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { dbAvailable, uniqueEmail } from "../helpers/db.js";
import { waitForOtp, type PublishedEmail } from "../helpers/mail-capture.js";

const { published } = vi.hoisted(() => ({ published: [] as PublishedEmail[] }));

vi.mock("../../src/shared/queue/queueService.js", () => ({
  queueService: {
    publish: async (queue: string, message: unknown) => {
      published.push({ queue, message } as PublishedEmail);
    },
  },
  default: {},
}));

const describeDb = describe.skipIf(!dbAvailable);

describeDb("auth sessions", () => {
  let app: FastifyInstance;
  let masterKnex: import("knex").Knex;

  interface Login {
    email: string;
    userId: number;
    accessToken: string;
    refreshToken: string;
  }

  beforeAll(async () => {
    const { buildTestApp } = await import("../helpers/app.js");
    ({ masterKnex } = await import("../../src/core/db/master-pool.js"));
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app?.close();
    await masterKnex?.destroy();
  });

  beforeEach(() => {
    published.length = 0;
  });

  async function registerAndLogin(prefix: string): Promise<Login> {
    const email = uniqueEmail(prefix);
    const reg = await app.inject({
      method: "POST",
      url: "/api/v3/auth/register",
      payload: { first_name: "Session", last_name: "Tester", email },
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
    return {
      email,
      userId: body.user.id,
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
    };
  }

  /** Log the same user in again — a second device. */
  async function loginAgain(email: string): Promise<{ accessToken: string; refreshToken: string }> {
    const sent = await app.inject({
      method: "POST",
      url: "/api/v3/auth/send-otp",
      payload: { email },
    });
    expect(sent.statusCode).toBe(200);
    const otp = await waitForOtp(published, email);

    const res = await app.inject({
      method: "POST",
      url: "/api/v3/auth/verify-otp",
      payload: { email, otp },
    });
    expect(res.statusCode).toBe(200);
    return { accessToken: res.json().access_token, refreshToken: res.json().refresh_token };
  }

  const refresh = (refreshToken: string) =>
    app.inject({ method: "POST", url: "/api/v3/auth/refresh", payload: { refresh_token: refreshToken } });

  const sessionCount = async (userId: number) => {
    const rows = await masterKnex("auth_sessions").where({ platform_user_id: userId });
    return rows.length;
  };

  // ── rotation ──

  describe("refresh", () => {
    it("rotates the refresh token and issues a fresh access token", async () => {
      const login = await registerAndLogin("rotate");

      const res = await refresh(login.refreshToken);
      expect(res.statusCode).toBe(200);

      const body = res.json();
      expect(body.refresh_token).toBeTypeOf("string");
      expect(body.refresh_token).not.toBe(login.refreshToken);
      expect(body.access_token).toBeTypeOf("string");

      // Rotation reuses the session row rather than piling up new ones.
      expect(await sessionCount(login.userId)).toBe(1);

      // The new token works.
      const again = await refresh(body.refresh_token);
      expect(again.statusCode).toBe(200);
      expect(again.json().refresh_token).not.toBe(body.refresh_token);
    });

    it("rejects a stale refresh token that was already rotated away", async () => {
      const login = await registerAndLogin("stale");
      const rotated = await refresh(login.refreshToken);
      expect(rotated.statusCode).toBe(200);

      const replay = await refresh(login.refreshToken);
      expect(replay.statusCode).toBe(401);
      expect(replay.json().error).toMatch(/invalid refresh token/i);
    });

    it("treats a replayed token as theft and drops every session for that user", async () => {
      const login = await registerAndLogin("reuse");
      await loginAgain(login.email);
      expect(await sessionCount(login.userId)).toBe(2);

      const rotated = await refresh(login.refreshToken);
      expect(rotated.statusCode).toBe(200);

      const replay = await refresh(login.refreshToken);
      expect(replay.statusCode).toBe(401);
      expect(await sessionCount(login.userId)).toBe(0);

      // Even the freshly rotated token is dead after reuse detection.
      expect((await refresh(rotated.json().refresh_token)).statusCode).toBe(401);
    });

    it("rejects a malformed refresh token without touching existing sessions", async () => {
      const login = await registerAndLogin("garbage");

      const res = await refresh("not-a-real-token");
      expect(res.statusCode).toBe(401);
      expect(await sessionCount(login.userId)).toBe(1);
      expect((await refresh(login.refreshToken)).statusCode).toBe(200);
    });
  });

  // ── session records ──

  describe("session records", () => {
    it.each([
      ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148", "Mobile"],
      ["Mozilla/5.0 (X11; Linux) Chrome/120.0", "Chrome"],
      ["Mozilla/5.0 (X11; Linux) Firefox/121.0", "Firefox"],
      ["Mozilla/5.0 (Macintosh) Version/17.0 Safari/605.1.15", "Safari"],
      ["curl/8.4.0", "Unknown"],
    ])("labels the device from user-agent %#", async (userAgent, expected) => {
      const email = uniqueEmail("device");
      await app.inject({
        method: "POST",
        url: "/api/v3/auth/register",
        payload: { first_name: "Device", last_name: "Tester", email },
      });
      const otp = await waitForOtp(published, email);

      const res = await app.inject({
        method: "POST",
        url: "/api/v3/auth/verify-otp",
        payload: { email, otp },
        headers: { "user-agent": userAgent },
        remoteAddress: "203.0.113.7",
      });
      expect(res.statusCode).toBe(200);

      const session = await masterKnex("auth_sessions")
        .where({ platform_user_id: res.json().user.id })
        .first();
      expect(session.device_label).toBe(expected);
      expect(session.ip_address).toBe("203.0.113.7");
    });

    it("records no device label when the client sends no user-agent", async () => {
      const email = uniqueEmail("no-ua");
      await app.inject({
        method: "POST",
        url: "/api/v3/auth/register",
        payload: { first_name: "Bare", last_name: "Client", email },
      });
      const otp = await waitForOtp(published, email);

      const res = await app.inject({
        method: "POST",
        url: "/api/v3/auth/verify-otp",
        payload: { email, otp },
        headers: { "user-agent": "" },
      });
      expect(res.statusCode).toBe(200);

      const session = await masterKnex("auth_sessions")
        .where({ platform_user_id: res.json().user.id })
        .first();
      expect(session.device_label).toBeNull();
    });

    it("rejects and deletes a session whose expiry has passed", async () => {
      const login = await registerAndLogin("expired-session");

      await masterKnex("auth_sessions")
        .where({ platform_user_id: login.userId })
        .update({ expires_at: new Date(Date.now() - 60_000) });

      const res = await refresh(login.refreshToken);
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toMatch(/session expired/i);
      expect(await sessionCount(login.userId)).toBe(0);
    });

    it("still refreshes when the client IP changed, and records the new IP", async () => {
      const email = uniqueEmail("roaming");
      await app.inject({
        method: "POST",
        url: "/api/v3/auth/register",
        payload: { first_name: "Roam", last_name: "Tester", email },
      });
      const otp = await waitForOtp(published, email);
      const login = await app.inject({
        method: "POST",
        url: "/api/v3/auth/verify-otp",
        payload: { email, otp },
        headers: { "user-agent": "Chrome/120.0" },
        remoteAddress: "198.51.100.1",
      });
      const userId = login.json().user.id;

      const res = await app.inject({
        method: "POST",
        url: "/api/v3/auth/refresh",
        payload: { refresh_token: login.json().refresh_token },
        headers: { "user-agent": "Chrome/120.0" },
        remoteAddress: "198.51.100.99",
      });
      expect(res.statusCode).toBe(200);

      const session = await masterKnex("auth_sessions").where({ platform_user_id: userId }).first();
      expect(session.ip_address).toBe("198.51.100.99");
    });
  });

  // ── logout ──

  describe("logout", () => {
    it("kills only the session whose refresh token is supplied", async () => {
      const first = await registerAndLogin("logout-one");
      const second = await loginAgain(first.email);
      expect(await sessionCount(first.userId)).toBe(2);

      const res = await app.inject({
        method: "POST",
        url: "/api/v3/auth/logout",
        headers: { authorization: `Bearer ${first.accessToken}` },
        payload: { refresh_token: first.refreshToken },
      });
      expect(res.statusCode).toBe(204);
      expect(await sessionCount(first.userId)).toBe(1);

      // The other device is untouched.
      expect((await refresh(second.refreshToken)).statusCode).toBe(200);
    });

    it("kills every session for the user when no refresh token is supplied", async () => {
      const first = await registerAndLogin("logout-all");
      const second = await loginAgain(first.email);
      const third = await loginAgain(first.email);
      expect(await sessionCount(first.userId)).toBe(3);

      const res = await app.inject({
        method: "POST",
        url: "/api/v3/auth/logout",
        headers: { authorization: `Bearer ${first.accessToken}` },
        payload: {},
      });
      expect(res.statusCode).toBe(204);
      expect(await sessionCount(first.userId)).toBe(0);

      for (const token of [first.refreshToken, second.refreshToken, third.refreshToken]) {
        expect((await refresh(token)).statusCode).toBe(401);
      }
    });

    it("leaves other users' sessions alone", async () => {
      const alice = await registerAndLogin("logout-alice");
      const bob = await registerAndLogin("logout-bob");

      const res = await app.inject({
        method: "POST",
        url: "/api/v3/auth/logout",
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: {},
      });
      expect(res.statusCode).toBe(204);

      expect(await sessionCount(alice.userId)).toBe(0);
      expect(await sessionCount(bob.userId)).toBe(1);
      expect((await refresh(bob.refreshToken)).statusCode).toBe(200);
    });

    it("requires authentication", async () => {
      const res = await app.inject({ method: "POST", url: "/api/v3/auth/logout", payload: {} });
      expect(res.statusCode).toBe(401);
    });
  });
});
