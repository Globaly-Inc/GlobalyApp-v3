// OTP lifecycle — spec: plan §7.2.
// Real Postgres, real Fastify (via inject), no live server, no sleeps.

import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { dbAvailable, uniqueEmail } from "../helpers/db.js";
import { waitForOtp, wrongOtp, type PublishedEmail } from "../helpers/mail-capture.js";

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

describeDb("auth OTP", () => {
  let app: FastifyInstance;
  let masterKnex: import("knex").Knex;
  let buildTestApp: typeof import("../helpers/app.js")["buildTestApp"];

  const OTP_MAX_ATTEMPTS = 5;
  const OTP_LOCKOUT_MINUTES = 30;

  beforeAll(async () => {
    ({ buildTestApp } = await import("../helpers/app.js"));
    ({ masterKnex } = await import("../../src/core/db/master-pool.js"));
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app?.close();
    await masterKnex?.destroy();
  });

  beforeEach(() => {
    published.length = 0;
    vi.useRealTimers();
  });

  /** Register a fresh user and return the email + the OTP that was mailed out. */
  async function register(prefix: string) {
    const email = uniqueEmail(prefix);
    const res = await app.inject({
      method: "POST",
      url: "/api/v3/auth/register",
      payload: { first_name: "Test", last_name: "User", email },
    });
    expect(res.statusCode).toBe(201);
    const otp = await waitForOtp(published, email);
    return { email, otp };
  }

  const challengeRow = (email: string) =>
    masterKnex("auth_otp_challenges").where({ email }).first();

  const userRow = (email: string) =>
    masterKnex("platform_users").where({ email }).first();

  // ── unknown account ──

  describe("unknown email", () => {
    it("send-otp returns 404 and reveals nothing about the account", async () => {
      const email = uniqueEmail("ghost");
      const res = await app.inject({
        method: "POST",
        url: "/api/v3/auth/send-otp",
        payload: { email },
      });

      expect(res.statusCode).toBe(404);
      const body = res.body;
      // Generic message only: no echo of the address, no "no such user" detail,
      // no stack trace.
      expect(body).not.toContain(email);
      expect(body.toLowerCase()).not.toMatch(/not registered|does not exist|unknown (user|email)|no account with/);
      expect(res.json()).not.toHaveProperty("stack");
      expect(body).not.toMatch(/\bat\s+.+:\d+:\d+/);
    });

    it("verify-otp for an unknown email is indistinguishable from send-otp", async () => {
      const email = uniqueEmail("ghost");
      const res = await app.inject({
        method: "POST",
        url: "/api/v3/auth/verify-otp",
        payload: { email, otp: "123456" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.body).not.toContain(email);
    });
  });

  // ── D1 regression: OTP must never be stored in plaintext ──

  describe("D1 regression — OTP is stored hashed", () => {
    it("stores a hash in otp_hash and the plaintext code nowhere in the row", async () => {
      const { email, otp } = await register("d1");

      const row = await challengeRow(email);
      expect(row).toBeTruthy();

      expect(row.otp_hash).toBeTypeOf("string");
      expect(row.otp_hash).not.toBe(otp);
      expect(row.otp_hash).not.toContain(otp);
      // salt:hash — a real derivation, not an encoding of the digits.
      expect(row.otp_hash.length).toBeGreaterThan(64);

      // The plaintext must not survive in ANY column of the row.
      for (const [column, value] of Object.entries(row)) {
        expect(
          String(value ?? ""),
          `plaintext OTP leaked into auth_otp_challenges.${column}`,
        ).not.toContain(otp);
      }
    });

    it("produces a different stored hash for the same code on re-issue (salted)", async () => {
      const { email } = await register("d1salt");
      const first = await challengeRow(email);

      await app.inject({ method: "POST", url: "/api/v3/auth/send-otp", payload: { email } });
      const second = await challengeRow(email);

      expect(second.otp_hash).not.toBe(first.otp_hash);
    });
  });

  // ── expiry ──

  it("rejects an OTP after it has expired", async () => {
    const { email, otp } = await register("expired");

    const row = await challengeRow(email);
    const expiredAt = new Date(new Date(row.expires_at).getTime() + 1000);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(expiredAt);
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/v3/auth/verify-otp",
        payload: { email, otp },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toMatch(/expired/i);
    } finally {
      vi.useRealTimers();
    }

    // The account must stay inactive.
    const user = await userRow(email);
    expect(user.account_status).toBe(0);
  });

  // ── attempts + lockout ──

  it("increments attempts on a wrong OTP", async () => {
    const { email, otp } = await register("attempts");
    const bad = wrongOtp(otp);

    for (let n = 1; n <= 3; n++) {
      const res = await app.inject({
        method: "POST",
        url: "/api/v3/auth/verify-otp",
        payload: { email, otp: bad },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toMatch(/invalid otp/i);

      const row = await challengeRow(email);
      expect(row.attempts, `after ${n} wrong attempt(s)`).toBe(n);
      expect(row.locked_until).toBeNull();
    }
  });

  it("locks the challenge for 30 minutes on the 5th consecutive failure", async () => {
    const { email, otp } = await register("lockout");
    const bad = wrongOtp(otp);

    const base = new Date();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(base);

    try {
      for (let n = 1; n < OTP_MAX_ATTEMPTS; n++) {
        const res = await app.inject({
          method: "POST",
          url: "/api/v3/auth/verify-otp",
          payload: { email, otp: bad },
        });
        expect(res.statusCode).toBe(401);
        expect(res.json().error, `attempt ${n} should still be a plain rejection`).toMatch(/invalid otp/i);
        expect((await challengeRow(email)).locked_until).toBeNull();
      }

      // 5th failure — locks.
      const fifth = await app.inject({
        method: "POST",
        url: "/api/v3/auth/verify-otp",
        payload: { email, otp: bad },
      });
      expect(fifth.statusCode).toBe(401);

      const locked = await challengeRow(email);
      expect(locked.attempts).toBe(OTP_MAX_ATTEMPTS);
      expect(locked.locked_until).toBeTruthy();
      const lockMs = new Date(locked.locked_until).getTime() - base.getTime();
      expect(lockMs).toBeGreaterThan((OTP_LOCKOUT_MINUTES - 1) * 60_000);
      expect(lockMs).toBeLessThanOrEqual(OTP_LOCKOUT_MINUTES * 60_000 + 5_000);

      // The CORRECT code is refused while locked.
      const duringLock = await app.inject({
        method: "POST",
        url: "/api/v3/auth/verify-otp",
        payload: { email, otp },
      });
      expect(duringLock.statusCode).toBe(401);
      expect(duringLock.json().error).toMatch(/too many attempts/i);

      // Still locked one minute before the window closes.
      vi.setSystemTime(new Date(base.getTime() + (OTP_LOCKOUT_MINUTES - 1) * 60_000));
      const stillLocked = await app.inject({
        method: "POST",
        url: "/api/v3/auth/send-otp",
        payload: { email },
      });
      expect(stillLocked.statusCode).toBe(401);
      expect(stillLocked.json().error).toMatch(/too many attempts/i);

      // Unlocked one minute after it closes.
      vi.setSystemTime(new Date(base.getTime() + (OTP_LOCKOUT_MINUTES + 1) * 60_000));
      const afterLock = await app.inject({
        method: "POST",
        url: "/api/v3/auth/send-otp",
        payload: { email },
      });
      expect(afterLock.statusCode).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });

  // ── happy path ──

  describe("valid OTP", () => {
    it("returns tokens, activates the account and marks the email verified", async () => {
      const { email, otp } = await register("happy");

      const before = await userRow(email);
      expect(before.account_status).toBe(0);
      expect(before.is_email_verified).toBe(false);

      const res = await app.inject({
        method: "POST",
        url: "/api/v3/auth/verify-otp",
        payload: { email, otp },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.access_token).toBeTypeOf("string");
      expect(body.refresh_token).toBeTypeOf("string");
      expect(body.user).toMatchObject({ email, type: "platform_user" });

      const after = await userRow(email);
      expect(after.account_status).toBe(1);
      expect(after.is_email_verified).toBe(true);
    });

    it("consumes the challenge so the same code cannot be replayed", async () => {
      const { email, otp } = await register("replay");

      const first = await app.inject({
        method: "POST",
        url: "/api/v3/auth/verify-otp",
        payload: { email, otp },
      });
      expect(first.statusCode).toBe(200);
      expect(await challengeRow(email)).toBeUndefined();

      const second = await app.inject({
        method: "POST",
        url: "/api/v3/auth/verify-otp",
        payload: { email, otp },
      });
      expect(second.statusCode).toBe(401);
    });

    it("issues a working access token", async () => {
      const { email, otp } = await register("token");
      const login = await app.inject({
        method: "POST",
        url: "/api/v3/auth/verify-otp",
        payload: { email, otp },
      });

      const me = await app.inject({
        method: "GET",
        url: "/api/v3/auth/me",
        headers: { authorization: `Bearer ${login.json().access_token}` },
      });
      expect(me.statusCode).toBe(200);
      expect(me.json().user.email).toBe(email);
      expect(me.json().user.account_status).toBe(1);
    });
  });

  // ── anti-enumeration on register ──

  it("returns the same registration response for a new and an existing email", async () => {
    const email = uniqueEmail("dup");
    const payload = { first_name: "Test", last_name: "User", email };

    const first = await app.inject({ method: "POST", url: "/api/v3/auth/register", payload });
    const second = await app.inject({ method: "POST", url: "/api/v3/auth/register", payload });

    expect(second.statusCode).toBe(first.statusCode);
    expect(second.json()).toEqual(first.json());
  });
});
