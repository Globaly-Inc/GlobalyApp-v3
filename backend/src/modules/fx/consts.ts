// FX cache constants — the V2 contract (apps/core-api/src/routes/fx-rates.ts),
// which V2 in turn took from V1's get-fx-rates edge function.

/** All rates are quoted against AUD, as in V1 and V2. */
export const BASE_CURRENCY = "AUD";

/** The quote set V1/V2 fetch. Anything outside it is not cached and not served. */
export const SYMBOLS = ["USD", "NPR", "INR", "CAD", "GBP"] as const;

export type Symbol_ = (typeof SYMBOLS)[number];

/** 6 hours, matching V1 and V2. Past this the snapshot is refreshed on read. */
export const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
