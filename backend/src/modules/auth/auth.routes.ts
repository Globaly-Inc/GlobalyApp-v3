// Unified auth routes — single login flow for all user types.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as service from "./auth.service.js";
import { RATE_LIMITS } from "./consts.js";
import { requireInstitutionContext } from "../../core/plugins/auth.plugin.js";
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from "./refresh-cookie.js";

const RegisterSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  email: z.string().email(),
  // Signed W1 capability token minted by GET /referrals/lookup/:code. Optional, and an invalid,
  // expired, or forged one is silently ignored — a referral must never block account creation.
  ref_token: z.string().optional(),
});

const SendOtpSchema = z.object({
  email: z.string().email(),
});

const VerifyOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
});

// The body token is the legacy path (sessions from before the httpOnly cookie, other clients);
// browsers now send the cookie instead.
const RefreshSchema = z.object({
  refresh_token: z.string().min(1).optional(),
});

const SwitchAccountSchema = z.object({
  org_id: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
});

export async function authRoutes(app: FastifyInstance) {
  app.post("/register", {
    config: { rateLimit: RATE_LIMITS.register },
  }, async (req, reply) => {
    const { first_name, last_name, email, ref_token } = RegisterSchema.parse(req.body);
    const result = await service.registerUser(first_name, last_name, email, ref_token);
    return reply.status(201).send(result);
  });

  app.post("/send-otp", {
    config: { rateLimit: RATE_LIMITS.sendOtp },
  }, async (req, reply) => {
    const { email } = SendOtpSchema.parse(req.body);
    const result = await service.sendOtp(email);
    return reply.send(result);
  });

  app.post("/verify-otp", {
    config: { rateLimit: RATE_LIMITS.verifyOtp },
  }, async (req, reply) => {
    const { email, otp } = VerifyOtpSchema.parse(req.body);
    const result = await service.verifyOtp(email, otp, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    setRefreshCookie(reply, result.refresh_token);
    return reply.send(result);
  });

  app.post("/refresh", {
    config: { rateLimit: RATE_LIMITS.refresh },
  }, async (req, reply) => {
    const { refresh_token: bodyToken } = RefreshSchema.parse(req.body ?? {});
    // The cookie wins: a legacy body token may be one the cookie already rotated past.
    const refreshToken = readRefreshCookie(req) ?? bodyToken;
    if (!refreshToken) {
      clearRefreshCookie(reply);
      return reply.status(401).send({ error: "No session" });
    }
    try {
      const result = await service.refreshAccessToken(refreshToken, {
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });
      // null inside the concurrent-refresh grace window: the winner already set the new cookie.
      if (result.refresh_token) setRefreshCookie(reply, result.refresh_token);
      return reply.send(result);
    } catch (err) {
      // A dead session must not leave its hint behind, or every page load retries it.
      clearRefreshCookie(reply);
      throw err;
    }
  });

  // Public (see auth.plugin.ts): ends the session named by the refresh cookie, or a body
  // refresh_token from a pre-cookie client, and always clears both cookies. No token, no
  // all-device logout — a missing or expired cookie must never sign out every device.
  app.post("/logout", {
    config: { rateLimit: RATE_LIMITS.logout },
  }, async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const bodyToken = typeof body.refresh_token === "string" ? body.refresh_token : undefined;
    const refreshToken = readRefreshCookie(req) ?? bodyToken;
    if (refreshToken) await service.logoutSession(refreshToken);
    clearRefreshCookie(reply);
    return reply.status(204).send();
  });

  // Authenticated — switch to a business context
  app.post("/switch-account", {
    config: { rateLimit: RATE_LIMITS.switchAccount },
  }, async (req, reply) => {
    const { org_id, refresh_token } = SwitchAccountSchema.parse(req.body);
    const result = await service.switchAccount(Number(req.auth.sub), org_id, readRefreshCookie(req) ?? refresh_token);
    return reply.send(result);
  });

  // Authenticated — returns user profile based on JWT type
  app.get("/me", async (req, reply) => {
    const result = await service.getMe(req.auth);
    return reply.send(result);
  });

  // Authenticated, institution context — mints the self-service "Preview" button's short-lived
  // preview_token (see auth.service.ts's issuePreviewToken), never the caller's own session token.
  app.post("/preview-token", { preHandler: requireInstitutionContext }, async (req, reply) => {
    const preview_token = service.issuePreviewToken(req.auth);
    return reply.send({ preview_token });
  });
}
