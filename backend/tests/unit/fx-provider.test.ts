// FX provider payload parsing (G7).
//
// The vendor is the one part of the FX cache that is not under our control, so this
// is the boundary where its JSON becomes exact decimal strings. Every case is about
// the same rule: a bad rate must degrade to "fewer rates", never to a NaN, an
// Infinity, a zero or a negative in a price.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { config } from "../../src/config.js";
import {
  FxUnavailableError,
  getFxProvider,
  isFxProviderConfigured,
  parseProviderRates,
  setFxProvider,
} from "../../src/modules/fx/services/provider.js";

describe("parseProviderRates", () => {
  it("keeps only the cached symbol set, as fixed 10-decimal strings", () => {
    expect(
      parseProviderRates({ USD: 0.65, NPR: 88.5, INR: 54.2, CAD: 0.89, GBP: 0.51, ZAR: 12.1 }),
    ).toEqual({
      USD: "0.6500000000",
      NPR: "88.5000000000",
      INR: "54.2000000000",
      CAD: "0.8900000000",
      GBP: "0.5100000000",
    });
  });

  it("accepts a numeric string, because vendors change their minds", () => {
    expect(parseProviderRates({ USD: "0.6512345678" })).toEqual({ USD: "0.6512345678" });
  });

  it("drops a missing symbol rather than defaulting it", () => {
    // A defaulted rate is a wrong price. Absent is honest; 1.0 is not.
    expect(parseProviderRates({ USD: 0.65 })).toEqual({ USD: "0.6500000000" });
  });

  it("drops null, undefined, NaN, Infinity, zero, negatives and junk", () => {
    expect(
      parseProviderRates({
        USD: null,
        NPR: undefined,
        INR: Number.NaN,
        CAD: Number.POSITIVE_INFINITY,
        GBP: 0,
      }),
    ).toEqual({});
    expect(parseProviderRates({ USD: -1 })).toEqual({});
    expect(parseProviderRates({ USD: "not a number" })).toEqual({});
    expect(parseProviderRates({ USD: { nested: 1 } })).toEqual({});
  });

  it("returns an empty set for a missing payload", () => {
    expect(parseProviderRates(null)).toEqual({});
    expect(parseProviderRates(undefined)).toEqual({});
    expect(parseProviderRates({})).toEqual({});
  });
});

// The live vendor call.
//
// No FX credential exists in this environment, so the live provider was never
// executed by any other test. `fetch` is stubbed here instead of a key being
// invented: what is under test is how the vendor RESPONSES are handled, and that
// does not need a real account.

describe("getFxProvider / isFxProviderConfigured", () => {
  afterEach(() => {
    setFxProvider(null);
    delete (config as Record<string, unknown>).FX_API_KEY;
  });

  it("reports unconfigured, and hands back no provider, when there is no key", () => {
    delete (config as Record<string, unknown>).FX_API_KEY;
    expect(isFxProviderConfigured()).toBe(false);
    // null rather than a throw: an absent key is a routine cache-miss path, not a bug.
    expect(getFxProvider()).toBeNull();
  });

  it("counts an injected stub as configured", () => {
    delete (config as Record<string, unknown>).FX_API_KEY;
    setFxProvider({ async fetchRates() { return {}; } });
    expect(isFxProviderConfigured()).toBe(true);
    expect(getFxProvider()).not.toBeNull();
  });

  it("prefers the injected stub over a real key, so tests never call out", () => {
    (config as Record<string, unknown>).FX_API_KEY = "real-key";
    const stub = { async fetchRates() { return { USD: "1.0000000000" }; } };
    setFxProvider(stub);
    expect(getFxProvider()).toBe(stub);
  });

  it("returns the live provider once a key is present", () => {
    (config as Record<string, unknown>).FX_API_KEY = "real-key";
    expect(isFxProviderConfigured()).toBe(true);
    expect(getFxProvider()).not.toBeNull();
  });
});

describe("live exchangerate-api provider", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    (config as Record<string, unknown>).FX_API_KEY = "test-key";
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    setFxProvider(null);
    delete (config as Record<string, unknown>).FX_API_KEY;
  });

  const stubFetch = (body: unknown, ok = true, status = 200) => {
    const calls: string[] = [];
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url));
      return { ok, status, json: async () => body } as Response;
    }) as unknown as typeof fetch;
    return calls;
  };

  it("calls the documented endpoint for the base currency and returns exact strings", async () => {
    const calls = stubFetch({ result: "success", conversion_rates: { USD: 0.65, GBP: 0.51 } });
    const rates = await getFxProvider()!.fetchRates("AUD");

    expect(calls[0]).toBe("https://v6.exchangerate-api.com/v6/test-key/latest/AUD");
    expect(rates).toEqual({ USD: "0.6500000000", GBP: "0.5100000000" });
  });

  it("throws on a non-success payload, so the caller falls back instead of caching junk", async () => {
    stubFetch({ result: "error", "error-type": "invalid-key" });
    await expect(getFxProvider()!.fetchRates("AUD")).rejects.toThrow(/invalid-key/);
  });

  it("throws on a non-2xx response", async () => {
    stubFetch({}, false, 502);
    await expect(getFxProvider()!.fetchRates("AUD")).rejects.toThrow(/502/);
  });

  it("throws when the payload has no usable rate rather than caching an empty set", async () => {
    // An empty cache write would look like a successful refresh and suppress the
    // stale fallback for the next 6 hours.
    stubFetch({ result: "success", conversion_rates: { ZAR: 12 } });
    await expect(getFxProvider()!.fetchRates("AUD")).rejects.toThrow(/no usable rates/);
  });

  it("throws FxUnavailableError if the key vanishes between check and call", async () => {
    stubFetch({ result: "success", conversion_rates: { USD: 0.65 } });
    const provider = getFxProvider()!;
    delete (config as Record<string, unknown>).FX_API_KEY;
    await expect(provider.fetchRates("AUD")).rejects.toBeInstanceOf(FxUnavailableError);
  });
});
