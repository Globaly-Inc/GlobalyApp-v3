// Superadmin feature flags + site access routes.

import type { FastifyInstance } from "fastify";
import { randomInt } from "crypto";
import { z } from "zod";
import { ForbiddenError } from "../../../../shared/errors.js";
import * as repo from "../platform.repository.js";

const FlagKeyParam = z.object({ key: z.string().min(1) });
const FlagPatch = z.object({
  is_enabled: z.boolean(),
  description: z.string().optional(),
});
const SiteAccessPatch = z.object({ is_locked: z.boolean() });

// 6-char access code: A-Z (no I/O), 2-9
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateAccessCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_CHARS[randomInt(CODE_CHARS.length)];
  return code;
}

function requireSuperAdmin(role?: string) {
  if (role !== "super_admin") throw new ForbiddenError("Only super_admin can manage feature flags and site access");
}

export async function adminFeatureFlagRoutes(app: FastifyInstance) {
  // ── Feature Flags ──

  // GET /feature-flags (super_admin + data_admin can read)
  app.get("/feature-flags", async (_req, reply) => {
    const flags = await repo.listFeatureFlags();
    return reply.send({ flags });
  });

  // PATCH /feature-flags/:key (super_admin only)
  app.patch("/feature-flags/:key", async (req, reply) => {
    requireSuperAdmin(req.auth.role);
    const { key } = FlagKeyParam.parse(req.params);
    const { is_enabled, description } = FlagPatch.parse(req.body);
    const flag = await repo.upsertFeatureFlag(key, is_enabled, Number(req.auth.sub), description);
    await repo.logAdminAction(Number(req.auth.sub), is_enabled ? "FEATURE_FLAG_ENABLED" : "FEATURE_FLAG_DISABLED", "feature_flag", undefined, { flag_key: key });
    return reply.send(flag);
  });

  // ── Site Access ──

  // GET /site-access (super_admin only)
  app.get("/site-access", async (req, reply) => {
    requireSuperAdmin(req.auth.role);
    const settings = await repo.getSiteAccess();
    return reply.send(settings);
  });

  // PATCH /site-access (super_admin only)
  app.patch("/site-access", async (req, reply) => {
    requireSuperAdmin(req.auth.role);
    const { is_locked } = SiteAccessPatch.parse(req.body);
    const updated = await repo.updateSiteAccess({ is_locked }, Number(req.auth.sub));
    await repo.logAdminAction(Number(req.auth.sub), is_locked ? "SITE_LOCKED" : "SITE_UNLOCKED", "site_access");
    return reply.send(updated);
  });

  // POST /site-access/regenerate-code (super_admin only)
  app.post("/site-access/regenerate-code", async (req, reply) => {
    requireSuperAdmin(req.auth.role);
    const access_code = generateAccessCode();
    await repo.updateSiteAccess({ access_code }, Number(req.auth.sub));
    await repo.logAdminAction(Number(req.auth.sub), "SITE_ACCESS_CODE_REGENERATED", "site_access");
    return reply.send({ access_code });
  });
}
