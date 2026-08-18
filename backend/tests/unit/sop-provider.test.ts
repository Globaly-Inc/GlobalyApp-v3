// The SOP provider seam, pinned directly.
//
// WHY THIS FILE EXISTS. Mutation-testing the generation path found that its two
// fail-closed guards partly cover each other: deleting `assertSopAiConfigured()` from
// generation.service still produced an HTTP 503, because `getSopAiProvider()` throws the
// same error a few lines later. The integration test caught the mutation — but on the
// *bookkeeping* (the session stayed `generating` instead of moving to
// `pending_provider`, and no audit row was written), not on the status code.
//
// So each half is pinned here on its own contract, and neither can be removed silently:
//
//   * `assertSopAiConfigured()` / `isSopAiConfigured()` — the cheap check callers run
//     before writing a byte of response, so the ordering rule has something to call.
//   * `getSopAiProvider()` — the last line of defence. It throws even if every caller
//     forgets to ask first, which is why the mutation above did not change the status.
//   * `generateDraft()` — turns a provider throw into a 502 and refuses whitespace, so
//     no caller can persist or charge for a fabricated draft.
//
// GEMINI_API_KEY is pinned empty by tests/setup/db-url.ts, and the unconfigured
// assertions below are the reason. Nothing here reads the environment.

import { afterEach, describe, expect, it } from "vitest";

import { AppError } from "../../src/shared/errors.js";
import {
  assertSopAiConfigured,
  generateDraft,
  getSopAiProvider,
  isSopAiConfigured,
  setSopAiProvider,
  SopAiResponseError,
  SopAiUnavailableError,
  type SopAiProvider,
} from "../../src/modules/sop/services/sop-ai.provider.js";

const stub = (impl: Partial<SopAiProvider> = {}): SopAiProvider => ({
  model: "stub-model",
  generate: async () => ({ text: "a real draft", usage: { promptTokens: 10, completionTokens: 20 } }),
  ...impl,
});

afterEach(() => setSopAiProvider(null));

describe("configuration", () => {
  it("reports unconfigured with no key and no injected provider", () => {
    expect(isSopAiConfigured()).toBe(false);
  });

  it("assertSopAiConfigured throws a 503, not a 500", () => {
    try {
      assertSopAiConfigured();
      expect.unreachable("expected a 503");
    } catch (err) {
      expect(err).toBeInstanceOf(SopAiUnavailableError);
      expect((err as AppError).statusCode).toBe(503);
      expect((err as AppError).code).toBe("SOP_AI_UNAVAILABLE");
    }
  });

  it("never puts the operator's key state in the client-facing message", () => {
    const message = new SopAiUnavailableError().message;
    expect(message).not.toMatch(/GEMINI|LOVABLE|API_KEY/i);
  });

  it("getSopAiProvider throws 503 on its own, even if no caller asserted first", () => {
    // This is the guard that made the generation-path mutation still answer 503, and
    // this assertion is what stops it being deleted unnoticed.
    expect(() => getSopAiProvider()).toThrow(SopAiUnavailableError);
  });

  it("an injected provider satisfies both the check and the lookup", () => {
    const provider = stub();
    setSopAiProvider(provider);
    expect(isSopAiConfigured()).toBe(true);
    expect(() => assertSopAiConfigured()).not.toThrow();
    expect(getSopAiProvider()).toBe(provider);
  });

  it("passing null restores the unconfigured state rather than keeping the stub", () => {
    setSopAiProvider(stub());
    setSopAiProvider(null);
    expect(isSopAiConfigured()).toBe(false);
  });
});

describe("generateDraft", () => {
  it("returns the trimmed text and the provider's usage on success", async () => {
    const result = await generateDraft(
      stub({
        generate: async () => ({
          text: "  a considered draft  ",
          usage: { promptTokens: 7, completionTokens: 9 },
        }),
      }),
      { system: "s", prompt: "p" },
    );
    expect(result.text).toBe("a considered draft");
    expect(result.usage).toEqual({ promptTokens: 7, completionTokens: 9 });
  });

  it("turns a provider throw into a 502, not the 500 V1 answered with", async () => {
    const failing = stub({
      generate: async () => {
        throw new Error("gateway timeout");
      },
    });
    await expect(generateDraft(failing, { system: "s", prompt: "p" })).rejects.toBeInstanceOf(
      SopAiResponseError,
    );
    await expect(generateDraft(failing, { system: "s", prompt: "p" })).rejects.toMatchObject({
      statusCode: 502,
    });
  });

  it("does not leak the upstream error text to the client", async () => {
    const failing = stub({
      generate: async () => {
        throw new Error("api key sk-live-abc123 rejected by generativelanguage.googleapis.com");
      },
    });
    await expect(generateDraft(failing, { system: "s", prompt: "p" })).rejects.toThrow(
      /unusable draft/i,
    );
  });

  it("preserves an AppError the provider raised deliberately", async () => {
    const unavailable = stub({
      generate: async () => {
        throw new SopAiUnavailableError();
      },
    });
    await expect(generateDraft(unavailable, { system: "s", prompt: "p" })).rejects.toMatchObject({
      statusCode: 503,
    });
  });

  it("refuses whitespace as a draft rather than persisting an empty statement", async () => {
    for (const text of ["", "   ", "\n\t\n"]) {
      const empty = stub({
        generate: async () => ({ text, usage: { promptTokens: 1, completionTokens: 0 } }),
      });
      await expect(generateDraft(empty, { system: "s", prompt: "p" })).rejects.toBeInstanceOf(
        SopAiResponseError,
      );
    }
  });
});
