// Cross-app shared-secret authentication + staging mappers (G7, §3.4).
//
// These endpoints are machine-to-machine, so the credential is a pre-shared secret
// in a header — V1's contract, kept. NEITHER SECRET EXISTS in this environment, and
// the point of the auth cases below is that the absence is handled honestly: a
// missing secret is the OPERATOR's problem (503), a wrong token is the CALLER's
// problem (401), and neither is ever "open because unconfigured".
//
// V1 conflated the two: `if (!SYNC_SECRET || token !== SYNC_SECRET) return 401`, so
// an unconfigured deployment reported its own misconfiguration as your bad token.

import { describe, expect, it } from "vitest";

import { bearerToken, secretsMatch } from "../../src/modules/cross-app/shared/sync-auth.js";
import {
  durationWeeks,
  feeTotal,
  studentType,
} from "../../src/modules/cross-app/services/ingest.service.js";

describe("bearerToken", () => {
  it("extracts the token from a Bearer header, case-insensitively", () => {
    expect(bearerToken("Bearer abc123")).toBe("abc123");
    expect(bearerToken("bearer abc123")).toBe("abc123");
    expect(bearerToken("  Bearer   abc123  ")).toBe("abc123");
  });

  it("returns undefined for anything that is not a Bearer header", () => {
    expect(bearerToken(undefined)).toBeUndefined();
    expect(bearerToken("")).toBeUndefined();
    expect(bearerToken("abc123")).toBeUndefined();
    expect(bearerToken("Basic abc123")).toBeUndefined();
    expect(bearerToken("Bearer")).toBeUndefined();
    expect(bearerToken("Bearer   ")).toBeUndefined();
  });
});

describe("secretsMatch", () => {
  it("matches an identical secret", () => {
    expect(secretsMatch("s3cr3t", "s3cr3t")).toBe(true);
  });

  it("refuses a wrong, missing, empty, prefix or differently-cased secret", () => {
    expect(secretsMatch("wrong", "s3cr3t")).toBe(false);
    expect(secretsMatch(undefined, "s3cr3t")).toBe(false);
    expect(secretsMatch("", "s3cr3t")).toBe(false);
    expect(secretsMatch("s3cr3", "s3cr3t")).toBe(false);
    expect(secretsMatch("S3CR3T", "s3cr3t")).toBe(false);
  });

  it("compares secrets of different lengths without throwing", () => {
    // timingSafeEqual throws on a length mismatch, and catching that throw is
    // itself a length oracle — hence the sha256 of each side first.
    expect(secretsMatch("a", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe(false);
    expect(secretsMatch("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "a")).toBe(false);
  });
});

describe("durationWeeks", () => {
  it("converts each unit to weeks", () => {
    expect(durationWeeks({ duration_value: 3, duration_unit: "weeks" })).toBe(3);
    expect(durationWeeks({ duration_value: 6, duration_unit: "months" })).toBe(24);
    expect(durationWeeks({ duration_value: 2, duration_unit: "years" })).toBe(104);
    expect(durationWeeks({ duration_value: 14, duration_unit: "days" })).toBe(2);
  });

  it("never rounds a real duration down to zero weeks", () => {
    expect(durationWeeks({ duration_value: 1, duration_unit: "days" })).toBe(1);
    expect(durationWeeks({ duration_value: 3, duration_unit: "days" })).toBe(1);
  });

  it("defaults a missing unit to months, matching the payload's own convention", () => {
    expect(durationWeeks({ duration_value: 12, duration_unit: undefined })).toBe(48);
  });

  it("returns null when there is no duration, rather than guessing one", () => {
    expect(durationWeeks({ duration_value: undefined, duration_unit: "months" })).toBeNull();
  });
});

describe("studentType", () => {
  it("maps V1's 'all' onto V3's 'both'", () => {
    expect(studentType("all")).toBe("both");
    expect(studentType(undefined)).toBe("both");
  });

  it("passes the specific types through untouched", () => {
    expect(studentType("domestic")).toBe("domestic");
    expect(studentType("international")).toBe("international");
    expect(studentType("both")).toBe("both");
  });
});

describe("feeTotal", () => {
  it("sums items across installments as an exact 2-decimal string", () => {
    expect(
      feeTotal({
        installments: [
          { items: [{ amount: 1000 }, { amount: 250.5 }] },
          { items: [{ amount: "749.5" }] },
        ],
      }),
    ).toBe("2000.00");
  });

  it("does not drift the way float addition does", () => {
    // 0.1 + 0.2 === 0.30000000000000004. This must be "0.30".
    expect(feeTotal({ installments: [{ items: [{ amount: 0.1 }, { amount: 0.2 }] }] })).toBe("0.30");
    // Three thirds of a cent-scale figure, summed 3x, must not gain a trailing digit.
    expect(
      feeTotal({
        installments: [{ items: [{ amount: "3333.33" }, { amount: "3333.33" }, { amount: "3333.34" }] }],
      }),
    ).toBe("10000.00");
  });

  it("keeps only 2 decimals — cents, like billing's minor units", () => {
    expect(feeTotal({ installments: [{ items: [{ amount: "1.999" }] }] })).toBe("1.99");
    expect(feeTotal({ installments: [{ items: [{ amount: 5 }] }] })).toBe("5.00");
  });

  it("handles values below one unit and negatives", () => {
    expect(feeTotal({ installments: [{ items: [{ amount: "0.05" }] }] })).toBe("0.05");
    expect(feeTotal({ installments: [{ items: [{ amount: "-12.34" }] }] })).toBe("-12.34");
    expect(feeTotal({ installments: [{ items: [{ amount: 10 }, { amount: -10 }] }] })).toBe("0.00");
  });

  it("returns null for a block with no items — different from a total of zero", () => {
    expect(feeTotal({ installments: [] })).toBeNull();
    expect(feeTotal({ installments: [{ items: [] }] })).toBeNull();
  });
});
