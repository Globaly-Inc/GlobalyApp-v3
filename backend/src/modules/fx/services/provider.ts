// The only seam between the FX cache and a rate vendor.
//
// Shaped exactly like ai-counsellor/services/provider.ts, for the same reason: no
// FX provider credential exists in this environment, so the code must be honest
// about that rather than invent a rate. `setFxProvider()` swaps in a deterministic
// stub, which is what makes the whole decision table — fresh, stale, unconfigured,
// upstream-down — testable with no network and no key.
//
// RATES ARE STRINGS ACROSS THIS BOUNDARY. `parseProviderRates` takes the vendor's
// JSON numbers and renders them to fixed decimal strings once, at the edge, so
// nothing downstream — cache write, cache read, comparison — ever runs a rate
// through a float again. See 20260817_841_fx_rate_cache.ts.

import { config } from "../../../config.js";
import { AppError } from "../../../shared/errors.js";
import { BASE_CURRENCY, SYMBOLS } from "../consts.js";

export class FxUnavailableError extends AppError {
  constructor(message = "FX rates unavailable") {
    super(message, 503, "FX_UNAVAILABLE");
  }
}

/** Decimal places stored per rate — must match `numeric(20,10)`. */
const RATE_SCALE = 10;

export interface FxProvider {
  /** Quote currency → rate, as fixed-scale decimal strings. */
  fetchRates(base: string): Promise<Record<string, string>>;
}

const FX_API_HOST = "https://v6.exchangerate-api.com";

/**
 * Narrow a vendor payload to the symbols we cache, as exact strings.
 *
 * Exported for its own unit test: a vendor that starts returning strings, nulls or
 * a partial symbol set must degrade to "fewer rates", never to `NaN` in a price.
 */
export function parseProviderRates(raw: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  for (const symbol of SYMBOLS) {
    const value = raw[symbol];
    const num = typeof value === "string" ? Number(value) : value;
    if (typeof num !== "number" || !Number.isFinite(num) || num <= 0) continue;
    out[symbol] = num.toFixed(RATE_SCALE);
  }
  return out;
}

/** exchangerate-api.com, the provider V1 and V2 both use. */
const exchangeRateApiProvider: FxProvider = {
  async fetchRates(base: string): Promise<Record<string, string>> {
    const apiKey = config.FX_API_KEY;
    if (!apiKey) throw new FxUnavailableError();

    const res = await fetch(`${FX_API_HOST}/v6/${apiKey}/latest/${base}`);
    const json = (await res.json()) as {
      result?: string;
      conversion_rates?: Record<string, unknown>;
      "error-type"?: string;
    };
    if (!res.ok || json.result !== "success" || !json.conversion_rates) {
      throw new Error(`exchangerate-api error: ${json["error-type"] ?? res.status}`);
    }

    const rates = parseProviderRates(json.conversion_rates);
    if (Object.keys(rates).length === 0) {
      throw new Error(`exchangerate-api returned no usable rates for ${base}`);
    }
    return rates;
  },
};

let override: FxProvider | null = null;

/** Tests inject a stub here; pass null to restore the live (or absent) provider. */
export function setFxProvider(provider: FxProvider | null): void {
  override = provider;
}

/** True when the operator has supplied enough config to refill the cache. */
export function isFxProviderConfigured(): boolean {
  return override !== null || Boolean(config.FX_API_KEY);
}

/** Null — not a throw — when unconfigured: a missing key is a routine cache-miss path. */
export function getFxProvider(): FxProvider | null {
  if (override) return override;
  if (!config.FX_API_KEY) return null;
  return exchangeRateApiProvider;
}

export { BASE_CURRENCY };
