/**
 * Generic agent enrichment layer — runs on EVERY provider's output (and the
 * LLM fallback) so address parsing, website derivation, and logo re-hosting
 * are uniform across StudyLink, AscentOne, future widgets, etc.
 * Ported from V2 _shared/agent-enrichment.ts.
 */

import type { AgentRow } from "./agent-sources/types.js";
import { parseAddress } from "./address-parser.js";
import { parseAddressesAi } from "./address-parser-ai.js";
import { emailDomain, isPersonalEmailDomain } from "./email-blocklist.js";

export interface EnrichOpts {
  /** Whether to call the AI fallback for unparseable addresses. Default true. */
  aiAddressFallback?: boolean;
  /** Hard cap on AI address calls (each call processes up to 20 rows). Default 3 calls = 60 rows. */
  aiAddressMaxCalls?: number;
  /** Whether to attempt logo re-hosting. Default true. */
  rehostLogos?: boolean;
}

export interface EnrichmentStats {
  websites_derived: number;
  websites_normalised: number;
  addresses_parsed: number;
  addresses_ai_parsed: number;
  logos_rehosted: number;
  logos_failed: number;
}

function normaliseWebsite(url: string | null | undefined): string | null {
  if (!url) return null;
  let u = url.trim();
  if (!u) return null;
  if (!/\.[a-z]{2,}/i.test(u)) return null;
  if (!/^https?:\/\//i.test(u)) u = "https://" + u.replace(/^\/+/, "");
  return u;
}

/** Mutates each agent row in place with parsed address, derived website.
 *  Returns counters for the run history. */
export async function enrichAgents(rows: AgentRow[], opts?: EnrichOpts): Promise<EnrichmentStats> {
  const stats: EnrichmentStats = {
    websites_derived: 0, websites_normalised: 0,
    addresses_parsed: 0, addresses_ai_parsed: 0,
    logos_rehosted: 0, logos_failed: 0,
  };

  // Stage 1: deterministic per-row (sync).
  for (const a of rows) {
    // -- Address parse (heuristic) --
    const hasStructured = a.street1 || a.city || a.postcode;
    if (!hasStructured && a.address) {
      const p = parseAddress(a.address, a.country);
      a.street1 = a.street1 ?? p.street1;
      a.street2 = a.street2 ?? p.street2;
      a.city    = a.city    ?? p.city;
      a.state   = a.state   ?? p.state;
      a.postcode = a.postcode ?? p.postcode;
      if (!a.country && p.country) a.country = p.country;
      if (p.address) a.address = p.address;
      stats.addresses_parsed++;
    } else if (a.address) {
      const p = parseAddress(a.address, a.country);
      if (p.address) a.address = p.address;
    }

    // -- Website: normalise existing + derive when missing --
    const existing = normaliseWebsite(a.website);
    if (existing) {
      if (existing !== a.website) stats.websites_normalised++;
      a.website = existing;
      if (!a.website_source) a.website_source = "source";
    } else {
      const dom = emailDomain(a.email);
      if (dom && !isPersonalEmailDomain(dom)) {
        a.website = `https://${dom}`;
        a.website_source = "derived_from_email";
        stats.websites_derived++;
      }
    }
  }

  // Stage 1b: AI fallback for addresses the heuristic couldn't split.
  if (opts?.aiAddressFallback !== false) {
    const maxCalls = opts?.aiAddressMaxCalls ?? 3;
    const targets = rows.filter(r => r.address && (!r.city || !r.postcode));
    let callsLeft = maxCalls;
    for (let i = 0; i < targets.length && callsLeft > 0; i += 20, callsLeft--) {
      const batch = targets.slice(i, i + 20);
      const out = await parseAddressesAi(
        batch.map(t => ({ raw: t.address!, country: t.country })),
      );
      for (let j = 0; j < batch.length; j++) {
        const p = out[j];
        if (!p) continue;
        const t = batch[j];
        if (!t.street1 && p.street1) t.street1 = p.street1;
        if (!t.street2 && p.street2) t.street2 = p.street2;
        if (!t.city && p.city)       t.city = p.city;
        if (!t.state && p.state)     t.state = p.state;
        if (!t.postcode && p.postcode) t.postcode = p.postcode;
        if (!t.country && p.country) t.country = p.country;
        stats.addresses_ai_parsed++;
      }
    }
  }

  // ponytail: logo rehosting skipped — no GCS bucket configured yet.
  // Add when GCS agent-logos bucket is provisioned. Wire up a rehostLogo()
  // function that downloads the logo_url, uploads to GCS, and sets
  // logo_storage_path + logo_source_url. The loop shape is identical to V2:
  // filter rows with logo_url && !logo_storage_path, batch with concurrency 6.

  return stats;
}

/** Merge two agent row sets: primary is source of truth, secondary fills
 *  null contact fields. Match by external_id first, then by (name|country|email). */
export function mergeAgentRows(primary: AgentRow[], secondary: AgentRow[]): AgentRow[] {
  const keyOf = (r: AgentRow) =>
    `${(r.name || "").trim().toLowerCase()}||${(r.country || "").trim().toLowerCase()}||${(r.email || "").trim().toLowerCase()}`;

  const byExt = new Map<string, AgentRow>();
  const byKey = new Map<string, AgentRow>();
  for (const r of primary) {
    if (r.external_id) byExt.set(r.external_id, r);
    byKey.set(keyOf(r), r);
  }
  for (const s of secondary) {
    const k = keyOf(s);
    const match = (s.external_id && byExt.get(s.external_id)) || byKey.get(k);
    if (match) {
      // Fill nulls only — never overwrite primary structured data.
      match.email   = match.email   ?? s.email;
      match.phone   = match.phone   ?? s.phone;
      match.website = match.website ?? s.website;
      match.address = match.address ?? s.address;
      match.country = match.country ?? s.country;
      continue;
    }
    primary.push(s);
    byKey.set(k, s);
    if (s.external_id) byExt.set(s.external_id, s);
  }
  return primary;
}
