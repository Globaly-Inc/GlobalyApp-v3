// The metering arithmetic and the scope-ownership rule, with no database in sight.

import { describe, expect, it } from "vitest";

import {
  DEFAULT_MODEL_RATE,
  MODEL_RATES,
  TOKENS_PER_CREDIT,
  costMicros,
  creditsFor,
  estimateTokens,
  rateFor,
  tokensFromChars,
} from "../../src/modules/ai-counsellor/consts.js";
import { ownsSession, type ChatScope } from "../../src/modules/ai-counsellor/services/scope.js";

describe("creditsFor", () => {
  it("charges nothing when no completion reached the client", () => {
    // The rule that stops a stream dying before its first byte from costing a credit.
    expect(creditsFor(5_000, 0)).toBe(0);
    expect(creditsFor(0, 0)).toBe(0);
    expect(creditsFor(0, -1)).toBe(0);
  });

  it("charges at least one credit for anything delivered", () => {
    expect(creditsFor(1, 1)).toBe(1);
    expect(creditsFor(0, TOKENS_PER_CREDIT)).toBe(1);
  });

  it("scales with total tokens, rounding up", () => {
    expect(creditsFor(TOKENS_PER_CREDIT, TOKENS_PER_CREDIT)).toBe(2);
    expect(creditsFor(1_200, 2_800)).toBe(4);
    expect(creditsFor(1_200, 2_801)).toBe(5);
  });

  it("never charges a partial answer more than the whole one", () => {
    const whole = creditsFor(1_200, 2_800);
    for (const delivered of [1, 100, 900, 2_799, 2_800]) {
      expect(creditsFor(1_200, delivered)).toBeLessThanOrEqual(whole);
    }
  });
});

describe("costMicros", () => {
  it("prices prompt and completion tokens separately", () => {
    const rate = MODEL_RATES["gemini-2.5-pro"];
    expect(rate).toBeDefined();
    expect(costMicros("gemini-2.5-pro", 1_000_000, 0)).toBe(Math.round(1_000_000 * rate.prompt));
    expect(costMicros("gemini-2.5-pro", 0, 1_000_000)).toBe(Math.round(1_000_000 * rate.completion));
  });

  it("falls back to a real rate for an unknown model, never to zero", () => {
    expect(rateFor("some-model-nobody-listed")).toEqual(DEFAULT_MODEL_RATE);
    expect(costMicros("some-model-nobody-listed", 10_000, 10_000)).toBeGreaterThan(0);
  });

  it("is zero only when there are no tokens", () => {
    expect(costMicros("gemini-3.5-flash", 0, 0)).toBe(0);
  });
});

describe("token estimation", () => {
  it("rounds up to whole tokens", () => {
    expect(tokensFromChars(0)).toBe(0);
    expect(tokensFromChars(1)).toBe(1);
    expect(tokensFromChars(4)).toBe(1);
    expect(tokensFromChars(5)).toBe(2);
  });

  it("estimates from the delivered text only", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("12345678")).toBe(2);
  });

  it("is monotonic, so more delivered can never cost less", () => {
    const text = "x".repeat(500);
    let previous = 0;
    for (let i = 0; i <= 500; i += 25) {
      const current = estimateTokens(text.slice(0, i));
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });
});

describe("ownsSession", () => {
  const personal: ChatScope = { ownerType: "user", userId: 7, businessId: null };
  const business: ChatScope = { ownerType: "business", userId: 7, businessId: 42 };

  const personalSession = { owner_type: "user", platform_user_id: 7, business_id: null };
  const businessSession = { owner_type: "business", platform_user_id: 7, business_id: 42 };

  it("matches a scope to its own session", () => {
    expect(ownsSession(personal, personalSession)).toBe(true);
    expect(ownsSession(business, businessSession)).toBe(true);
  });

  it("refuses to cross the personal/business line in either direction", () => {
    expect(ownsSession(personal, businessSession)).toBe(false);
    expect(ownsSession(business, personalSession)).toBe(false);
  });

  it("keeps one user out of another's personal session", () => {
    expect(ownsSession(personal, { ...personalSession, platform_user_id: 8 })).toBe(false);
  });

  it("keeps one business out of another's session, same author or not", () => {
    expect(ownsSession(business, { ...businessSession, business_id: 43 })).toBe(false);
    // Any seat in the owning business does see it — that is the business counsellor.
    expect(ownsSession(business, { ...businessSession, platform_user_id: 999 })).toBe(true);
  });
});
