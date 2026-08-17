// Pure helpers for import-v1-extraction.mjs. No DB, no I/O — unit-testable.
//
// The V3 superadmin.extraction_* tables kept V1's uuid primary keys, so identity
// carries over verbatim and there is no uuid->serial remap. What DOES need work:
// two int4 category FKs on extraction_jobs, two reference uuids that B1 owns,
// free-text country values, and V1 prose landing in a V3 jsonb column.

// ── Country normalisation ───────────────────────────────────────────────────

// V1 mixes ISO-3166 official long names (shouted), plain names, and truncations
// left behind by a bad split. The domain is closed (~140 distinct values), so an
// explicit map beats a clever guesser. Keys are compared upper-cased.
const COUNTRY_ALIASES = new Map(
  Object.entries({
    "VIET NAM": "Vietnam",
    NAM: "Vietnam",
    "KOREA (THE REPUBLIC OF)": "South Korea",
    KOREA: "South Korea",
    "IRAN (ISLAMIC REPUBLIC OF)": "Iran",
    "BOLIVIA (PLURINATIONAL STATE OF)": "Bolivia",
    "VENEZUELA (BOLIVARIAN REPUBLIC OF)": "Venezuela",
    "LAO PEOPLE'S DEMOCRATIC REPUBLIC": "Laos",
    "LAO PEOPLE'S DEMOCRATIC REPUBLIC (THE)": "Laos",
    "TANZANIA, THE UNITED REPUBLIC OF": "Tanzania",
    "RUSSIAN FEDERATION (THE)": "Russia",
    "UNITED KINGDOM OF GREAT BRITAIN AND NORTHERN IRELAND (THE)": "United Kingdom",
    "UNITED STATES OF AMERICA (THE)": "United States",
    "DOMINICAN REPUBLIC (THE)": "Dominican Republic",
    TURKIYE: "Turkey",
    LANKA: "Sri Lanka",
    EMIRATES: "United Arab Emirates",
    MACEDONIA: "North Macedonia",
    MACAO: "Macau",
  }),
);

// Values that are not countries at all (a city, a state code, a postcode).
// Left exactly as found and reported — guessing at these would invent data.
const NOT_A_COUNTRY = new Set(["BOGOTA", "QLD", "SS89DE"]);

function titleCaseWord(word) {
  // "GUINEA-BISSAU" -> "Guinea-Bissau"; "PEOPLE'S" -> "People's".
  return word.replace(/[^\s-]+/g, (part) => part[0].toUpperCase() + part.slice(1).toLowerCase());
}

/**
 * Best-effort clean-up of extraction_agents.country, which stays free text in V3.
 * Returns { value, changed, reason } — never throws, never drops the original
 * when it cannot improve on it.
 */
export function normalizeCountry(raw) {
  if (raw === null || raw === undefined) return { value: null, changed: false, reason: null };
  const trimmed = String(raw).replace(/\s+/g, " ").trim();
  if (trimmed === "") return { value: null, changed: raw !== null, reason: "blank -> null" };

  const key = trimmed.toUpperCase();

  if (NOT_A_COUNTRY.has(key)) {
    return { value: trimmed, changed: trimmed !== raw, reason: "not a country — left as-is" };
  }
  // Multi-country cells ("Bangladesh; India; Sri Lanka") are a real answer to a
  // single-country field. Splitting would lose data, so keep the whole string.
  if (trimmed.includes(";") || /^Multiple\b/i.test(trimmed)) {
    return { value: trimmed, changed: trimmed !== raw, reason: "multi-value — left as-is" };
  }

  const alias = COUNTRY_ALIASES.get(key);
  if (alias) return { value: alias, changed: alias !== raw, reason: alias !== raw ? "alias" : null };

  // "PHILIPPINES (THE)" -> "PHILIPPINES", then shout-case gets title-cased.
  const deThe = trimmed.replace(/\s*\(THE\)$/i, "");
  const aliasAfterThe = COUNTRY_ALIASES.get(deThe.toUpperCase());
  const base = aliasAfterThe ?? (deThe === deThe.toUpperCase() ? titleCaseWord(deThe) : deThe);

  return { value: base, changed: base !== raw, reason: base !== raw ? "case/suffix" : null };
}

// ── text -> jsonb coercion ──────────────────────────────────────────────────

/**
 * V1 stores *_fee_installments as free text ("Payable in five installments");
 * V3 typed the column jsonb. Valid JSON passes through; prose becomes a JSON
 * string so the sentence survives instead of the row failing to cast.
 */
export function textToJsonb(raw) {
  if (raw === null || raw === undefined) return { value: null, coerced: false };
  const text = String(raw);
  if (text.trim() === "") return { value: null, coerced: true };
  try {
    const parsed = JSON.parse(text);
    // JSON.parse("5 installments") throws, but JSON.parse("5") does not — a bare
    // number from a prose column is still prose, so only objects/arrays pass.
    if (parsed !== null && typeof parsed === "object") return { value: text, coerced: false };
  } catch {
    /* falls through to the string form */
  }
  return { value: JSON.stringify(text), coerced: true };
}

// ── Batching ────────────────────────────────────────────────────────────────

/** Postgres caps a statement at 65535 bind parameters; stay well under. */
export const MAX_BIND_PARAMS = 30_000;

export function rowsPerStatement(columnCount, cap = MAX_BIND_PARAMS) {
  if (columnCount <= 0) throw new Error("rowsPerStatement: columnCount must be positive");
  return Math.max(1, Math.floor(cap / columnCount));
}

export function chunk(items, size) {
  if (size <= 0) throw new Error("chunk: size must be positive");
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ── SQL builders ────────────────────────────────────────────────────────────

const IDENT = /^[a-z_][a-z0-9_]*$/;

/** Quote an identifier, rejecting anything that did not come from the catalog. */
export function ident(name) {
  if (!IDENT.test(name)) throw new Error(`unsafe identifier: ${name}`);
  return `"${name}"`;
}

/**
 * SELECT list that renders every column as text. Casting on both ends makes the
 * transfer type-exact for jsonb, vector, text[], enums and timestamps alike,
 * without trusting the driver's guess at either side.
 */
export function buildSelect(schema, table, columns, orderBy) {
  const list = columns.map((c) => `${ident(c)}::text AS ${ident(c)}`).join(", ");
  return `SELECT ${list} FROM ${ident(schema)}.${ident(table)} ORDER BY ${ident(orderBy)}`;
}

/**
 * Multi-row upsert keyed on the preserved V1 identity, so a re-run updates in
 * place and inserts zero. `types` are V3 format_type() strings, used as casts.
 * Returns SQL with `rowCount * columns.length` placeholders.
 */
export function buildUpsert({ schema, table, columns, types, conflictKey, rowCount }) {
  if (rowCount < 1) throw new Error("buildUpsert: rowCount must be at least 1");
  const cols = columns.map(ident).join(", ");
  let p = 0;
  const values = Array.from({ length: rowCount }, () =>
    `(${columns.map((_, i) => `$${++p}::${types[i]}`).join(", ")})`,
  ).join(", ");

  const updatable = columns.filter((c) => !conflictKey.includes(c));
  const action = updatable.length
    ? `DO UPDATE SET ${updatable.map((c) => `${ident(c)} = EXCLUDED.${ident(c)}`).join(", ")}`
    : "DO NOTHING";

  return (
    `INSERT INTO ${ident(schema)}.${ident(table)} (${cols}) VALUES ${values} ` +
    `ON CONFLICT (${conflictKey.map(ident).join(", ")}) ${action} ` +
    `RETURNING (xmax = 0) AS inserted`
  );
}

// ── Load plan ───────────────────────────────────────────────────────────────

// Strict FK-safe order. `parents` lists the V3 columns that must point at an
// already-loaded table; the loader refuses to touch a table until every parent
// has passed its own count assertion, and drops-with-a-reason (never silently)
// any row whose parent id is absent from the target.
export const LOAD_PLAN = [
  { table: "extraction_jobs", parents: {} },
  { table: "extraction_courses", parents: { job_id: "extraction_jobs" } },
  { table: "extraction_course_fees", parents: { job_id: "extraction_jobs" } },
  { table: "extraction_eligibility_requirements", parents: { job_id: "extraction_jobs" } },
  { table: "extraction_agents", parents: { job_id: "extraction_jobs" } },
  { table: "extraction_study_units", parents: { job_id: "extraction_jobs" } },
  { table: "extraction_study_options", parents: { job_id: "extraction_jobs" } },
  { table: "extraction_campuses", parents: { job_id: "extraction_jobs" } },
  { table: "extraction_institution_overview", parents: { job_id: "extraction_jobs" } },
  { table: "extraction_additional_info", parents: { job_id: "extraction_jobs" } },
  { table: "extraction_accreditations", parents: {} },
  // Plan Wave M3 lists intakes as standalone, but V3 gave it a real course_id FK,
  // so it has to follow extraction_courses.
  { table: "extraction_intakes", parents: { job_id: "extraction_jobs", course_id: "extraction_courses" } },
  { table: "extraction_agent_locations", parents: { job_id: "extraction_jobs", agent_id: "extraction_agents" } },

  // Junctions last — two remapped parents each, and with ON CONFLICT DO NOTHING
  // a missing parent would read as a silent orphan rather than an FK error.
  {
    table: "extraction_course_campuses",
    parents: { job_id: "extraction_jobs", course_id: "extraction_courses", campus_id: "extraction_campuses" },
  },
  {
    table: "extraction_course_eligibility_assignments",
    parents: {
      job_id: "extraction_jobs",
      course_id: "extraction_courses",
      eligibility_requirement_id: "extraction_eligibility_requirements",
    },
  },
  {
    table: "extraction_course_fee_assignments",
    parents: {
      job_id: "extraction_jobs",
      course_id: "extraction_courses",
      course_fee_id: "extraction_course_fees",
    },
  },
  {
    table: "extraction_course_intake_assignments",
    parents: { job_id: "extraction_jobs", course_id: "extraction_courses", intake_id: "extraction_intakes" },
  },
  {
    table: "extraction_course_study_option_assignments",
    parents: {
      job_id: "extraction_jobs",
      course_id: "extraction_courses",
      study_option_id: "extraction_study_options",
    },
  },
  {
    table: "extraction_course_study_unit_assignments",
    parents: { job_id: "extraction_jobs", course_id: "extraction_courses", study_unit_id: "extraction_study_units" },
  },
  {
    table: "extraction_course_accreditation_assignments",
    parents: {
      job_id: "extraction_jobs",
      course_id: "extraction_courses",
      extraction_accreditation_id: "extraction_accreditations",
    },
  },

  // Independent of the course graph; any time after jobs.
  { table: "extraction_queue", parents: { job_id: "extraction_jobs" } },
  { table: "extraction_memory", parents: { job_id: "extraction_jobs" } },
  { table: "agent_extraction_runs", parents: { job_id: "extraction_jobs" } },
  { table: "extraction_site_profiles", parents: {}, conflictKey: ["domain"] },
];

// Opt-in via --with-events: a log spool for jobs that all finished long ago.
export const EVENTS_TABLE = { table: "extraction_job_events", parents: { job_id: "extraction_jobs" } };

// Deliberately never migrated. scrape_smoke_results is scraper CI harness output.
export const EXCLUDED_TABLES = {
  scrape_smoke_results: "scraper CI test-harness output — junk, never migrated",
  extraction_job_events: "log spool for finished jobs — opt in with --with-events",
};

/**
 * Verify every parent a table depends on has already been loaded AND passed its
 * count assertion. Returns the missing parent names; empty means safe to load.
 */
export function missingParents(spec, verified) {
  return [...new Set(Object.values(spec.parents ?? {}))].filter((p) => !verified.has(p));
}

/**
 * Declared width of a pgvector column, from a format_type() string. The type may
 * arrive schema-qualified when the extension lives outside search_path.
 */
export function vectorWidth(formatType) {
  return /(?:^|\.)vector\((\d+)\)$/.exec(formatType ?? "")?.[1] ?? null;
}
