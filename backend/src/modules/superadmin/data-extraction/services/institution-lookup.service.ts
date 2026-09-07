// Finds values for currently-EMPTY extraction_institution_overview fields only — e.g.
// "what is Harvard's official phone number" — without re-running the full institution
// extraction step (which would also re-touch fields that already have a value). Read-only:
// returns candidates for the admin to individually accept via the existing saveAndLearn
// path (institution-tab.tsx's saveField), never writes anything itself.
import { NotFoundError, BadRequestError } from "../../../../shared/errors.js";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { scrapeMarkdown } from "../lib/scraper.js";
import { truncateMarkdown } from "../lib/html-utils.js";
import { extractJson } from "../lib/llm-client.js";
import { findOverviewByJobId } from "../repositories/promote.repository.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";

export type MissingDetailCandidate = {
  field: string;
  label: string;
  value: string;
  source_url: string | null;
};

// Every extraction_institution_overview column this can search for. Kept in sync with
// institution-tab.tsx's editable fields.
const CANDIDATE_FIELDS = [
  "phone", "email", "address", "city", "state", "zip_code", "country", "description", "logo_url",
] as const;

const FIELD_LABELS: Record<string, string> = {
  phone: "Phone", email: "Email", address: "Address", city: "City", state: "State",
  zip_code: "Zip / Postcode", country: "Country", description: "Description", logo_url: "Logo URL",
};

const SYSTEM = `You find specific missing facts about an institution from provided webpage content.
Only return a field if the content clearly states it — never guess, infer, or use outside knowledge.
Respond with JSON: {"results": [{"field": "<field name>", "value": "<found value>", "source_url": "<url>"}]}.
Omit any field you can't find. "value" must be the literal fact only (e.g. a phone number, not a sentence about it).`;

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

/** Pure: which candidate fields are currently empty on this overview row (or all of
 * them, if there's no overview row yet). No DB/network — unit-tested directly. */
export function pickMissingFields(overview: Record<string, unknown> | undefined | null): string[] {
  return CANDIDATE_FIELDS.filter((f) => isEmpty(overview?.[f]));
}

export async function findMissingOverviewFields(jobId: string): Promise<{ fields: MissingDetailCandidate[] }> {
  const job = await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).first();
  if (!job) throw new NotFoundError("Extraction job not found");
  if (!job.institution_url) throw new BadRequestError("Job has no institution URL to search");

  const overview = await findOverviewByJobId(jobId);
  const missing = pickMissingFields(overview as unknown as Record<string, unknown> | undefined);
  if (missing.length === 0) return { fields: [] };

  const homepage = await scrapeMarkdown(job.institution_url, { onlyMainContent: false });
  let origin = "";
  try {
    origin = new URL(job.institution_url).origin;
  } catch { /* leave empty */ }
  const contact = origin ? await scrapeMarkdown(`${origin}/contact`, { onlyMainContent: false }).catch(() => null) : null;

  const pages = [
    { url: job.institution_url, markdown: homepage.markdown },
    ...(contact?.markdown ? [{ url: `${origin}/contact`, markdown: contact.markdown }] : []),
  ].filter((p) => p.markdown && p.markdown.length > 50);

  if (pages.length === 0) return { fields: [] };

  const prompt = `Institution: ${job.institution_name ?? job.institution_url}
Find these missing fields: ${missing.map((f) => FIELD_LABELS[f]).join(", ")}.

${pages.map((p) => `--- Page: ${p.url} ---\n${truncateMarkdown(p.markdown, 20000)}`).join("\n\n")}`;

  const result = await extractJson<{ results?: { field: string; value: string; source_url?: string }[] }>({
    system: SYSTEM,
    prompt,
    tier: "lite",
  });

  const missingSet = new Set(missing);
  return {
    fields: (result.results ?? [])
      .filter((r) => missingSet.has(r.field) && r.value?.trim())
      .map((r) => ({
        field: r.field,
        label: FIELD_LABELS[r.field] ?? r.field,
        value: r.value.trim(),
        source_url: r.source_url ?? null,
      })),
  };
}
