// DB-first credential lookup with env fallback, used by the Higgsfield and GSC
// clients. 60s cache so hot paths (blog worker, SEO routes) don't hit the DB
// per call; saving through the admin API busts the cache immediately.
import { createChildLogger } from "../../../../shared/logger.js";
import * as repo from "../repositories/integrations.repository.js";
import type { IntegrationKey } from "../schemas/integrations.schema.js";

const logger = createChildLogger("integration-settings");
const TTL_MS = 60_000;

const ENV_FALLBACK: Record<IntegrationKey, string | undefined> = {
  higgsfield_api_key: "HIGGSFIELD_API_KEY",
  gsc_service_account_json: undefined, // env uses GSC_KEY_FILE (a path) — handled by gsc-client itself
  gsc_site_url: "GSC_SITE_URL",
  globalyos_crm_api_key: "GLOBALYOS_CRM_API_KEY",
  globalyos_crm_url: "GLOBALYOS_CRM_URL",
  pexels_api_key: "PEXELS_API_KEY",
};

const cache = new Map<IntegrationKey, { value: string | null; at: number }>();

export function bustCache(): void {
  cache.clear();
}

/** DB value if set, else the mapped env var, else null. Never throws. */
export async function getIntegrationSetting(key: IntegrationKey): Promise<string | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  let value: string | null = null;
  try {
    value = await repo.get(key);
  } catch (err) {
    // Undecryptable (JWT_SECRET rotated) or DB down — fall back to env rather than fail the caller.
    logger.warn(`integration setting "${key}" unreadable — falling back to env`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  if (value === null) {
    const envName = ENV_FALLBACK[key];
    value = (envName && process.env[envName]) || null;
  }
  cache.set(key, { value, at: Date.now() });
  return value;
}
