// The country/city hero image resolvers. Both are DB-sourced sinks: `hero_image_url` and
// `thumbnail_image_url` come straight off rows migrated from V1, so they go through safeUrl()
// here rather than at each <img>. The interesting behaviour is that a value that FAILS the
// allowlist has to fall through to the static fallback, not render as a broken image.

import { describe, expect, it } from "vitest";

import { getCityImage, getCountryHeroImage } from "@/app/(web)/country/hero-fallback";

describe("getCountryHeroImage", () => {
  it("uses the row's own hero image when it is an http(s) URL", () => {
    expect(getCountryHeroImage({ name: "Australia", hero_image_url: "https://cdn.example.com/au.jpg" })).toBe(
      "https://cdn.example.com/au.jpg",
    );
  });

  it("falls back to the country's landmark photo when the stored value fails the allowlist", () => {
    const result = getCountryHeroImage({ name: "Australia", hero_image_url: "javascript:alert(1)" });
    expect(result).not.toContain("javascript:");
    expect(result).toBe(getCountryHeroImage({ name: "Australia", hero_image_url: null }));
  });

  it("falls back to the generic photo for a country with no landmark of its own", () => {
    const unknown = getCountryHeroImage({ name: "Wakanda", hero_image_url: null });
    const australia = getCountryHeroImage({ name: "Australia", hero_image_url: null });
    expect(unknown).toMatch(/^https:\/\//);
    expect(unknown).not.toBe(australia);
  });
});

describe("getCityImage", () => {
  it("prefers the thumbnail, then the hero", () => {
    expect(getCityImage({ id: 1, thumbnail_image_url: "https://a.test/t.jpg", hero_image_url: "https://a.test/h.jpg" })).toBe(
      "https://a.test/t.jpg",
    );
    expect(getCityImage({ id: 1, thumbnail_image_url: null, hero_image_url: "https://a.test/h.jpg" })).toBe(
      "https://a.test/h.jpg",
    );
  });

  it("skips a disallowed thumbnail rather than rendering it", () => {
    expect(getCityImage({ id: 1, thumbnail_image_url: "data:text/html;base64,x", hero_image_url: "https://a.test/h.jpg" })).toBe(
      "https://a.test/h.jpg",
    );
  });

  it("gives siblings different fallbacks so a carousel is not the same photo repeated", () => {
    const a = getCityImage({ id: 1, thumbnail_image_url: null, hero_image_url: null });
    const b = getCityImage({ id: 2, thumbnail_image_url: null, hero_image_url: null });
    expect(a).toMatch(/^https:\/\//);
    expect(a).not.toBe(b);
  });

  it("is deterministic for a given city id", () => {
    expect(getCityImage({ id: 7, thumbnail_image_url: null, hero_image_url: null })).toBe(
      getCityImage({ id: 7, thumbnail_image_url: null, hero_image_url: null }),
    );
  });
});
