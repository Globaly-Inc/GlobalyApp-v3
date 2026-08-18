// Consent evidence (Wave E3). Every branch of the proxy/socket/absent fallback,
// which an integration test cannot reach honestly — behind a proxy is exactly the
// deployment the integration harness is not.
//
// The evidence matters because §3.7 asks for the consent log "verbatim (legal)":
// a consent record that cannot say where the consent came from is weaker evidence
// than one that can. V1 declared `ip_address inet` and never wrote it.

import { describe, expect, it } from "vitest";
import {
  MAX_IP_CHARS,
  MAX_USER_AGENT_CHARS,
  consentEvidence,
} from "../../src/modules/scribe/lib/consent-evidence.js";

describe("consentEvidence", () => {
  it("takes the first hop of x-forwarded-for, not the last", () => {
    // The client is the leftmost entry; every hop after it is infrastructure.
    expect(
      consentEvidence({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" }, "10.0.0.2"),
    ).toEqual({ ip_address: "203.0.113.7", user_agent: null });
  });

  it("handles a repeated header, which Fastify presents as an array", () => {
    expect(
      consentEvidence({ "x-forwarded-for": ["198.51.100.4", "203.0.113.9"] }, "10.0.0.1")
        .ip_address,
    ).toBe("198.51.100.4");
  });

  it("trims whitespace around a forwarded address", () => {
    expect(consentEvidence({ "x-forwarded-for": "  203.0.113.7  " }, undefined).ip_address).toBe(
      "203.0.113.7",
    );
  });

  it("falls back to the socket address with no proxy header", () => {
    expect(consentEvidence({}, "192.0.2.10").ip_address).toBe("192.0.2.10");
  });

  it("falls back to the socket address when the proxy header is empty", () => {
    expect(consentEvidence({ "x-forwarded-for": "" }, "192.0.2.10").ip_address).toBe("192.0.2.10");
    expect(consentEvidence({ "x-forwarded-for": "   " }, "192.0.2.10").ip_address).toBe(
      "192.0.2.10",
    );
  });

  it("records a missing address as null, never as an empty string", () => {
    // An empty string in a legal record reads like a value that was captured.
    expect(consentEvidence({}, undefined)).toEqual({ ip_address: null, user_agent: null });
    expect(consentEvidence({ "x-forwarded-for": "" }, "")).toEqual({
      ip_address: null,
      user_agent: null,
    });
  });

  it("captures the user agent, and an array one", () => {
    expect(consentEvidence({ "user-agent": "Mozilla/5.0" }, "1.2.3.4").user_agent).toBe(
      "Mozilla/5.0",
    );
    expect(consentEvidence({ "user-agent": ["Chrome/1", "Chrome/2"] }, "1.2.3.4").user_agent).toBe(
      "Chrome/1",
    );
  });

  it("records a missing user agent as null", () => {
    expect(consentEvidence({ "user-agent": "" }, "1.2.3.4").user_agent).toBeNull();
  });

  it("bounds both fields so a hostile header cannot grow the record", () => {
    const evidence = consentEvidence(
      { "x-forwarded-for": "9".repeat(5000), "user-agent": "U".repeat(5000) },
      undefined,
    );
    expect(evidence.ip_address).toHaveLength(MAX_IP_CHARS);
    expect(evidence.user_agent).toHaveLength(MAX_USER_AGENT_CHARS);
  });
});
