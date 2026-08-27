import type { FastifyInstance } from "fastify";
import { ForbiddenError } from "../../../../shared/errors.js";
import { INTEGRATION_KEYS, UpdateIntegrationsSchema, type IntegrationKey } from "../schemas/integrations.schema.js";
import * as repo from "../repositories/integrations.repository.js";
import { bustCache } from "../services/integration-settings.service.js";

function requireSuperAdmin(role?: string) {
  if (role !== "super_admin") throw new ForbiddenError("Only super_admin can manage integrations");
}

/** Last 4 chars only — enough to recognise a key, useless to an attacker. */
function mask(plaintext: string): string {
  return `••••${plaintext.slice(-4)}`;
}

export async function integrationsRoutes(app: FastifyInstance) {
  // Masked previews only. Full secrets never leave the server after being saved.
  app.get("/integrations", async (req, reply) => {
    requireSuperAdmin(req.auth.role);
    const meta = new Map((await repo.listKeysWithMeta()).map((r) => [r.key, r.updated_at]));
    const out: Record<string, { set: boolean; preview: string | null; updated_at: string | null }> = {};
    for (const key of INTEGRATION_KEYS) {
      let preview: string | null = null;
      if (meta.has(key)) {
        try {
          const value = await repo.get(key);
          preview = value ? (key === "gsc_service_account_json" ? serviceAccountPreview(value) : mask(value)) : null;
        } catch {
          preview = "(unreadable — re-enter)";
        }
      }
      out[key] = { set: meta.has(key), preview, updated_at: meta.get(key) ?? null };
    }
    return reply.send(out);
  });

  // Only provided fields change; empty string clears a key.
  app.put("/integrations", async (req, reply) => {
    requireSuperAdmin(req.auth.role);
    const input = UpdateIntegrationsSchema.parse(req.body);
    const adminId = Number(req.auth.sub) || null;
    for (const key of INTEGRATION_KEYS) {
      const value = input[key as keyof typeof input];
      if (value === undefined) continue;
      if (value === "") await repo.remove(key as IntegrationKey);
      else await repo.upsert(key as IntegrationKey, value, adminId);
    }
    bustCache();
    return reply.send({ ok: true });
  });
}

/** For the JSON blob, show the service-account email — the useful identifier — not key bytes. */
function serviceAccountPreview(json: string): string {
  try {
    const email = JSON.parse(json).client_email;
    return typeof email === "string" ? email : "(saved)";
  } catch {
    return "(saved)";
  }
}
