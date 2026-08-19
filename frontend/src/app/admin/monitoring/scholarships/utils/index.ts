import type { Basis, CoverageType, ScholarshipInput, SourceType } from "../apis/types";

export function toSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ── XLSX/CSV bulk-import — column mapping, ported from V2's AdminScholarshipImportDialog ──
// The user picks which spreadsheet column feeds each of our fields; we only suggest
// a starting guess by keyword, we never import on the guess alone.

export type ImportField = {
  key: keyof typeof FIELD_LABELS;
  label: string;
  required?: boolean;
};

const FIELD_LABELS = {
  title: "Title", description: "Description", provider_name: "Provider name", source_type: "Source type",
  country: "Country", city: "City", region: "Region", basis: "Basis", degree_levels: "Degree level(s)",
  requirements_summary: "Requirements summary", coverage_type: "Coverage type",
  coverage_amount: "Amount", coverage_currency: "Currency", coverage_description: "Coverage description",
  deadline: "Deadline", deadline_notes: "Deadline notes", application_url: "Application URL", source_url: "Source URL",
} as const;

export const IMPORT_FIELDS: ImportField[] = [
  { key: "title", label: FIELD_LABELS.title, required: true },
  { key: "description", label: FIELD_LABELS.description },
  { key: "provider_name", label: FIELD_LABELS.provider_name },
  { key: "source_type", label: FIELD_LABELS.source_type },
  { key: "country", label: FIELD_LABELS.country },
  { key: "city", label: FIELD_LABELS.city },
  { key: "region", label: FIELD_LABELS.region },
  { key: "basis", label: FIELD_LABELS.basis },
  { key: "degree_levels", label: FIELD_LABELS.degree_levels },
  { key: "requirements_summary", label: FIELD_LABELS.requirements_summary },
  { key: "coverage_type", label: FIELD_LABELS.coverage_type },
  { key: "coverage_amount", label: FIELD_LABELS.coverage_amount },
  { key: "coverage_currency", label: FIELD_LABELS.coverage_currency },
  { key: "coverage_description", label: FIELD_LABELS.coverage_description },
  { key: "deadline", label: FIELD_LABELS.deadline },
  { key: "deadline_notes", label: FIELD_LABELS.deadline_notes },
  { key: "application_url", label: FIELD_LABELS.application_url },
  { key: "source_url", label: FIELD_LABELS.source_url },
];

export type ColumnMapping = Partial<Record<ImportField["key"], string>>;

const GUESS_KEYWORDS: Record<ImportField["key"], string[]> = {
  title: ["scholarship", "title", "name"],
  description: ["description", "summary", "about"],
  provider_name: ["provider", "university", "institution", "organization", "organisation"],
  source_type: ["source", "type"],
  country: ["country"],
  city: ["city"],
  region: ["region"],
  basis: ["basis", "category"],
  degree_levels: ["degree", "level"],
  requirements_summary: ["requirement", "eligibility"],
  coverage_type: ["coverage", "funding"],
  coverage_amount: ["amount", "value", "award"],
  coverage_currency: ["currency"],
  coverage_description: ["coverage description", "funding description"],
  deadline: ["deadline", "due date", "closing date"],
  deadline_notes: ["deadline notes", "deadline note"],
  application_url: ["application url", "apply", "application link"],
  source_url: ["source url"],
};

/** Best-effort starting point for the mapping step — the user confirms or overrides every field. */
export function guessMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  for (const field of IMPORT_FIELDS) {
    const keywords = GUESS_KEYWORDS[field.key];
    const match = headers.find((h) => keywords.some((w) => h.toLowerCase().includes(w)));
    if (match) mapping[field.key] = match;
  }
  return mapping;
}

function text(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function mapDegreeLevels(raw: string): string[] {
  const v = raw.toLowerCase();
  if (v.includes("phd") || v.includes("doctoral")) return ["doctoral"];
  if (v.includes("master")) return ["master"];
  if (v.includes("pg") || v.includes("postgraduate") || v.includes("graduate")) {
    return ["master", "doctoral", "graduate_certificate", "graduate_diploma"];
  }
  if (v.includes("ug") || v.includes("undergraduate") || v.includes("bachelor")) return ["bachelor"];
  if (v.includes("diploma")) return ["diploma"];
  if (v.includes("certificate")) return ["certificate"];
  return [];
}

function mapBasis(raw: string): Basis | null {
  const v = raw.toLowerCase();
  if (v.includes("merit")) return "merit";
  if (v.includes("need")) return "need";
  if (v.includes("sport")) return "sports";
  if (v.includes("divers") || v.includes("equity")) return "diversity";
  if (v.includes("research")) return "research";
  if (v.includes("government") || v.includes("gov ")) return "government";
  return raw ? "other" : null;
}

function mapCoverageType(raw: string): CoverageType {
  const v = raw.toLowerCase();
  if (v.includes("full") && v.includes("tuition")) return "full_tuition";
  if (v.includes("partial") || v.includes("%")) return "partial_tuition";
  if (v.includes("stipend")) return "stipend";
  if (v.includes("living")) return "living_allowance";
  return "various";
}

function mapSourceType(raw: string): SourceType {
  const v = raw.toLowerCase();
  if (v.includes("government") || v.includes("gov")) return "government";
  if (v.includes("foundation")) return "foundation";
  if (v.includes("independent") || v.includes("private")) return "independent";
  if (v.includes("university") || v.includes("institut") || v.includes("college")) return "university";
  return "other";
}

function parseDeadline(raw: unknown): string | null {
  if (!raw) return null;
  const date = new Date(text(raw));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function parseAmount(raw: unknown): number | null {
  if (!raw) return null;
  const cleaned = text(raw).replace(/[^\d.]/g, "");
  const value = Number.parseFloat(cleaned);
  return Number.isNaN(value) ? null : value;
}

/** Only send a URL the backend will actually accept — garbage source data ("N/A", "TBC", a bare domain) becomes null instead of a validation failure. */
function parseUrl(raw: unknown): string | null {
  const v = text(raw);
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : null;
}

export type ImportResult =
  | { status: "ok"; input: ScholarshipInput }
  | { status: "skipped"; reason: string };

/** Builds one create payload from a row using the user-confirmed column mapping. */
export function buildInputFromMapping(
  row: Record<string, unknown>,
  mapping: ColumnMapping,
  defaultCountry: string,
): ImportResult {
  const get = (key: ImportField["key"]) => (mapping[key] ? row[mapping[key]!] : undefined);

  const title = text(get("title"));
  if (!title) return { status: "skipped", reason: "Title column is empty for this row" };

  const input: ScholarshipInput = {
    title,
    slug: `${toSlug(title)}-${Math.random().toString(36).slice(2, 8)}`,
    description: text(get("description")) || null,
    provider_name: text(get("provider_name")) || "Unknown Provider",
    source_type: mapSourceType(text(get("source_type"))),
    country: text(get("country")) || defaultCountry || null,
    city: text(get("city")) || null,
    region: text(get("region")) || null,
    basis: mapBasis(text(get("basis"))),
    degree_levels: mapDegreeLevels(text(get("degree_levels"))),
    requirements_summary: text(get("requirements_summary")) || null,
    coverage_type: mapCoverageType(text(get("coverage_type"))),
    coverage_amount: parseAmount(get("coverage_amount")),
    coverage_currency: text(get("coverage_currency")) || "USD",
    coverage_description: text(get("coverage_description")) || null,
    deadline: parseDeadline(get("deadline")),
    deadline_notes: text(get("deadline_notes")) || null,
    application_url: parseUrl(get("application_url")),
    source_url: parseUrl(get("source_url")),
    is_published: true,
    is_featured: false,
  };

  return { status: "ok", input };
}
