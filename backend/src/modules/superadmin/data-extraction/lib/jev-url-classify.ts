// Jev as the URL classifier: one `choice` per URL over the site categories, 40 URLs a request.
// The lite-model classifier it replaces returns the URLs it keeps as an echoed list, so anything it
// omits is silently lost (Yale: 1,363 → 154) and a whole batch can come back empty; a per-URL
// question cannot omit a URL, and each answer carries its own confidence. Below JEV_URL_CLASSIFY_MIN
// the URL keeps the free heuristic's verdict. ON whenever TYPESAFE_API_KEY is set ("0" = off).

import { choice } from "@typesafe-ai/sdk";
import { createChildLogger } from "../../../../shared/logger.js";
import { runPool } from "./site-snapshot.js";
import { _jevDeps, jevThreshold } from "./jev-client.js";
import { SITE_URL_CATEGORIES, SITE_URL_CATEGORY_DESCRIPTIONS, type CategoryVerdict, type SiteUrlCategory } from "./url-categories.js";

const logger = createChildLogger("jev-url-classify");

const BATCH = 40;
/** Batches in flight. The loop used to be strictly sequential: bu.edu's 10,040 URLs are 251
 *  requests, and url_classify took 17 minutes of a 94-minute job doing them one at a time. Nothing
 *  here is paced by politeness — Jev is a vendor API we pay for, not a site we are a guest on — so
 *  the only reason to keep this low is the vendor's own rate limit. Drop JEV_URL_CONCURRENCY to 1
 *  if `url_classify_batches_failed` starts appearing on job timelines. */
const CONCURRENCY = Math.max(1, Math.floor(Number(process.env.JEV_URL_CONCURRENCY) || 4));
const CRITERIA = Object.fromEntries(SITE_URL_CATEGORIES.map((c) => [c, SITE_URL_CATEGORY_DESCRIPTIONS[c]])) as Record<SiteUrlCategory, string>;

export const _urlClassifyDeps = { minConf: (): number | null => jevThreshold("JEV_URL_CLASSIFY_MIN") };

/**
 * url → category for every URL Jev answered at or above the threshold, plus how many batches
 * failed. A failed batch is simply absent from `verdicts` — its 40 URLs fall back to the free
 * heuristic — so the count is REPORTED rather than logged alone: silently dropping a slice of the
 * list is the exact failure this file exists to prevent (Yale, 1,363 → 154), and running batches
 * concurrently makes a vendor rate-limit the likeliest way to hit it.
 */
export async function jevCategorise(
  urls: string[], excerpts: Map<string, string>, minConf: number, onBatch?: () => Promise<void>,
): Promise<{ verdicts: Map<string, SiteUrlCategory>; failedBatches: number; batches: number }> {
  const out = new Map<string, SiteUrlCategory>();
  const batches = Math.ceil(urls.length / BATCH);
  let failedBatches = 0;

  await runPool(batches, CONCURRENCY, async (n) => {
    const batch = urls.slice(n * BATCH, (n + 1) * BATCH);
    const questions = Object.fromEntries(batch.map((_, k) => [
      `p${k}`,
      choice(`Which category is the page \`pages[${k}]\` on this institution's website?`, CRITERIA),
    ]));
    try {
      const { answers } = await _jevDeps.systemOne({
        state: { pages: batch.map((url) => ({ url, starts_with: excerpts.get(url) ?? "" })) },
        questions,
      }) as unknown as { answers: Record<string, { choice: string; confidence: number }> };
      batch.forEach((url, k) => {
        const a = answers[`p${k}`];
        if (a && a.confidence >= minConf && (SITE_URL_CATEGORIES as readonly string[]).includes(a.choice)) out.set(url, a.choice as SiteUrlCategory);
      });
    } catch (err) {
      failedBatches++;
      logger.warn("Jev URL batch failed; those URLs keep the heuristic verdict", { batch: n, err: err instanceof Error ? err.message : String(err) });
    }
    await onBatch?.();
    return true; // one bad batch degrades its own 40 URLs; it is not a reason to stop classifying
  });
  return { verdicts: out, failedBatches, batches };
}

/**
 * Per-URL verdicts when Jev classified: guided > course heuristic > Jev (confident) > path heuristic
 * > null. Additive for courses: Jev may PROMOTE a URL to course but never demotes one the heuristic
 * already calls a course (a missed course page is lost data; a junk page only costs a model call —
 * and library hosts are already off the list via NON_CONTENT_HOST). null = nobody could place it:
 * the caller sends those to the lite-model pass, exactly as without Jev. Pure.
 */
export function jevVerdicts(
  urls: string[], jev: Map<string, SiteUrlCategory>, guided: Map<string, SiteUrlCategory>,
  isCourse: (url: string) => boolean, heuristic: (url: string) => SiteUrlCategory | null,
): Map<string, CategoryVerdict | null> {
  const out = new Map<string, CategoryVerdict | null>();
  for (const url of urls) {
    const g = guided.get(url);
    const j = jev.get(url);
    const h = heuristic(url);
    // Scholarship pages outrank the course heuristic (a catalogue host makes every URL "course"),
    // whether Jev says so or the path does — otherwise the scholarships step never sees them.
    out.set(url, g ? { category: g, source: "guided" }
      : j === "scholarships" ? { category: j, source: "jev" }
        : h === "scholarships" ? { category: h, source: "heuristic" }
      : isCourse(url) ? { category: "course", source: "heuristic" }
        : j ? { category: j, source: "jev" }
          : h ? { category: h, source: "heuristic" }
            : null);
  }
  for (const [url, cat] of guided) out.set(url, { category: cat, source: "guided" });
  return out;
}
