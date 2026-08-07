// Verifies JWT on every request (except public routes).
// Sets req.auth = decoded claims { sub, type, role?, orgId?, orgRole?, email }.
// Exports scope guards for route-level enforcement.

import fp from "fastify-plugin";
import jwt from "jsonwebtoken";
import type { FastifyRequest, FastifyReply } from "fastify";
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

// ── Scope guards (use as preHandler on routes) ──

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  if (req.auth?.type !== "admin") {
    return reply.status(403).send({ error: "Admin access required" });
  }
}

export async function requireBusinessContext(req: FastifyRequest, reply: FastifyReply) {
  if (!req.auth?.orgId) {
    return reply.status(403).send({ error: "Switch to a business context first" });
  }
}

/**
 * Factory that returns a preHandler checking if the agent's role has the required permission.
 * Requires business context (req.db must be set by tenant plugin).
 * Usage: { preHandler: [requireBusinessContext, requirePermission("crm:write")] }
 */
export function requirePermission(...required: string[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.db || !req.auth?.orgId) {
      return reply.status(403).send({ error: "Business context required" });
    }

    const agent = await req.db("agents")
      .join("roles", "agents.role_id", "roles.id")
      .where("agents.platform_user_id", Number(req.auth.sub))
      .select("roles.permissions")
      .first();

    if (!agent) {
      return reply.status(403).send({ error: "Not a member of this business" });
    }

    const perms: string[] = agent.permissions ?? [];
    const missing = required.filter((p) => !perms.includes(p));
    if (missing.length > 0) {
      return reply.status(403).send({ error: "Missing permissions", missing });
    }
  };
}
