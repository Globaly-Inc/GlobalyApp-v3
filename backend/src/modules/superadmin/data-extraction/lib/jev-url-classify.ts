// Jev as the URL classifier: one `choice` per URL over the site categories, 40 URLs a request.
// The lite-model classifier it replaces returns the URLs it keeps as an echoed list, so anything it
// omits is silently lost (Yale: 1,363 → 154) and a whole batch can come back empty; a per-URL
// question cannot omit a URL, and each answer carries its own confidence. Below JEV_URL_CLASSIFY_MIN
// the URL keeps the free heuristic's verdict. ON whenever TYPESAFE_API_KEY is set ("0" = off).

import { choice } from "@typesafe-ai/sdk";
import { createChildLogger } from "../../../../shared/logger.js";
import { _jevDeps, jevThreshold } from "./jev-client.js";
import { SITE_URL_CATEGORIES, SITE_URL_CATEGORY_DESCRIPTIONS, type CategoryVerdict, type SiteUrlCategory } from "./url-categories.js";

const logger = createChildLogger("jev-url-classify");

const BATCH = 40;
const CRITERIA = Object.fromEntries(SITE_URL_CATEGORIES.map((c) => [c, SITE_URL_CATEGORY_DESCRIPTIONS[c]])) as Record<SiteUrlCategory, string>;

export const _urlClassifyDeps = { minConf: (): number | null => jevThreshold("JEV_URL_CLASSIFY_MIN") };

/** url → category for every URL Jev answered at or above the threshold. A failed batch is simply absent. */
export async function jevCategorise(
  urls: string[], excerpts: Map<string, string>, minConf: number, onBatch?: () => Promise<void>,
): Promise<Map<string, SiteUrlCategory>> {
  const out = new Map<string, SiteUrlCategory>();
  for (let i = 0; i < urls.length; i += BATCH) {
    const batch = urls.slice(i, i + BATCH);
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
      logger.warn("Jev URL batch failed; those URLs keep the heuristic verdict", { batch: i / BATCH, err: err instanceof Error ? err.message : String(err) });
    }
    await onBatch?.();
  }
  return out;
}

/**
 * Per-URL verdicts when Jev classified: guided > Jev (confident) > course heuristic > path heuristic
 * > other. Jev outranks the heuristics because it read the page's first words, not just its path —
 * a heuristic "course" (researchguides…/nur334) Jev confidently calls `other` stays other. Pure.
 */
export function jevVerdicts(
  urls: string[], jev: Map<string, SiteUrlCategory>, guided: Map<string, SiteUrlCategory>,
  isCourse: (url: string) => boolean, heuristic: (url: string) => SiteUrlCategory | null,
): Map<string, CategoryVerdict> {
  const out = new Map<string, CategoryVerdict>();
  for (const url of urls) {
    const g = guided.get(url);
    const j = jev.get(url);
    const h = heuristic(url);
    out.set(url, g ? { category: g, source: "guided" }
      : j ? { category: j, source: "jev" }
        : isCourse(url) ? { category: "course", source: "heuristic" }
          : { category: h ?? "other", source: "heuristic" });
  }
  for (const [url, cat] of guided) out.set(url, { category: cat, source: "guided" });
  return out;
}
