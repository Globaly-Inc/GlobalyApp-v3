// A cheap yes/no before the full-model course extraction. That call is 80% of extraction's input
// tokens (906 calls, 9.1M tokens in 30 days, measured 2026-09-30) and roughly 69% of completed pages
// stored no course. Jev (TypeSafe System One) is billed per input token at ~1/100th of that and
// returns a calibrated P(yes), so a page it is confident is not a programme page skips the model.
//
// ON whenever TYPESAFE_API_KEY is set, at the strict default in jev-client JEV_DEFAULTS unless
// JEV_PAGE_GATE_MIN overrides it ("0" = off); tune it with `scripts/eval-jev-page-gate.ts`. Any
// failure → null → the page is extracted as before.

import { noul } from "@typesafe-ai/sdk";
import { createChildLogger } from "../../../../shared/logger.js";
import { _jevDeps, jevThreshold } from "./jev-client.js";

export { JEV_MODEL } from "./jev-client.js";

const logger = createChildLogger("jev-page-gate");

/** How much of the page Jev reads (~10k tokens, well inside its 32k budget; still ~1/12th of the
 *  120k-character Gemini call it may save). */
const STATE_CHARS = 40_000;

export const _pageGateDeps = {
  threshold: (): number | null => jevThreshold("JEV_PAGE_GATE_MIN"),
};

export const PROGRAMME_PAGE_QUESTION = noul(
  "Does this web page describe a specific degree, diploma, certificate or short course that a student can enrol in, " +
  "or list several such programmes by name?",
  {
    true: "It is a programme page, a programme listing, or a catalogue entry for a qualification",
    false: "It is news, events, a library or research guide, staff or department information, services, or a general page that only mentions programmes in passing",
  },
);

/** P(programme page), or null when the call failed. */
export async function programmePageProbability(url: string, markdown: string): Promise<number | null> {
  try {
    const { answers } = await _jevDeps.systemOne({
      state: { url, page_start: markdown.slice(0, STATE_CHARS) },
      questions: { programme: PROGRAMME_PAGE_QUESTION },
    });
    return answers.programme.noul;
  } catch (err) {
    logger.warn("Jev page gate failed; extracting the page", { url, err: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/** Skip the model call? Only when the gate is on AND Jev answered AND it is below the threshold. */
export async function shouldSkipPage(url: string, markdown: string): Promise<{ skip: boolean; p: number | null; threshold: number | null }> {
  const threshold = _pageGateDeps.threshold();
  if (threshold == null) return { skip: false, p: null, threshold };
  // A skip is final (the page is marked completed, never extracted), so it is only decided on the
  // WHOLE page: past STATE_CHARS a long nav can push the programme out of what Jev read.
  if (markdown.length > STATE_CHARS) return { skip: false, p: null, threshold };
  const p = await programmePageProbability(url, markdown);
  return { skip: p != null && p < threshold, p, threshold };
}
