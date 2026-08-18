// Push delivery fails CLOSED.
//
// This deployment has no FCM credentials and no firebase SDK. §1.6's rule for that
// situation is the one billing/services/stripe.client.ts and shared/ai/gemini.ts
// already follow: answer 503, never fabricate a successful send. A "sent" that did
// not happen is worse than an error, because nothing downstream ever finds out.
//
// tests/setup/db-url.ts pins the FCM env vars empty for exactly this reason — a real
// key sitting in backend/.env would otherwise flip these assertions silently.

import { describe, expect, it, afterEach } from "vitest";

import { AppError } from "../../src/shared/errors.js";
import {
  PushUnavailableError,
  assertPushConfigured,
  getPushClient,
  isPushConfigured,
  setPushClient,
  type PushClient,
} from "../../src/modules/notifications/services/push.client.js";

afterEach(() => setPushClient(null));

describe("push client — fail closed", () => {
  it("reports itself unconfigured on a deployment with no credentials", () => {
    expect(isPushConfigured()).toBe(false);
  });

  it("assertPushConfigured throws a 503, not a 400", () => {
    // 400 would say the caller's request was wrong. It was not — the deployment is.
    let thrown: unknown;
    try {
      assertPushConfigured();
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(PushUnavailableError);
    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).statusCode).toBe(503);
    expect((thrown as AppError).code).toBe("PUSH_UNAVAILABLE");
  });

  it("getPushClient refuses rather than returning a no-op that reports success", () => {
    expect(() => getPushClient()).toThrow(PushUnavailableError);
  });
});

describe("push client — test seam", () => {
  const stub: PushClient = {
    send: async (tokens) => ({ sent: tokens.length, invalidTokens: [] }),
  };

  it("returns an injected client, and counts only what it actually sent", async () => {
    setPushClient(stub);
    expect(getPushClient()).toBe(stub);
    await expect(getPushClient().send(["a", "b"], { title: "t", body: null })).resolves.toEqual({
      sent: 2,
      invalidTokens: [],
    });
  });

  it("goes back to failing closed once the override is cleared", () => {
    setPushClient(stub);
    setPushClient(null);
    expect(() => getPushClient()).toThrow(PushUnavailableError);
  });
});
