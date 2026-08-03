// Unified auth routes — single login flow for all user types.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as service from "./auth.service.js";

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
  app.post("/send-otp", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const { email, subdomain } = SendOtpSchema.parse(req.body);
    const result = await service.sendOtp(email, subdomain);
    return reply.send(result);
  });

  app.post("/verify-otp", {
    config: { rateLimit: { max: 10, timeWindow: "5 minutes" } },
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
}
