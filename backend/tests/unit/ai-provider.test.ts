// The fail-closed contract of the model seam, with no network and no key.

import { afterEach, describe, expect, it } from "vitest";

import { config } from "../../src/config.js";
import {
  AiProviderUnavailableError,
  assertProviderConfigured,
  getAiProvider,
  isProviderConfigured,
  setAiProvider,
  type AiProvider,
} from "../../src/modules/ai-counsellor/services/provider.js";

const stub: AiProvider = {
  model: "stub-model",
  async streamChat() {
    return { fullText: "", usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
  },
  async generateTitle() {
    return "stub";
  },
};

const mutableConfig = config as unknown as Record<string, unknown>;

afterEach(() => {
  setAiProvider(null);
  delete mutableConfig.GEMINI_API_KEY;
});

describe("provider fail-closed", () => {
  it("reports itself unconfigured with no key and no stub", () => {
    delete mutableConfig.GEMINI_API_KEY;
    expect(isProviderConfigured()).toBe(false);
  });

  it("throws a 503 rather than returning a usable client", () => {
    delete mutableConfig.GEMINI_API_KEY;
    expect(() => getAiProvider()).toThrow(AiProviderUnavailableError);

    try {
      getAiProvider();
      throw new Error("expected a throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AiProviderUnavailableError);
      expect((err as AiProviderUnavailableError).statusCode).toBe(503);
      expect((err as AiProviderUnavailableError).code).toBe("AI_PROVIDER_UNAVAILABLE");
    }
  });

  it("assertProviderConfigured is the pre-stream gate", () => {
    delete mutableConfig.GEMINI_API_KEY;
    expect(() => assertProviderConfigured()).toThrow(AiProviderUnavailableError);

    setAiProvider(stub);
    expect(() => assertProviderConfigured()).not.toThrow();
  });

  it("hands out the live provider once a key is present", () => {
    mutableConfig.GEMINI_API_KEY = "test-key";
    expect(isProviderConfigured()).toBe(true);
    // The live Gemini object, not the stub — its model tracks config.
    expect(getAiProvider().model).toBe(config.GEMINI_MODEL);
  });

  it("prefers an injected provider over the live one", () => {
    mutableConfig.GEMINI_API_KEY = "test-key";
    setAiProvider(stub);
    expect(getAiProvider().model).toBe("stub-model");
  });

  it("clearing the injected provider restores the fail-closed behaviour", () => {
    setAiProvider(stub);
    expect(isProviderConfigured()).toBe(true);
    setAiProvider(null);
    expect(isProviderConfigured()).toBe(false);
  });
});
