// AscentOne "InstAgentPublisherV5" provider.
// Ported from V2 _shared/ascentone-agents.ts + agent-sources/ascentone.ts.
// Uses V3 politeFetch from scraper.ts instead of V2 safe-fetch.

import { createHash } from "node:crypto";
import { politeFetch } from "../scraper.js";
import type { AgentSourceProvider, AgentLocation, AgentRow, ProviderDetection, ProviderResult } from "./types.js";

const ASCENTONE_HOST_RE = /(^|\.)ascentone\.com$/i;
const IFRAME_RE = /<iframe[^>]+src=["']([^"']+ascentone\.com[^"']*)["']/i;
const DIV_IFRAME_RE = /data-original-tag=["']iframe["'][^>]*src=["']([^"']+ascentone\.com[^"']*)["']/i;
const ALT_DIV_IFRAME_RE = /src=["']([^"']+ascentone\.com[^"']*)["'][^>]*data-original-tag=["']iframe["']/i;
const UNIQUE_ID_RE = /var\s+UniqueId\s*=\s*['"]([0-9a-fA-F-]{36})['"]/;
const SESSION_COOKIE_RE = /ASP\.NET_SessionId=([^;]+)/i;

function isAscentOneUrl(url: string): boolean {
  try { return ASCENTONE_HOST_RE.test(new URL(url).hostname); } catch { return false; }
}

function detectIframe(seedUrl: string, html?: string | null): string | null {
  if (isAscentOneUrl(seedUrl)) return seedUrl;
  if (!html) return null;
  const m = html.match(IFRAME_RE) || html.match(DIV_IFRAME_RE) || html.match(ALT_DIV_IFRAME_RE);
  return m ? m[1] : null;
}

function s(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t || null;
}

function composeAddress(street1: string | null, street2: string | null): string | null {
  const parts = [street1, street2].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function normaliseWebsite(raw: unknown): string | null {
  const w = s(raw);
  if (!w) return null;
  return /^https?:\/\//i.test(w) ? w : `https://${w}`;
}

function sha1Hex(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

function dedupKey(name: string | null, country: string | null): string {
  return `${(name || "").toLowerCase().trim()}|${(country || "").toLowerCase().trim()}`;
}

interface AscentOneRawRow {
  legal_name?: unknown;
  AgentCountry?: unknown;
  AgentStreet1?: unknown;
  AddressLine1?: unknown;
  AgentStreet2?: unknown;
  AgentCity?: unknown;
  AgentState?: unknown;
  post_code?: unknown;
  email?: unknown;
  phone?: unknown;
  Agentphone?: unknown;
  website?: unknown;
  id?: unknown;
  IsHeadOffice?: unknown;
}

async function fetchAgents(iframeUrl: string): Promise<ProviderResult | null> {
  // GET the iframe page to extract the UniqueId (eKey)
  const pageRes = await politeFetch(iframeUrl);
  if (!pageRes.ok) return null;
  const html = await pageRes.text();
  const eKeyMatch = html.match(UNIQUE_ID_RE);
  if (!eKeyMatch) return null;
  const eKey = eKeyMatch[1];

  const setCookie = pageRes.headers.get("set-cookie") || "";
  const cookieMatch = setCookie.match(SESSION_COOKIE_RE);
  const cookieHeader = cookieMatch ? `ASP.NET_SessionId=${cookieMatch[1]}` : "";

  let u: URL;
  try { u = new URL(iframeUrl); } catch { return null; }
  const handlerUrl = `${u.origin}/PageHandlers/AgentPublisherV5.ashx?rdnm=${Math.random()}&mapload=0&operate=GetAgentPublishersGridData`;

  const filter = {
    Country: "", State: "", City: "", AgentName: "",
    lattitude: "", longitude: "",
    eKey, hasMap: 0, hasChinaMap: 0, selectedDistance: "",
  };
  const body = new URLSearchParams();
  body.set("ClientFilter", JSON.stringify(filter));

  const apiRes = await politeFetch(handlerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      "Referer": iframeUrl,
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    body: body.toString(),
  });
  if (!apiRes.ok) return null;

  const data = await apiRes.json().catch(() => null) as { ClientDetails?: unknown[] } | null;
  const details = data?.ClientDetails;
  if (!Array.isArray(details)) return null;

  // Group rows by (legal_name + AgentCountry); each row becomes a location.
  const buckets = new Map<string, { chosen: AscentOneRawRow; locations: AgentLocation[] }>();

  for (const raw of details as AscentOneRawRow[]) {
    const name = s(raw.legal_name);
    const country = s(raw.AgentCountry);
    if (!name && !country) continue;
    const key = dedupKey(name, country);

    const street1 = s(raw.AgentStreet1) || s(raw.AddressLine1);
    const street2 = s(raw.AgentStreet2);
    const loc: AgentLocation = {
      external_id: s(raw.id),
      is_head_office: raw.IsHeadOffice === 1,
      street1, street2,
      city: s(raw.AgentCity), state: s(raw.AgentState),
      country, postcode: s(raw.post_code),
      address: composeAddress(street1, street2),
      email: s(raw.email), phone: s(raw.phone) || s(raw.Agentphone),
      website: normaliseWebsite(raw.website),
    };

    const bucket = buckets.get(key);
    if (!bucket) {
      buckets.set(key, { chosen: raw, locations: [loc] });
    } else {
      bucket.locations.push(loc);
      if (raw.IsHeadOffice === 1 && bucket.chosen.IsHeadOffice !== 1) {
        bucket.chosen = raw;
      }
    }
  }

  const agents: AgentRow[] = [];
  for (const { chosen, locations } of buckets.values()) {
    const street1 = s(chosen.AgentStreet1) || s(chosen.AddressLine1);
    const street2 = s(chosen.AgentStreet2);
    const name = s(chosen.legal_name);
    const country = s(chosen.AgentCountry);
    const head = locations.find((l) => l.is_head_office) || locations[0];
    const email = s(chosen.email) || head?.email || null;
    const phone = s(chosen.phone) || s(chosen.Agentphone) || head?.phone || null;
    const website = normaliseWebsite(chosen.website) || head?.website || null;
    const synth = sha1Hex(`${(name || "").toLowerCase().trim()}|${(country || "").toLowerCase().trim()}`);
    agents.push({
      name, country, email, phone, website,
      street1: street1 || head?.street1 || null,
      street2: street2 || head?.street2 || null,
      city: s(chosen.AgentCity) || head?.city || null,
      state: s(chosen.AgentState) || head?.state || null,
      postcode: s(chosen.post_code) || head?.postcode || null,
      address: composeAddress(street1, street2) || head?.address || null,
      external_id: `ao:${synth.slice(0, 32)}`,
      location_count: locations.length,
      locations,
    });
  }

  return {
    agents,
    rawCount: details.length,
    sourceUrl: iframeUrl,
    meta: { iframe_url: iframeUrl, eKey },
  };
}

export const ascentoneProvider: AgentSourceProvider = {
  id: "ascentone",
  name: "AscentOne",

  detect(seedUrl, html) {
    const iframeUrl = detectIframe(seedUrl, html ?? null);
    if (!iframeUrl) return null;
    return {
      providerId: "ascentone",
      providerName: "AscentOne",
      resolvedUrl: iframeUrl,
      meta: { iframe_url: iframeUrl },
    };
  },

  fetch(detection: ProviderDetection): Promise<ProviderResult | null> {
    return fetchAgents(detection.resolvedUrl);
  },
};
