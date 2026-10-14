/**
 * Self-check for shared components with real behaviour — currently FallbackImage, whose whole
 * job is what happens when an image URL fails (institution covers are often private-bucket
 * links that 403, and the browser's default is a broken-image glyph across the card).
 *
 * Run from `frontend/`:
 *   node --import ../backend/node_modules/tsx/dist/loader.mjs src/components/self-check.tsx
 */

import assert from "node:assert/strict";
// @ts-expect-error jsdom ships no types and this file never ships — not worth a @types devDependency.
import { JSDOM } from "jsdom";

async function main() {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
    pretendToBeVisual: true,
  });
  const g = globalThis as unknown as Record<string, unknown>;
  g.window = dom.window;
  g.document = dom.window.document;
  g.navigator = dom.window.navigator;
  g.HTMLElement = dom.window.HTMLElement;
  g.IS_REACT_ACT_ENVIRONMENT = true;

  const React = (await import("react")).default;
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { FallbackImage } = await import("./fallback-image.tsx");

  const root = createRoot(dom.window.document.getElementById("root")!);
  await act(async () => {
    root.render(React.createElement(FallbackImage, { src: "https://example.test/cover.png", alt: "cover" }));
  });

  const img = dom.window.document.querySelector("img")!;
  assert.equal(img.style.display, "", "renders visible before anything fails");

  await act(async () => { img.dispatchEvent(new dom.window.Event("error")); });
  assert.equal(img.style.display, "none", "a 403/404 hides the image instead of painting the broken-image glyph");

  await act(async () => { img.dispatchEvent(new dom.window.Event("load")); });
  assert.equal(img.style.display, "", "a later src that loads brings the image back");

  console.log("FallbackImage: 3 cases OK");
}

void main();
