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

describe("the live embedBatch path", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  /** One Gemini embedContent response, of whatever width the test wants. */
  const reply = (values: number[]) =>
    ({ ok: true, json: async () => ({ embedding: { values } }) }) as unknown as Response;

  it("embeds every text and normalises each vector", async () => {
    withKey("test-key");
    const calls: string[] = [];
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push(String(url));
      const body = JSON.parse(String(init?.body)) as { content: { parts: { text: string }[] } };
      // Only one non-zero component, encoding the input length — enough to tell the
      // two results apart and to check that normalisation happened.
      const values = new Array(EMBEDDING_DIMS).fill(0);
      values[0] = body.content.parts[0].text.length;
      return reply(values);
    }) as typeof globalThis.fetch;

    const vectors = await getEmbeddingProvider().embedBatch(["short", "much longer text"]);

    expect(vectors).toHaveLength(2);
    expect(calls).toHaveLength(2);
    for (const url of calls) expect(url).toContain(config.GEMINI_EMBEDDING_MODEL);
    for (const vector of vectors) {
      expect(vector).toHaveLength(EMBEDDING_DIMS);
      expect(vector[0]).toBeCloseTo(1);
    }
  });

  it("refuses a vector of the wrong width rather than storing it", async () => {
    withKey("test-key");
    globalThis.fetch = (async () => reply(new Array(768).fill(0.1))) as typeof globalThis.fetch;
    await expect(getEmbeddingProvider().embedBatch(["anything"])).rejects.toThrow(/768 dims/);
  });

  it("surfaces a provider HTTP error", async () => {
    withKey("test-key");
    globalThis.fetch = (async () =>
      ({ ok: false, status: 429, text: async () => "rate limited" }) as unknown as Response) as typeof globalThis.fetch;
    await expect(getEmbeddingProvider().embedBatch(["anything"])).rejects.toThrow(/429/);
  });
});
