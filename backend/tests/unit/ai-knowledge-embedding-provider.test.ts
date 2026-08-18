// Fail-closed embedding provider — the same contract billing's stripe.client.ts
// applies to Stripe: no key means an honest 503, never a stub success and never a
// placeholder vector.

import { afterEach, describe, expect, it } from "vitest";
import { config } from "../../src/config.js";
import {
  EmbeddingUnavailableError,
  currentEmbeddingModel,
  getEmbeddingProvider,
  isEmbeddingConfigured,
} from "../../src/modules/superadmin/ai-knowledge/lib/embedding-provider.js";
import { EMBEDDING_DIMS } from "../../src/modules/superadmin/data-extraction/lib/llm-client.js";

const originalKey = config.GEMINI_API_KEY;

function withKey(key: string | undefined) {
  if (key === undefined) delete config.GEMINI_API_KEY;
  else config.GEMINI_API_KEY = key;
}

afterEach(() => withKey(originalKey));

describe("embedding provider", () => {
  it("reports itself unconfigured when no API key is set", () => {
    withKey(undefined);
    expect(isEmbeddingConfigured()).toBe(false);
  });

  it("throws a 503 AppError rather than returning a stub provider", () => {
    withKey(undefined);
    expect(() => getEmbeddingProvider()).toThrow(EmbeddingUnavailableError);
    try {
      getEmbeddingProvider();
      expect.unreachable("getEmbeddingProvider must throw without a key");
    } catch (e) {
      expect(e).toBeInstanceOf(EmbeddingUnavailableError);
      expect((e as EmbeddingUnavailableError).statusCode).toBe(503);
      expect((e as EmbeddingUnavailableError).code).toBe("EMBEDDING_UNAVAILABLE");
    }
  });

  it("returns a provider declaring the configured model and the schema width", () => {
    withKey("test-key");
    const provider = getEmbeddingProvider();
    expect(provider.model).toBe(config.GEMINI_EMBEDDING_MODEL);
    expect(provider.dims).toBe(EMBEDDING_DIMS);
    expect(typeof provider.embedBatch).toBe("function");
  });

  it("names the configured model even when unconfigured, so pending rows can be labelled", () => {
    withKey(undefined);
    expect(currentEmbeddingModel()).toBe(config.GEMINI_EMBEDDING_MODEL);
    expect(isEmbeddingConfigured()).toBe(false);
  });
});
