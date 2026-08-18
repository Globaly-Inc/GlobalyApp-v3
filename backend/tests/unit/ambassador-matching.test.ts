// Ambassador matching + payout arithmetic, and the shared URL guard.
//
// Spec for pickNextAmbassador: V1 `process-ambassador-timeout` — candidates come
// back ordered by rating desc, then the FIRST country match wins outright.

import { describe, expect, it } from "vitest";

import {
  netAmountMinor,
  pickNextAmbassador,
  type MatchCandidate,
} from "../../src/modules/ambassadors/lib/matching.js";
import {
  MIN_PAYOUT_MINOR,
  payoutIdempotencyKey,
} from "../../src/modules/ambassadors/consts.js";
import { isWebUrl, webUrl } from "../../src/shared/url.js";

const candidate = (over: Partial<MatchCandidate> & { id: number }): MatchCandidate => ({
  user_id: over.id * 10,
  country_of_origin: null,
  avg_rating: 0,
  ...over,
});

describe("pickNextAmbassador", () => {
  it("returns null when nobody is available", () => {
    expect(pickNextAmbassador([], "India")).toBeNull();
  });

  it("takes the best-rated candidate when no country matches", () => {
    const best = candidate({ id: 1, avg_rating: 4.9, country_of_origin: "Nepal" });
    expect(pickNextAmbassador([best, candidate({ id: 2, avg_rating: 3 })], "India")).toBe(best);
  });

  it("prefers a country match over a higher rating (V1's break-on-first-match)", () => {
    const topRated = candidate({ id: 1, avg_rating: 5, country_of_origin: "Nepal" });
    const sameCountry = candidate({ id: 2, avg_rating: 2, country_of_origin: "India" });
    expect(pickNextAmbassador([topRated, sameCountry], "India")).toBe(sameCountry);
  });

  it("falls back to the first candidate when the prospect has no country", () => {
    const first = candidate({ id: 1, avg_rating: 4 });
    expect(pickNextAmbassador([first, candidate({ id: 2 })], null)).toBe(first);
  });
});

describe("netAmountMinor", () => {
  it("is the gross amount when the platform takes no commission", () => {
    expect(netAmountMinor(5000, 0)).toBe(5000);
  });

  it("rounds down so the platform never pays out a fraction of a cent", () => {
    expect(netAmountMinor(999, 10)).toBe(899);
  });

  it("never returns a negative amount", () => {
    expect(netAmountMinor(0, 10)).toBe(0);
    expect(netAmountMinor(-100, 10)).toBe(0);
  });
});

describe("payoutIdempotencyKey", () => {
  it("is stable for the same ambassador + client key and distinct across either", () => {
    expect(payoutIdempotencyKey(7, "abc")).toBe(payoutIdempotencyKey(7, "abc"));
    expect(payoutIdempotencyKey(7, "abc")).not.toBe(payoutIdempotencyKey(8, "abc"));
    expect(payoutIdempotencyKey(7, "abc")).not.toBe(payoutIdempotencyKey(7, "abd"));
  });

  it("keeps V1's $20 minimum, expressed in minor units", () => {
    expect(MIN_PAYOUT_MINOR).toBe(2000);
  });
});

describe("webUrl", () => {
  const schema = webUrl({ max: 100 });

  it("accepts absolute http and https URLs", () => {
    expect(schema.parse("https://cdn.example.com/a.mp4")).toBe("https://cdn.example.com/a.mp4");
    expect(schema.safeParse("http://example.com").success).toBe(true);
  });

  it("rejects the script-bearing schemes z.string().url() lets through", () => {
    for (const hostile of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
    ]) {
      expect(isWebUrl(hostile)).toBe(false);
      expect(schema.safeParse(hostile).success).toBe(false);
    }
  });

  it("rejects relative paths and garbage", () => {
    expect(schema.safeParse("/relative/path").success).toBe(false);
    expect(schema.safeParse("not a url").success).toBe(false);
    expect(schema.safeParse("").success).toBe(false);
  });

  it("enforces the max length", () => {
    expect(schema.safeParse(`https://example.com/${"x".repeat(200)}`).success).toBe(false);
  });
});
