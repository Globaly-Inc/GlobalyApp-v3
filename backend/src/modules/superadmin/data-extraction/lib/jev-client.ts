// TypeSafe's Jev for extraction: typed judgments (noul = P(yes), choice = one of our options) that
// code composes. Every caller treats a thrown call as "no answer" and keeps its non-Jev path.

import { TypeSafeClient, type Questions, type SystemOneRequest, type SystemOneResult } from "@typesafe-ai/sdk";
import { config } from "../../../../config.js";
import { getLlmContext, recordUsage } from "./llm-client.js";
import { createChildLogger } from "../../../../shared/logger.js";

const logger = createChildLogger("jev-client");

/** Pinned, not jev-latest: thresholds are tuned against this version's probabilities. */
export const JEV_MODEL = "jev-1.13.0";

/** Measured 2026-10-14: a 40-question batch carrying 300-char excerpts answers in 1,256ms (71.7KB
 *  payload). 5s was therefore not obviously thin — until you count the page GATE, which ships up to
 *  40,000 characters of one page, and four batches running concurrently against a cold connection.
 *  Every caller treats a timeout as "no answer" and silently falls back to the expensive path, so a
 *  timeout costs far more than the wait it saves. */
const TIMEOUT_MS = Math.max(1_000, Number(process.env.JEV_TIMEOUT_MS) || 15_000);

/** One retry. Every Jev caller swallows a failure and falls back — the URL classifier to a Gemini
 *  pass costing ~1.47M prompt tokens a job, the gate to a full extraction — so a second 1.2s
 *  attempt is the cheapest thing in the pipeline. Measured need: of eleven recent url_classify
 *  runs, five got ZERO confident answers out of Jev while others on the same day got 6,526 of
 *  7,287; the reason was never persisted, which is what the metering below exists to end. */
const RETRIES = 1;
const RETRY_PAUSE_MS = 250;

export const isJevConfigured = (): boolean => !!config.TYPESAFE_API_KEY;

let client: TypeSafeClient | null = null;

export const _jevDeps = {
  systemOne: async <const Q extends Questions>(request: SystemOneRequest<Q>): Promise<SystemOneResult<Q>> => {
    if (!client) client = new TypeSafeClient({ apiKey: config.TYPESAFE_API_KEY, timeout: TIMEOUT_MS, logLevel: "warn" });
    let lastErr: unknown;
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      try {
        const result = await client.systemOne({ model: JEV_MODEL, ...request }, { timeout: TIMEOUT_MS });
        // Metered like every Gemini call, under its own `jev:` kind and its own model, so a job's
        // Jev spend and ANSWER RATE are visible beside the Gemini pass it is supposed to replace.
        // Until now Jev wrote zero rows to extraction_llm_usage: the one feature meant to cut the
        // model bill was the only one whose own bill, and whose silent failures, nothing recorded.
        recordUsage(JEV_MODEL,
          { promptTokenCount: result.usage?.input_tokens ?? 0, candidatesTokenCount: result.usage?.output_tokens ?? 0 },
          { kind: `jev:${getLlmContext()?.kind ?? "unknown"}` });
        return result;
      } catch (err) {
        lastErr = err;
        if (attempt < RETRIES) {
          logger.warn("Jev call failed, retrying once", { err: err instanceof Error ? err.message : String(err) });
          await new Promise((r) => setTimeout(r, RETRY_PAUSE_MS));
        }
      }
    }
    throw lastErr;
  },
};

/**
 * Built-in thresholds: TYPESAFE_API_KEY alone switches on every feature that can only ADD data, at
 * these strict values. The two that can take data away — skipping a page's extraction and deleting a
 * course item — are OFF (null) by default and need their env var set on purpose, because none of this
 * has been tuned on our data yet (review, 2026-09-30: defaults that "miss course pages and remove valid
 * course details" were blocking). Loosen per feature after `scripts/eval-jev-page-gate.ts` and a few
 * reviewed jobs.
 *   JEV_URL_CLASSIFY_MIN  confident per-URL category; unsure URLs still get the lite-model pass
 *   JEV_PAGE_GATE_MIN     OFF by default — skip the Gemini call when P(programme page) is below it
 *   JEV_PICK_MIN_CONF     fill an empty duration / tuition
 *   JEV_VERIFY_FLAG_MIN   REPORT a course item as suspect on the timeline (never deletes)
 *   JEV_VERIFY_DROP_MIN   OFF by default — delete an item Jev is this sure is wrong for the course
 *   JEV_LOOKUP_MIN        link an unlinked degree level / subject area
 *   JEV_LINK_MIN          link a campus / fee / intake / unit / requirement / scholarship to a course
 */
export const JEV_DEFAULTS: Record<string, number | null> = {
  JEV_URL_CLASSIFY_MIN: 0.7,
  JEV_PAGE_GATE_MIN: null,
  JEV_PICK_MIN_CONF: 0.85,
  JEV_VERIFY_FLAG_MIN: 0.9,
  JEV_VERIFY_DROP_MIN: null,
  JEV_LOOKUP_MIN: 0.85,
  JEV_LINK_MIN: 0.85,
};
export type JevSetting = "JEV_URL_CLASSIFY_MIN" | "JEV_PAGE_GATE_MIN" | "JEV_PICK_MIN_CONF" | "JEV_VERIFY_FLAG_MIN"
  | "JEV_VERIFY_DROP_MIN" | "JEV_LOOKUP_MIN" | "JEV_LINK_MIN";

export function jevThreshold(envVar: keyof typeof JEV_DEFAULTS): number | null {
  if (!isJevConfigured()) return null;
  const raw = (process.env[envVar] ?? "").trim().toLowerCase();
  if (raw === "0" || raw === "off" || raw === "false") return null;
  const v = Number(raw);
  return raw && v > 0 && v < 1 ? v : JEV_DEFAULTS[envVar] ?? null;
}
