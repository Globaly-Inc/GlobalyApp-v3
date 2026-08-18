// FX provider payload parsing (G7).
//
// The vendor is the one part of the FX cache that is not under our control, so this
// is the boundary where its JSON becomes exact decimal strings. Every case is about
// the same rule: a bad rate must degrade to "fewer rates", never to a NaN, an
// Infinity, a zero or a negative in a price.

import { describe, expect, it } from "vitest";

import { parseProviderRates } from "../../src/modules/fx/services/provider.js";

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
