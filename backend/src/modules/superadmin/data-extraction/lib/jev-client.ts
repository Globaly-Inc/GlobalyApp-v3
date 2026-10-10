// TypeSafe's Jev for extraction: typed judgments (noul = P(yes), choice = one of our options) that
// code composes. Every caller treats a thrown call as "no answer" and keeps its non-Jev path.

import { TypeSafeClient, type Questions, type SystemOneRequest, type SystemOneResult } from "@typesafe-ai/sdk";
import { config } from "../../../../config.js";

/** Pinned, not jev-latest: thresholds are tuned against this version's probabilities. */
export const JEV_MODEL = "jev-1.13.0";
const TIMEOUT_MS = 5_000;

export const isJevConfigured = (): boolean => !!config.TYPESAFE_API_KEY;

let client: TypeSafeClient | null = null;

export const _jevDeps = {
  systemOne: <const Q extends Questions>(request: SystemOneRequest<Q>): Promise<SystemOneResult<Q>> => {
    if (!client) client = new TypeSafeClient({ apiKey: config.TYPESAFE_API_KEY, timeout: TIMEOUT_MS, logLevel: "warn" });
    return client.systemOne({ model: JEV_MODEL, ...request }, { timeout: TIMEOUT_MS });
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
