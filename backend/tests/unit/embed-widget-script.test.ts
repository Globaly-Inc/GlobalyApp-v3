// The served embed script (G7).
//
// This file is a template string assembled on the server and executed in strangers'
// browsers. A syntax error in it cannot be caught by tsc — the string type-checks
// fine — so it would surface only as a silently dead widget on every customer's site.
// Parsing it here is the cheapest possible guard against that.
//
// The rest of the assertions pin the security properties the module comment claims,
// so a future edit that quietly reintroduces innerHTML or a postMessage channel
// fails a test instead of shipping.

import { Script } from "node:vm";
import { describe, expect, it } from "vitest";

import { buildWidgetScript } from "../../src/modules/ai-embed/lib/widget-script.js";

const API_BASE = "https://api.example.test";
const src = buildWidgetScript(API_BASE);

describe("buildWidgetScript", () => {
  it("is syntactically valid JavaScript", () => {
    // Compiles only — nothing is executed, so no DOM is needed.
    expect(() => new Script(src, { filename: "widget.js" })).not.toThrow();
  });

  it("bakes the API base in so the host page never guesses it", () => {
    expect(src).toContain(API_BASE);
    expect(src).toContain("/api/v3/ai-embed/validate");
    expect(src).toContain("/api/v3/ai-embed/messages");
  });

  it("JSON-encodes the API base, so an odd value cannot break out of the string", () => {
    const nasty = buildWidgetScript('https://x.test/";alert(1);//');
    // The parse check IS the protection: if the quote had closed the string literal,
    // `alert(1)` would be live code and this would still compile — so also assert the
    // quote came through backslash-escaped.
    expect(() => new Script(nasty, { filename: "widget.js" })).not.toThrow();
    expect(nasty).toContain('\\";alert(1);//');
  });

  it("reads the embed key only from its own script tag", () => {
    // document.currentScript is null inside every async callback, so the key cannot
    // be re-read later against a swapped tag.
    expect(src).toContain("document.currentScript");
    expect(src).toContain("data-embed-key");
  });

  it("exposes no channel for the host page to drive it", () => {
    expect(src).not.toMatch(/addEventListener\(\s*["']message["']/);
    expect(src).not.toContain("window.postMessage");
    // No global either — nothing to reach in and reconfigure.
    expect(src).not.toMatch(/window\.\w+\s*=/);
  });

  it("never assigns HTML — model output is text", () => {
    expect(src).not.toMatch(/\.innerHTML\s*=/);
    expect(src).not.toMatch(/insertAdjacentHTML/);
    expect(src).not.toMatch(/document\.write/);
    expect(src).toContain("textContent");
  });

  it("mounts in a closed shadow root", () => {
    expect(src).toContain('attachShadow({ mode: "closed" })');
  });

  it("sends no cookies with widget requests", () => {
    // A reflected-origin surface must never ride a visitor's session.
    expect(src).toContain('credentials: "omit"');
  });

  it("contains no eval and no dynamic code construction", () => {
    expect(src).not.toMatch(/\beval\(/);
    expect(src).not.toMatch(/new Function\(/);
  });

  it("validates the tenant's brand colour before putting it in CSS", () => {
    // brand_color reaches a <style> block, so it is regex-checked in the page too,
    // not only by the create/patch schema.
    expect(src).toContain("[0-9a-fA-F]");
  });

  it("renders nothing when validate refuses, rather than a broken widget", () => {
    expect(src).toContain("widget unavailable");
  });
});
