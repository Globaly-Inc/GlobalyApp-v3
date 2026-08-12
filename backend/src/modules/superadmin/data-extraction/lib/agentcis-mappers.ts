// Re-exports V2 AgentCIS pure mappers for use in V3 Node workers.
// These are direct ports from the Deno edge-function mappers — no I/O, no DB.

// ── Coercion ──

export function coerceLabel(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.en === "string") return o.en;
    if (typeof o.value === "string") return o.value;
    const firstString = Object.values(o).find((x) => typeof x === "string");
    return firstString ? String(firstString) : "";
  }
  return String(v);
}

// ── Deactivation check ──

const DEACTIVATED_STATUSES = new Set([
  "inactive", "archived", "deleted", "disabled", "deactivated",
]);

export function isDeactivated(r: Record<string, unknown>): boolean {
  if (r.deactivated_at != null && r.deactivated_at !== "") return true;
  if (r.deleted_at != null && r.deleted_at !== "") return true;
  if (r.is_active === false || r.active === false || r.is_enabled === false) return true;
  const status = coerceLabel(r.status || r.state).toLowerCase().trim();
  if (status && DEACTIVATED_STATUSES.has(status)) return true;
  return false;
}

// ── Contact picker ──

export function pickActiveContact(inst: Record<string, unknown>): {
  email: string | null;
  phone: string | null;
} {
  const fallback = {
    email: (inst.email as string) || null,
    phone: (inst.phone_number as string) || (inst.phone as string) || null,
  };
  const contacts = (inst.contacts || inst.partner_contacts || inst.partners || []) as unknown[];
  if (!Array.isArray(contacts) || contacts.length === 0) return fallback;
  const active = (contacts as Record<string, unknown>[]).filter(
    (c) => c && typeof c === "object" && !isDeactivated(c),
  );
  if (active.length === 0) return fallback;
  active.sort((a, b) => {
    const pa = Number(a.contact_priority ?? a.priority ?? 999);
    const pb = Number(b.contact_priority ?? b.priority ?? 999);
    if (pa !== pb) return pa - pb;
    const ai = a.is_primary || a.primary ? 0 : 1;
    const bi = b.is_primary || b.primary ? 0 : 1;
    return ai - bi;
  });
  const top = active[0];
  return {
    email: (top.email as string) || fallback.email,
    phone: (top.phone_number as string) || (top.phone as string) || fallback.phone,
  };
}

// ── Country mapping ──

const COUNTRY_MAP: Record<number, string> = {
  13: "Australia", 40: "Canada", 95: "Ireland", 144: "New Zealand",
  201: "United Kingdom", 202: "United States", 91: "India", 141: "Nepal",
  18: "Bangladesh", 153: "Pakistan", 180: "Sri Lanka", 160: "Philippines",
  208: "Vietnam", 121: "Malaysia", 172: "Singapore", 92: "Indonesia",
  190: "Thailand", 45: "China", 99: "Japan", 106: "South Korea",
};

export function mapCountry(c: unknown): string | null {
  if (!c) return null;
  if (typeof c === "string") return c;
  if (typeof c === "number") return COUNTRY_MAP[c] || null;
  if (typeof c === "object" && c !== null) {
    const o = c as Record<string, unknown>;
    if (typeof o.name === "string") return o.name;
    if (typeof o.id === "number") return COUNTRY_MAP[o.id] || null;
  }
  return null;
}

// ── Degree mapping ──

const DEGREE_MAP: Record<string, string> = {
  "high school": "certificate", "certificate": "certificate",
  "diploma": "diploma", "advanced diploma": "diploma",
  "associate degree": "associate",
  "bachelor": "bachelor", "bachelor's degree": "bachelor", "bachelors": "bachelor",
  "graduate certificate": "graduate_certificate",
  "graduate diploma": "graduate_diploma", "postgraduate diploma": "graduate_diploma",
  "master": "master", "master's degree": "master", "masters": "master", "mba": "master",
  "doctoral": "doctoral", "phd": "doctoral", "doctorate": "doctoral",
};

export function mapDegreeLevel(level: unknown): string | null {
  if (!level) return null;
  let name = "";
  if (typeof level === "string") name = level;
  else if (typeof level === "object" && level !== null) {
    name = coerceLabel((level as Record<string, unknown>).name);
  }
  return DEGREE_MAP[coerceLabel(name).toLowerCase().trim()] || null;
}
