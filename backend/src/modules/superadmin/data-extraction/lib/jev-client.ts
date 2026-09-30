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

/** A 0–1 threshold from the environment, or null (feature off) when Jev or the value is missing. */
export function jevThreshold(envVar: string): number | null {
  const v = Number(process.env[envVar]);
  return isJevConfigured() && v > 0 && v < 1 ? v : null;
}
