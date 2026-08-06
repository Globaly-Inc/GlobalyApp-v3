// Verifies JWT on every request (except public routes).
// Sets req.auth = decoded claims { sub, type, role?, orgId?, email }.

import fp from "fastify-plugin";
import jwt from "jsonwebtoken";
import { config } from "../../config.js";
import type { AuthClaims } from "../types.js";

export const authPlugin = fp(async (app) => {
  app.decorateRequest("auth", null as unknown as AuthClaims);

  const publicPaths = new Set([
    // Unified auth
    "/api/v3/auth/send-otp",
    "/api/v3/auth/verify-otp",
    "/api/v3/auth/refresh",
    // Public registration / invitation accept
    "/api/v3/admin/users/invite/accept",
    "/api/v3/auth/register",
    "/api/v3/agents/invite/accept",
    // Health
    "/healthz",
    "/health/detailed",
    "/health/database",
    "/health/queue",
    "/health/mail",
  ]);

  app.addHook("onRequest", async (req, reply) => {
    const path = req.url.split("?")[0];
    if (publicPaths.has(path)) return;

    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return reply.status(401).send({ error: "Missing token" });
    }

    try {
      const token = header.slice(7);
      req.auth = jwt.verify(token, config.JWT_SECRET) as AuthClaims;
    } catch {
      return reply.status(401).send({ error: "Invalid token" });
    }
  });
});
