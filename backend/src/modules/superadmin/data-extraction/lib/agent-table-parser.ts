// HTML table parser for agent lists — finds <table> blocks, detects headers
// (name/email/phone/address/website), extracts rows as AgentRow objects.
// Ported from V2 _shared/agent-table-parser.ts. Pure function, no IO.

import { normalizeCountry, normalizeState } from "./agent-normalizers.js";

export interface AgentRow {
  name: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  website_source?: string | null;
  address: string | null;
  street1: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  external_id: string | null;
  location_count: number;
}

// ── HTML helpers ──

const ENTITY_MAP: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—",
};

function decodeHtml(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_m, entity: string) => {
    const key = entity.toLowerCase();
    if (key.startsWith("#x")) return String.fromCharCode(parseInt(key.slice(2), 16));
    if (key.startsWith("#")) return String.fromCharCode(parseInt(key.slice(1), 10));
    return ENTITY_MAP[key] ?? `&${entity};`;
  });
}

function cellText(cellHtml: string, preserveRuns = false): string {
  const text = cellHtml.replace(/<br\s*\/?\s*>/gi, " ").replace(/<[^>]+>/g, " ");
  return decodeHtml(
    (preserveRuns ? text.replace(/[\t\r\n]+/g, " ") : text.replace(/\s+/g, " ")).trim(),
  );
}

function normaliseHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function extractCells(rowHtml: string, tag: "th" | "td", preserveRuns = false): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  return [...rowHtml.matchAll(re)].map((m) => cellText(m[1], preserveRuns));
}

function findIndex(headers: string[], match: RegExp): number {
  return headers.findIndex((h) => match.test(normaliseHeader(h)));
}

function findAddressIndex(headers: string[]): number {
  return headers.findIndex((h) => {
    const n = normaliseHeader(h);
    return n === "address" || /\b(postal|physical|office) address\b|^location$/.test(n);
  });
}

function valueAt(cells: string[], index: number): string | null {
  if (index < 0) return null;
  const value = cells[index]?.trim();
  if (!value || /^nil|n\/a|null|-$/i.test(value)) return null;
  return value;
}

// ── Address splitting from table cells ──

function countryFromTail(token: string | null): string | null {
  if (!token) return null;
  const cleaned = token.replace(/\bAutralia\b/gi, "Australia").trim();
  return normalizeCountry(cleaned);
}

function splitTableAddress(raw: string | null): Pick<AgentRow, "address" | "city" | "state" | "postcode" | "country"> {
  if (!raw) return { address: null, city: null, state: null, postcode: null, country: null };
  const wideParts = raw
    .replace(/\bAutralia\b/gi, "Australia")
    .split(/\s{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (wideParts.length >= 4) {
    const country = countryFromTail(wideParts[wideParts.length - 1]);
    const postcodeCandidate = wideParts[wideParts.length - 2];
    const postcode = /^\d{3,10}$/.test(postcodeCandidate) ? postcodeCandidate : null;
    const stateRaw = postcode ? wideParts[wideParts.length - 3] : wideParts[wideParts.length - 2];
    const state = normalizeState(stateRaw, country);
    const city = postcode ? wideParts[wideParts.length - 4] : wideParts[wideParts.length - 3];
    const streetEnd = postcode ? wideParts.length - 4 : wideParts.length - 3;
    const address = wideParts.slice(0, streetEnd).join(", ").trim() || null;
    return { address, city: city || null, state, postcode, country };
  }

  // ponytail: fallback — return whole string as address, try to extract country from last word
  const compact = raw.replace(/\bAutralia\b/gi, "Australia").replace(/\s+/g, " ").trim();
  return {
    address: compact || null, city: null, state: null, postcode: null,
    country: countryFromTail(compact.split(/\s+/).pop() ?? null),
  };
}

// ── Main parser ──

export function parseAgentRowsFromHtml(html: string): AgentRow[] {
  const rows: AgentRow[] = [];
  const tableMatches = [...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)];

  for (const tableMatch of tableMatches) {
    const tableHtml = tableMatch[0];
    const trMatches = [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
    if (trMatches.length < 2) continue;

    const headerRowIndex = trMatches.findIndex((tr) => extractCells(tr, "th").length >= 3);
    if (headerRowIndex < 0) continue;
    const headers = extractCells(trMatches[headerRowIndex], "th");

    const nameIndex = findIndex(headers, /\bagent name\b|\bagency name\b|\bcompany name\b|^name$/);
    const tradingIndex = findIndex(headers, /\btrading\b/);
    const emailIndex = findIndex(headers, /\bemail\b/);
    const websiteIndex = findIndex(headers, /\bweb\b|\bwebsite\b|\burl\b/);
    const phoneIndex = findIndex(headers, /\bphone\b|\bmobile\b|\btel/);
    const addressIndex = findAddressIndex(headers);

    if (nameIndex < 0 && tradingIndex < 0) continue;
    if (emailIndex < 0 && websiteIndex < 0 && phoneIndex < 0 && addressIndex < 0) continue;

    const minCols = Math.max(nameIndex, tradingIndex, emailIndex, websiteIndex, phoneIndex, addressIndex) + 1;

    for (const tr of trMatches.slice(headerRowIndex + 1)) {
      const cells = extractCells(tr, "td", true);
      if (cells.length < minCols) continue;

      const name = valueAt(cells, nameIndex) || valueAt(cells, tradingIndex);
      const email = valueAt(cells, emailIndex);
      const website = valueAt(cells, websiteIndex);
      const phone = valueAt(cells, phoneIndex);
      const addressRaw = valueAt(cells, addressIndex);
      if (!name && !email && !website && !phone && !addressRaw) continue;

      const addr = splitTableAddress(addressRaw);
      rows.push({
        name, country: addr.country, email, phone, website,
        website_source: website ? "source" : null,
        address: addr.address, street1: addr.address, street2: null,
        city: addr.city, state: addr.state, postcode: addr.postcode,
        external_id: null, location_count: 1,
      });
    }
  }

  return rows;
}

// ponytail: self-check
if (import.meta.url.endsWith("/agent-table-parser.ts") && process.argv[1]?.endsWith("agent-table-parser.ts")) {
  const assert = (cond: boolean, msg: string) => { if (!cond) throw new Error(`FAIL: ${msg}`); };
  const html = `<table>
    <tr><th>Agent Name</th><th>Email</th><th>Phone</th><th>Website</th></tr>
    <tr><td>Acme Education</td><td>info@acme.com</td><td>+61 2 1234 5678</td><td>https://acme.com</td></tr>
    <tr><td>Global Agents</td><td>contact@global.com</td><td>nil</td><td>N/A</td></tr>
  </table>`;
  const rows = parseAgentRowsFromHtml(html);
  assert(rows.length === 2, `expected 2 rows, got ${rows.length}`);
  assert(rows[0].name === "Acme Education", `name: ${rows[0].name}`);
  assert(rows[0].email === "info@acme.com", `email: ${rows[0].email}`);
  assert(rows[1].phone === null, `nil phone: ${rows[1].phone}`);
  assert(rows[1].website === null, `N/A website: ${rows[1].website}`);
  console.log("agent-table-parser: all checks passed");
}
