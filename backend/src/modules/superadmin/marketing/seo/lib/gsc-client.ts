// Google Search Console client — lazy JWT auth, never throws a raw googleapis error at the
// route layer. Every method throws GscNotConfiguredError when GSC_KEY_FILE/GSC_SITE_URL are
// unset; routes map that to `{ connected: false }` instead of a 500 (same "degrades gracefully
// when unset" contract as HIGGSFIELD_API_KEY and GEMINI_API_KEY elsewhere in this codebase).

import { JWT } from "google-auth-library";
import { searchconsole, searchconsole_v1 } from "@googleapis/searchconsole";
import { createChildLogger } from "../../../../../shared/logger.js";

const logger = createChildLogger("gsc-client");

export class GscNotConfiguredError extends Error {
  constructor(message = "Google Search Console is not configured") {
    super(message);
    this.name = "GscNotConfiguredError";
  }
}

export function isConfigured(): boolean {
  return !!(process.env.GSC_KEY_FILE && process.env.GSC_SITE_URL);
}

let client: searchconsole_v1.Searchconsole | null = null;

function getEnv(): { keyFile: string; siteUrl: string } {
  const keyFile = process.env.GSC_KEY_FILE;
  const siteUrl = process.env.GSC_SITE_URL;
  if (!keyFile || !siteUrl) throw new GscNotConfiguredError();
  return { keyFile, siteUrl };
}

function getClient(keyFile: string): searchconsole_v1.Searchconsole {
  client ??= searchconsole({
    version: "v1",
    auth: new JWT({ keyFile, scopes: ["https://www.googleapis.com/auth/webmasters.readonly"] }),
  });
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
  const { keyFile, siteUrl } = getEnv();
  const sc = getClient(keyFile);
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
  if (isConfigured()) {
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
