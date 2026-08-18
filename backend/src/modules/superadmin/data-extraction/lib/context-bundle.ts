// Job Context Bundle — supporting documents, parsed once, reused by every step.
//
// PORTED FROM (read, not copied): V1's ingest-context edge function, which parses
// supporting_documents into a bundle and stores it on
// extraction_jobs.pipeline_progress.context_ingest.bundle.
//
// TWO DIVERGENCES FROM V1, BOTH DELIBERATE:
//
// Where the bundle lives. V3's pipeline_progress is a flat step → status map that
// every step rewrites (`progress[step] = "done"`), so parking a multi-kilobyte
// bundle inside it would make each step's status write carry the whole payload and
// race it away. The bundle goes in extraction_additional_info under the
// CONTEXT_BUNDLE_KEY, exactly like the site_intelligence blob V1 keeps there; the
// step's status goes in pipeline_progress like every other step's.
//
// What "feeding every downstream prompt" means. V1 says downstream extractors read
// the bundle, but each of its rerun-* functions re-downloads and re-parses the PDFs
// itself. Here the bundle is assembled once and contextAddendum() appends it to the
// system prompt at every extraction site, so the expensive Gemini-vision PDF pass
// happens once per job rather than once per step.

import { z } from "zod";

/** extraction_additional_info.key the bundle is stored under. */
export const CONTEXT_BUNDLE_KEY = "job_context_bundle";

/** Documents are truncated to this before the parse; V1 uses the same 80k. */
export const CONTEXT_MAX_CHARS = 80_000;

const AppliesTo = z.array(z.string()).optional();

/**
 * Tolerant on purpose: the model is instructed to omit rather than invent, so
 * every field is optional and unknown keys are dropped instead of failing the run.
 * Anything malformed is a missing entry, never a poisoned one.
 */
export const ContextBundleSchema = z.object({
  institution: z
    .object({
      name: z.string().optional(),
      legal_name: z.string().optional(),
      website: z.string().optional(),
      country: z.string().optional(),
      city: z.string().optional(),
      type: z.string().optional(),
      description: z.string().optional(),
    })
    .optional(),
  branches: z
    .array(
      z.object({
        name: z.string().optional(),
        city: z.string().optional(),
        country: z.string().optional(),
        address: z.string().optional(),
      }),
    )
    .optional(),
  courses: z
    .array(
      z.object({
        name: z.string(),
        code: z.string().optional(),
        degree_level: z.string().optional(),
        duration: z.string().optional(),
        study_mode: z.string().optional(),
        source_url: z.string().optional(),
        branch_name: z.string().optional(),
      }),
    )
    .optional(),
  fees: z
    .array(
      z.object({
        fee_type: z.string().optional(),
        amount: z.coerce.number().optional(),
        currency: z.string().optional(),
        period: z.string().optional(),
        applies_to_courses: AppliesTo,
      }),
    )
    .optional(),
  intakes: z
    .array(
      z.object({
        month: z.string().optional(),
        year: z.coerce.number().int().optional(),
        mode: z.string().optional(),
        applies_to_courses: AppliesTo,
      }),
    )
    .optional(),
  eligibility: z
    .array(
      z.object({
        requirement_type: z.string().optional(),
        value: z.string().optional(),
        condition: z.string().optional(),
        applies_to_courses: AppliesTo,
      }),
    )
    .optional(),
  units: z
    .array(
      z.object({
        name: z.string(),
        code: z.string().optional(),
        credits: z.coerce.number().optional(),
        applies_to_courses: AppliesTo,
      }),
    )
    .optional(),
});

export type ContextBundle = z.infer<typeof ContextBundleSchema>;

export interface BundleCounts {
  institution: number;
  branches: number;
  courses: number;
  fees: number;
  intakes: number;
  eligibility: number;
  units: number;
}

/**
 * Drop everything the schema does not recognise and drop array entries that fail
 * it, rather than rejecting the whole bundle over one bad row. Returns null when
 * nothing usable survives — the caller reports that as a failed step, not as an
 * empty success.
 */
export function parseBundle(raw: unknown): ContextBundle | null {
  const result = ContextBundleSchema.safeParse(raw);
  const bundle = result.success ? result.data : salvage(raw);
  if (!bundle) return null;
  return totalEntries(countBundle(bundle)) > 0 ? bundle : null;
}

/** Per-array salvage: keep the entries that parse, discard the ones that do not. */
function salvage(raw: unknown): ContextBundle | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  const institution = ContextBundleSchema.shape.institution.safeParse(input.institution);
  if (institution.success && institution.data) out.institution = institution.data;

  for (const key of ["branches", "courses", "fees", "intakes", "eligibility", "units"] as const) {
    const value = input[key];
    if (!Array.isArray(value)) continue;
    const element = ContextBundleSchema.shape[key].unwrap().element;
    const kept = value.map((entry) => element.safeParse(entry)).filter((r) => r.success).map((r) => r.data);
    if (kept.length) out[key] = kept;
  }

  const reparsed = ContextBundleSchema.safeParse(out);
  return reparsed.success ? reparsed.data : null;
}

export function countBundle(bundle: ContextBundle): BundleCounts {
  return {
    institution: bundle.institution && Object.keys(bundle.institution).length > 0 ? 1 : 0,
    branches: bundle.branches?.length ?? 0,
    courses: bundle.courses?.length ?? 0,
    fees: bundle.fees?.length ?? 0,
    intakes: bundle.intakes?.length ?? 0,
    eligibility: bundle.eligibility?.length ?? 0,
    units: bundle.units?.length ?? 0,
  };
}

export function totalEntries(counts: BundleCounts): number {
  return Object.values(counts).reduce((sum, n) => sum + n, 0);
}

export function describeBundle(counts: BundleCounts, documentCount: number): string {
  return (
    `Parsed ${documentCount} document(s): ${counts.courses} courses, ${counts.fees} fees, ` +
    `${counts.intakes} intakes, ${counts.eligibility} eligibility rules, ${counts.units} units`
  );
}

/**
 * The block appended to a downstream system prompt. Trimmed hard: the bundle is
 * pre-verified context, not the extraction target, so it is there to disambiguate
 * a scrape and must not crowd out the page being scraped.
 */
export function contextAddendum(bundle: ContextBundle | null, maxChars = 6000): string {
  if (!bundle) return "";
  const counts = countBundle(bundle);
  if (totalEntries(counts) === 0) return "";

  const json = JSON.stringify(bundle);
  const body = json.length > maxChars ? `${json.slice(0, maxChars)}…[truncated]` : json;

  return (
    `\n\nVERIFIED CONTEXT from this provider's own supporting documents. ` +
    `Prefer these values over anything scraped from the site when they disagree, ` +
    `and never contradict them:\n${body}`
  );
}
