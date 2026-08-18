// The other half of push.client.ts's fail-closed contract.
//
// push-client.test.ts covers the deployment we actually have: no credentials, so
// assertPushConfigured() throws before anything else happens. That leaves the more
// dangerous branch untested — the one where an operator HAS set FCM credentials but
// firebase-admin is still not installed. If that path ever returned a stub instead
// of throwing, the fan-out would start writing "sent" for notifications nobody got.
//
// config is zod-parsed at module scope, so the only way to reach the branch is to
// mock the config module before push.client imports it.

import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/config.js", () => ({
  config: {
    FCM_PROJECT_ID: "globaly-test",
    FCM_SERVICE_ACCOUNT_JSON: '{"type":"service_account"}',
  },
}));

const { PushUnavailableError, assertPushConfigured, getPushClient, isPushConfigured, isPushAvailable } =
  await import("../../src/modules/notifications/services/push.client.js");

describe("push client — credentials present, SDK absent", () => {
  it("reports itself configured", () => {
    expect(isPushConfigured()).toBe(true);
    expect(isPushAvailable()).toBe(true);
  });

  it("passes the credentials check", () => {
    expect(() => assertPushConfigured()).not.toThrow();
  });

  it("still refuses to send, because there is no SDK to send with", () => {
    // The whole point: configured != able. A stub returning success here would put
    // "sent" in notification_deliveries for a notification nobody received.
    expect(() => getPushClient()).toThrow(PushUnavailableError);
    expect(() => getPushClient()).toThrow(/not installed/i);
  });
});
