// G7 — the AI-embed widget's origin allowlist.
//
// This is the security core of the widget: the endpoints are public and
// unauthenticated, and every call costs a tenant real money. V1 had NO check of
// this kind (supabase/functions/ai-embed-validate served
// `Access-Control-Allow-Origin: *` and looked the embed key up with no notion of
// where the request came from), so these cases come from the correct behaviour
// §1.6 demands, not from V1.
//
// The invariant every case below defends: the answer is a boolean, the default
// answer is false, and nothing about a malformed or missing input can turn it true.

import { describe, expect, it } from "vitest";

import {
  assertOriginAllowed,
  isOriginAllowed,
  normalizeOrigin,
} from "../../src/modules/ai-embed/services/origin.service.js";

describe("normalizeOrigin", () => {
  it("reduces a URL to scheme://host[:port] and lowercases the host", () => {
    expect(normalizeOrigin("https://Example.COM/widget/page?a=1#x")).toBe("https://example.com");
    expect(normalizeOrigin("https://example.com:8443/")).toBe("https://example.com:8443");
    expect(normalizeOrigin("  http://localhost:3001  ")).toBe("http://localhost:3001");
  });

  it("drops the default port so https://x and https://x:443 are one origin", () => {
    expect(normalizeOrigin("https://example.com:443")).toBe("https://example.com");
    expect(normalizeOrigin("http://example.com:80")).toBe("http://example.com");
  });

  it("refuses anything that is not http(s) — the webUrl() protocol rule", () => {
    expect(normalizeOrigin("javascript:alert(1)")).toBeNull();
    expect(normalizeOrigin("data:text/html;base64,PHNjcmlwdD4=")).toBeNull();
    expect(normalizeOrigin("vbscript:msgbox(1)")).toBeNull();
    expect(normalizeOrigin("file:///etc/passwd")).toBeNull();
  });

  it("refuses non-absolute, empty and opaque values", () => {
    expect(normalizeOrigin("example.com")).toBeNull();
    expect(normalizeOrigin("")).toBeNull();
    expect(normalizeOrigin("   ")).toBeNull();
    // A sandboxed iframe and a file:// page both send the literal string "null".
    expect(normalizeOrigin("null")).toBeNull();
  });
});

describe("isOriginAllowed", () => {
  const allowed = ["https://partner.example.com", "https://school.edu.au:8443"];

  it("allows an exact origin on the list", () => {
    expect(isOriginAllowed("https://partner.example.com", allowed)).toBe(true);
    expect(isOriginAllowed("https://school.edu.au:8443", allowed)).toBe(true);
  });

  it("allows it regardless of path, query or host casing", () => {
    expect(isOriginAllowed("https://PARTNER.example.com/embed?x=1", allowed)).toBe(true);
  });

  it("refuses an origin that is not on the list", () => {
    expect(isOriginAllowed("https://evil.example.com", allowed)).toBe(false);
  });

  it("refuses a look-alike that a substring or suffix match would let through", () => {
    // The four classic allowlist bypasses. Each is a different bug.
    expect(isOriginAllowed("https://partner.example.com.evil.test", allowed)).toBe(false);
    expect(isOriginAllowed("https://evil-partner.example.com", allowed)).toBe(false);
    expect(isOriginAllowed("https://sub.partner.example.com", allowed)).toBe(false);
    expect(isOriginAllowed("https://partner.example.com@evil.test", allowed)).toBe(false);
  });

  it("refuses the same host on a different scheme or port", () => {
    expect(isOriginAllowed("http://partner.example.com", allowed)).toBe(false);
    expect(isOriginAllowed("https://partner.example.com:8443", allowed)).toBe(false);
    expect(isOriginAllowed("https://school.edu.au", allowed)).toBe(false);
  });

  it("refuses when the Origin header is absent — no header is not a pass", () => {
    expect(isOriginAllowed(undefined, allowed)).toBe(false);
    expect(isOriginAllowed("", allowed)).toBe(false);
    expect(isOriginAllowed("null", allowed)).toBe(false);
  });

  it("refuses everything when the allowlist is empty — DENY is the default", () => {
    expect(isOriginAllowed("https://partner.example.com", [])).toBe(false);
    expect(isOriginAllowed("https://anything.test", [])).toBe(false);
  });

  it("ignores an unparseable entry on the list instead of matching it loosely", () => {
    expect(isOriginAllowed("https://ok.test", ["not a url", "https://ok.test"])).toBe(true);
    expect(isOriginAllowed("not a url", ["not a url"])).toBe(false);
  });

  it("never treats a wildcard entry as a wildcard", () => {
    // Refusing to implement `*` is the point: an embed config cannot opt into
    // V1's Access-Control-Allow-Origin: * behaviour by writing it down.
    expect(isOriginAllowed("https://anything.test", ["*"])).toBe(false);
    expect(isOriginAllowed("https://a.example.com", ["https://*.example.com"])).toBe(false);
  });
});

describe("assertOriginAllowed", () => {
  it("throws a 403 for a disallowed origin", () => {
    try {
      assertOriginAllowed("https://evil.test", ["https://ok.test"]);
      throw new Error("expected assertOriginAllowed to throw");
    } catch (err) {
      expect((err as { statusCode?: number }).statusCode).toBe(403);
    }
  });

  it("throws for a missing origin", () => {
    expect(() => assertOriginAllowed(undefined, ["https://ok.test"])).toThrow();
  });

  it("returns the normalized origin when it is allowed", () => {
    expect(assertOriginAllowed("https://OK.test/page", ["https://ok.test"])).toBe("https://ok.test");
  });
});
