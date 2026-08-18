// Fail-closed embedding provider — the same contract billing's stripe.client.ts
// applies to Stripe: no key means an honest 503, never a stub success and never a
// placeholder vector.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
  const originalThrottle = process.env.LLM_THROTTLE_MS;

  beforeEach(() => {
    // The inter-call gap is real-time sleep; a unit test only cares about the logic.
    // 1, not 0 — the default is applied with `||`, so 0 reads as "unset".
    process.env.LLM_THROTTLE_MS = "1";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalThrottle === undefined) delete process.env.LLM_THROTTLE_MS;
    else process.env.LLM_THROTTLE_MS = originalThrottle;
  });

  /** One Gemini embedContent response, of whatever width the test wants. */
  const reply = (values: number[]) =>
    ({ ok: true, json: async () => ({ embedding: { values } }) }) as unknown as Response;

  /**
   * Gemini's real 429 body. `retryDelay: 0s` is honoured by the backoff, so the
   * retry path is exercised without a test that sleeps for 14 seconds.
   */
  const rateLimited = () =>
    ({
      ok: false,
      status: 429,
      text: async () =>
        JSON.stringify({
          error: {
            code: 429,
            message: "You exceeded your current quota",
            details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "0s" }],
          },
        }),
    }) as unknown as Response;

  const unitVector = () => {
    const values = new Array(EMBEDDING_DIMS).fill(0);
    values[0] = 1;
    return values;
  };

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
      ({ ok: false, status: 400, text: async () => "bad request" }) as unknown as Response) as typeof globalThis.fetch;
    await expect(getEmbeddingProvider().embedBatch(["anything"])).rejects.toThrow(/400/);
  });

  // ── Rate limiting ──
  //
  // The regression these two cover, measured on the real corpus: 207 documents were
  // published to ai_knowledge_embed at once, the consumer ran them concurrently, and
  // Gemini's per-minute limit rejected 184 of them. queueService nacks with
  // requeue=false, so every one of those documents was dropped — 39 of 8,075 chunks
  // embedded from a run that reported no failure louder than a log line.

  it("retries a rate-limited call instead of dropping the chunk", async () => {
    withKey("test-key");
    let attempts = 0;
    globalThis.fetch = (async () => {
      attempts += 1;
      return attempts === 1 ? rateLimited() : reply(unitVector());
    }) as typeof globalThis.fetch;

    const [vector] = await getEmbeddingProvider().embedBatch(["anything"]);

    expect(attempts).toBe(2);
    expect(vector).toHaveLength(EMBEDDING_DIMS);
    expect(vector[0]).toBeCloseTo(1);
  });

  it("still fails, rather than looping, when the rate limit does not clear", async () => {
    withKey("test-key");
    let attempts = 0;
    globalThis.fetch = (async () => {
      attempts += 1;
      return rateLimited();
    }) as typeof globalThis.fetch;

    await expect(getEmbeddingProvider().embedBatch(["anything"])).rejects.toThrow(/429/);
    // One attempt plus a bounded number of retries — never an unbounded loop.
    expect(attempts).toBeGreaterThan(1);
    expect(attempts).toBeLessThanOrEqual(5);
  });

  it("spaces concurrent calls, because the provider's limit is per key not per caller", async () => {
    withKey("test-key");
    const gap = 40;
    process.env.LLM_THROTTLE_MS = String(gap);

    const startedAt: number[] = [];
    globalThis.fetch = (async () => {
      startedAt.push(Date.now());
      return reply(unitVector());
    }) as typeof globalThis.fetch;

    // The embed worker runs several documents at once — each one its own queue
    // message, each calling embedBatch concurrently. A throttle that only compares
    // "now" against the last call lets every waiter wake together and fire as one
    // burst, which is precisely how 184 documents got 429'd off the real corpus.
    const provider = getEmbeddingProvider();
    await Promise.all([
      provider.embedBatch(["a"]),
      provider.embedBatch(["b"]),
      provider.embedBatch(["c"]),
      provider.embedBatch(["d"]),
    ]);

    expect(startedAt).toHaveLength(4);
    const sorted = [...startedAt].sort((x, y) => x - y);
    for (let i = 1; i < sorted.length; i += 1) {
      // Timers fire a hair early on some platforms; allow a small slack.
      expect(sorted[i] - sorted[i - 1], `call ${i} came too soon after call ${i - 1}`)
        .toBeGreaterThanOrEqual(gap - 10);
    }
  });

  it("does not retry a wrong-width vector — that is a bug, not a blip", async () => {
    withKey("test-key");
    let attempts = 0;
    globalThis.fetch = (async () => {
      attempts += 1;
      return reply(new Array(768).fill(0.1));
    }) as typeof globalThis.fetch;

    await expect(getEmbeddingProvider().embedBatch(["anything"])).rejects.toThrow(/768 dims/);
    expect(attempts).toBe(1);
  });
});
