// The FX cache's decision table, which is the whole feature.
//
// V2's route (apps/core-api/src/routes/fx-rates.ts) was read and this reproduces it
// exactly, because it is the right answer and the reasoning is worth writing down:
// a slightly stale rate beats a broken price, so a stale cached snapshot is ALWAYS
// preferred over failing. 503 happens only when there is no snapshot to fall back
// to at all.
//
//   cache fresh (< 6h)                    → 200 { rates, stale: false }
//   cache stale, no provider configured   → 200 { rates, stale: true }
//   cache stale, provider refill works    → 200 { rates, stale: false }
//   cache stale, provider refill fails    → 200 { rates, stale: true }
//   NO cache,   no provider configured    → 503
//   NO cache,   provider refill fails     → 503
//
// The two 503 rows are the fail-closed requirement: with nothing cached and no way
// to fill the cache, this returns an honest 503 and never a made-up rate. It is the
// same class of defect §1.6 flags in V1 — a function that answered HTTP 200 with a
// fabricated result when its provider was unreachable.

import { createChildLogger } from "../../../shared/logger.js";
import { BASE_CURRENCY, CACHE_TTL_MS } from "../consts.js";
import * as repo from "../repositories/fx.repository.js";
import { FxUnavailableError, getFxProvider } from "./provider.js";

const logger = createChildLogger("fx-service");

export interface FxRatesResult {
  /** Quote currency → rate. Numbers, matching V2's response contract. */
  rates: Record<string, number>;
  /** True when these rates came from a snapshot older than the TTL. */
  stale: boolean;
}

/** One conversion point, at the HTTP boundary. Storage stays exact. */
function toNumbers(rates: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [quote, rate] of Object.entries(rates)) out[quote] = Number(rate);
  return out;
}

export async function getRates(baseCurrency: string = BASE_CURRENCY): Promise<FxRatesResult> {
  const cached = await repo.latestSnapshot(baseCurrency);
  const hasCache = Boolean(cached && Object.keys(cached.rates).length > 0);

  if (cached && hasCache && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
    return { rates: toNumbers(cached.rates), stale: false };
  }

  /** Stale cache if there is one, otherwise fail closed. Never a fabricated rate. */
  const fallback = (): FxRatesResult => {
    if (cached && hasCache) return { rates: toNumbers(cached.rates), stale: true };
    throw new FxUnavailableError();
  };

  const provider = getFxProvider();
  if (!provider) {
    logger.warn("No FX provider configured", { baseCurrency, hasCache });
    return fallback();
  }

  try {
    const rates = await provider.fetchRates(baseCurrency);
    if (Object.keys(rates).length === 0) return fallback();
    await repo.saveSnapshot(baseCurrency, rates);
    return { rates: toNumbers(rates), stale: false };
  } catch (err) {
    logger.error("Live FX fetch failed", { baseCurrency, err: String(err) });
    return fallback();
  }
}
