// Unified auth routes — single login flow for all user types.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as service from "./auth.service.js";
import { RATE_LIMITS } from "./consts.js";

const RegisterSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  email: z.string().email(),
});

const SendOtpSchema = z.object({
  email: z.string().email(),
  subdomain: z.string().optional(),
});

const VerifyOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
  subdomain: z.string().optional(),
});

const RefreshSchema = z.object({
  refresh_token: z.string().min(1),
  subdomain: z.string().optional(),
});

export async function authRoutes(app: FastifyInstance) {
  app.post("/register", {
    config: { rateLimit: RATE_LIMITS.register },
  }, async (req, reply) => {
    const { first_name, last_name, email } = RegisterSchema.parse(req.body);
    const result = await service.registerUser(first_name, last_name, email);
    return reply.status(201).send(result);
  });

  app.post("/send-otp", {
    config: { rateLimit: RATE_LIMITS.sendOtp },
  }, async (req, reply) => {
    const { email, subdomain } = SendOtpSchema.parse(req.body);
    const result = await service.sendOtp(email, subdomain);
    return reply.send(result);
  });

  app.post("/verify-otp", {
    config: { rateLimit: RATE_LIMITS.verifyOtp },
  }, async (req, reply) => {
    const { email, otp, subdomain } = VerifyOtpSchema.parse(req.body);
    const result = await service.verifyOtp(email, otp, subdomain);
    return reply.send(result);
  });

  app.post("/refresh", async (req, reply) => {
    const { refresh_token, subdomain } = RefreshSchema.parse(req.body);
    const result = await service.refreshAccessToken(refresh_token, subdomain);
    return reply.send(result);
  });

  // Authenticated — returns user profile based on JWT type
  app.get("/me", async (req, reply) => {
    const result = await service.getMe(req.auth);
    return reply.send(result);
  });
}
