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
    // Signed file reads — an <img>/<video> src cannot carry a bearer token, so the HMAC + expiry in the
    // query string is what authorizes these (see modules/files).
    "/api/v3/files/local",
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
 * Permission format: "module:action" e.g. "crm:write", "agents:read"
 * Usage: { preHandler: [requireBusinessContext, requirePermission("crm:write")] }
 */
export function requirePermission(...required: string[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.db || !req.auth?.orgId) {
      return reply.status(403).send({ error: "Business context required" });
    }

    const agent = await req.db("agents")
      .where("agents.platform_user_id", Number(req.auth.sub))
      .whereNull("agents.deleted_at")
      .select("agents.role_id")
      .first();

    if (!agent) {
      return reply.status(403).send({ error: "Not a member of this business" });
    }

    // Resolve permissions via role_permissions → permissions
    const perms = await req.db("role_permissions")
      .join("permissions", "role_permissions.permission_id", "permissions.id")
      .where("role_permissions.role_id", agent.role_id)
      .whereNull("permissions.deleted_at")
      .select(req.db.raw("permissions.module || ':' || permissions.action as perm_key"));

    const permSet = new Set(perms.map((p: any) => p.perm_key));
    const missing = required.filter((p) => !permSet.has(p));
    if (missing.length > 0) {
      return reply.status(403).send({ error: "Missing permissions", missing });
    }
  };
}
