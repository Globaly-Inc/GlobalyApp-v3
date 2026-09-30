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
 * Built-in thresholds: TYPESAFE_API_KEY alone switches every extraction feature on with these.
 * Deliberately strict — Jev acts only when it is very sure, and everything below falls through to
 * the pre-Jev behaviour — because none has been tuned on our data yet. Loosen per feature with its
 * env var after `scripts/eval-jev-page-gate.ts` and a few reviewed jobs.
 *   JEV_URL_CLASSIFY_MIN  confident per-URL category, else the path heuristic
 *   JEV_PAGE_GATE_MIN     skip the Gemini call only when P(programme page) is BELOW this (low = safe)
 *   JEV_PICK_MIN_CONF     fill an empty duration / tuition
 *   JEV_VERIFY_DROP_MIN   drop an item as wrong-for-this-course (destructive: highest bar)
 *   JEV_LOOKUP_MIN        link an unlinked degree level / subject area
 *   JEV_LINK_MIN          link a campus / fee / intake / unit / requirement / scholarship to a course
 */
export const JEV_DEFAULTS = {
  JEV_URL_CLASSIFY_MIN: 0.7,
  JEV_PAGE_GATE_MIN: 0.05,
  JEV_PICK_MIN_CONF: 0.85,
  JEV_VERIFY_DROP_MIN: 0.95,
  JEV_LOOKUP_MIN: 0.85,
  JEV_LINK_MIN: 0.85,
} as const;

/**
 * The threshold for one feature: null (off) without TYPESAFE_API_KEY or when the env var is "0" /
 * "off"; the env var when it is a number strictly between 0 and 1; otherwise the built-in default.
 */
export function jevThreshold(envVar: keyof typeof JEV_DEFAULTS): number | null {
  if (!isJevConfigured()) return null;
  const raw = (process.env[envVar] ?? "").trim().toLowerCase();
  if (raw === "0" || raw === "off" || raw === "false") return null;
  const v = Number(raw);
  return raw && v > 0 && v < 1 ? v : JEV_DEFAULTS[envVar];
}
