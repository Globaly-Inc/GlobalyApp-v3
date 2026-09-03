// Unified auth routes — single login flow for all user types.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as service from "./auth.service.js";
import { RATE_LIMITS } from "./consts.js";

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

const RefreshSchema = z.object({
  refresh_token: z.string().min(1),
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
    return reply.send(result);
  });

  app.post("/refresh", {
    config: { rateLimit: RATE_LIMITS.refresh },
  }, async (req, reply) => {
    const { refresh_token } = RefreshSchema.parse(req.body);
    const result = await service.refreshAccessToken(refresh_token, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    return reply.send(result);
  });

  // Authenticated — invalidate session (pass refresh_token to logout single device, omit to logout all)
  app.post("/logout", {
    config: { rateLimit: RATE_LIMITS.logout },
  }, async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, string>;
    await service.logout(Number(req.auth.sub), body.refresh_token);
    return reply.status(204).send();
  });

  // Authenticated — switch to a business context
  app.post("/switch-account", {
    config: { rateLimit: RATE_LIMITS.switchAccount },
  }, async (req, reply) => {
    const { org_id, refresh_token } = SwitchAccountSchema.parse(req.body);
    const result = await service.switchAccount(Number(req.auth.sub), org_id, refresh_token);
    return reply.send(result);
  });

  // Authenticated — returns user profile based on JWT type
  app.get("/me", async (req, reply) => {
    const result = await service.getMe(req.auth);
    return reply.send(result);
  });
}
