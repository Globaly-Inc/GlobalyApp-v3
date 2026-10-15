/**
 * Self-check for shared components with real behaviour — FallbackImage, whose whole job is what
 * happens when an image URL fails (institution covers are often private-bucket links that 403,
 * and the browser's default is a broken-image glyph across the card), and the OpenStreetMap
 * embed's bounding box, which is the arithmetic standing in for the zoom level Google took.
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

  // The OSM embed takes a box, not a zoom. Break the span formula and a "city" map frames a
  // continent (or one building) — which looks like a working map, so nothing else would catch it.
  const { bboxFor } = await import("./business-location-map.tsx");
  const corners = (box: string) => box.split(",").map(Number) as [number, number, number, number];
  const span = (box: string) => {
    const [w, s_, e, n] = corners(box);
    return { lon: e - w, lat: n - s_ };
  };

  const city = span(bboxFor(13.7563, 100.5018, 11)); // Bangkok, the widget's campus zoom
  assert.ok(city.lon > 0.15 && city.lon < 0.45, `zoom 11 frames a city, got ${city.lon}deg of longitude`);

  const street = span(bboxFor(13.7563, 100.5018, 14)); // the portal's default
  assert.ok(street.lon > 0.015 && street.lon < 0.06, `zoom 14 frames a street, got ${street.lon}deg`);
  assert.ok(street.lon < city.lon / 4, "a higher zoom is a tighter box");

  // cos(lat): a degree of longitude shrinks towards the poles, so the same zoom needs a shorter
  // box up north or the map comes out stretched.
  assert.ok(
    span(bboxFor(69.6496, 18.956, 11)).lat < city.lat / 2,
    "a Tromso pin narrows its latitude span against Bangkok's",
  );

  // Antarctica: the clamp must keep the box on the planet rather than emitting lat 91.
  const polar = corners(bboxFor(-89.9, 179.9, 11));
  assert.ok(polar.every((n) => Number.isFinite(n)), "no NaN at the pole");
  assert.ok(polar[1] >= -90 && polar[3] <= 90 && polar[0] >= -180 && polar[2] <= 180, "box stays on the planet");

  console.log("bboxFor: 6 cases OK");
}

void main();
