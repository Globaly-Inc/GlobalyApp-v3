// Google Search Console client — lazy JWT auth, never throws a raw googleapis error at the
// route layer. Every method throws GscNotConfiguredError when GSC_KEY_FILE/GSC_SITE_URL are
// unset; routes map that to `{ connected: false }` instead of a 500 (same "degrades gracefully
// when unset" contract as HIGGSFIELD_API_KEY and GEMINI_API_KEY elsewhere in this codebase).

import { JWT } from "google-auth-library";
import { getIntegrationSetting } from "../../../settings/services/integration-settings.service.js";
import { searchconsole, searchconsole_v1 } from "@googleapis/searchconsole";
import { createChildLogger } from "../../../../../shared/logger.js";

const logger = createChildLogger("gsc-client");

export class GscNotConfiguredError extends Error {
  constructor(message = "Google Search Console is not configured") {
    super(message);
    this.name = "GscNotConfiguredError";
  }
}

/** Async now: credentials may come from Settings → Integrations (DB) or env. */
export async function isConfigured(): Promise<boolean> {
  try {
    await getCredentials();
    return true;
  } catch {
    return false;
  }
}

let client: searchconsole_v1.Searchconsole | null = null;
let clientKey: string | null = null;

type GscCredentials = { auth: { keyFile: string } | { email: string; key: string }; siteUrl: string };

/** DB-stored service-account JSON (Settings → Integrations) wins; GSC_KEY_FILE path is the env fallback. */
async function getCredentials(): Promise<GscCredentials> {
  const siteUrl = (await getIntegrationSetting("gsc_site_url")) ?? undefined;
  const json = await getIntegrationSetting("gsc_service_account_json");
  if (json && siteUrl) {
    try {
      const parsed = JSON.parse(json) as { client_email?: string; private_key?: string };
      if (parsed.client_email && parsed.private_key) {
        return { auth: { email: parsed.client_email, key: parsed.private_key }, siteUrl };
      }
    } catch {
      // fall through to env
    }
  }
  const keyFile = process.env.GSC_KEY_FILE;
  if (keyFile && siteUrl) return { auth: { keyFile }, siteUrl };
  throw new GscNotConfiguredError();
}

function getClient(auth: GscCredentials["auth"]): searchconsole_v1.Searchconsole {
  const scopes = ["https://www.googleapis.com/auth/webmasters.readonly"];
  // Credentials can change at runtime via Settings → Integrations, so key the cache on them.
  const cacheKey = JSON.stringify(auth);
  if (client && clientKey === cacheKey) return client;
  client = searchconsole({
    version: "v1",
    auth: "keyFile" in auth ? new JWT({ keyFile: auth.keyFile, scopes }) : new JWT({ email: auth.email, key: auth.key, scopes }),
  });
  clientKey = cacheKey;
  return client;
}

export type GscRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };

/** Raw Search Analytics query — no keyword filtering here, callers filter to the tracked set. */
export async function querySearchAnalytics(opts: {
  startDate: string;
  endDate: string;
  dimensions: string[];
  rowLimit?: number;
}): Promise<GscRow[]> {
  const { auth, siteUrl } = await getCredentials();
  const sc = getClient(auth);
  const res = await sc.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: opts.startDate,
      endDate: opts.endDate,
      dimensions: opts.dimensions,
      rowLimit: opts.rowLimit ?? 5000,
    },
  });
  return (res.data.rows ?? []).map((r) => ({
    keys: r.keys ?? [],
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    ctr: r.ctr ?? 0,
    position: r.position ?? 0,
  }));
}

// ponytail: in-process cache only (single instance today), swap for a shared cache if this
// ever runs behind more than one API process.
const STATUS_TTL_MS = 10 * 60 * 1000;
let statusCache: { connected: boolean; at: number } | null = null;

/** `{ connected }` for the status endpoint — probes with a 1-row query, cached 10 min. */
export async function checkConnection(): Promise<boolean> {
  if (statusCache && Date.now() - statusCache.at < STATUS_TTL_MS) return statusCache.connected;

  let connected = false;
  if (await isConfigured()) {
    try {
      const end = new Date();
      const start = new Date(end);
      start.setDate(end.getDate() - 1);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      await querySearchAnalytics({ startDate: fmt(start), endDate: fmt(end), dimensions: ["query"], rowLimit: 1 });
      connected = true;
    } catch (err) {
      logger.warn("GSC connection probe failed", { err: err instanceof Error ? err.message : String(err) });
      connected = false;
    }
  }
  statusCache = { connected, at: Date.now() };
  return connected;
}
