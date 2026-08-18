// The SEO contract, exercised without a database.
//
// These are the branches a sparse record takes — a directory listing scraped from
// a registry has a name and nothing else, and it still has to produce a valid
// canonical URL, a non-empty description and a JSON-LD graph that no consumer
// chokes on. The integration suite covers the populated case.

import { describe, expect, it } from "vitest";

import { PUBLIC_PATHS, absoluteUrl, baseUrl, metaDescription, orgSeo, serviceSeo } from "../../src/modules/search/utils/seo.js";

describe("metaDescription", () => {
  it("takes the first candidate that carries text", () => {
    expect(metaDescription(null, "   ", "third")).toBe("third");
  });

  it("collapses whitespace and truncates at the length search engines show", () => {
    expect(metaDescription("a\n\n  b")).toBe("a b");
    expect(metaDescription("x".repeat(400))).toHaveLength(160);
  });

  it("returns empty rather than undefined when nothing is supplied", () => {
    expect(metaDescription(null, undefined)).toBe("");
  });
});

describe("public paths", () => {
  it("builds absolute urls against the public site, not the api host", () => {
    expect(absoluteUrl("/institutions/x")).toBe(`${baseUrl()}/institutions/x`);
    expect(baseUrl().endsWith("/")).toBe(false);
  });

  it("nests a city under its country", () => {
    expect(PUBLIC_PATHS.city("australia", "sydney")).toBe("/city/australia/sydney");
  });
});

describe("orgSeo", () => {
  const bare = { kind: "agent" as const, slug: "solo-b9", name: "Solo Agency" };

  it("falls back to a generated description when the org wrote none", () => {
    const seo = orgSeo(bare);
    expect(seo.description).toBe("Learn about Solo Agency on Globaly.");
    expect(seo.og_image).toBeNull();
  });

  it("omits logo, sameAs and address rather than emitting empty JSON-LD keys", () => {
    const data = orgSeo(bare).structured_data;
    expect(data).not.toHaveProperty("logo");
    expect(data).not.toHaveProperty("sameAs");
    expect(data).not.toHaveProperty("address");
    expect(data["@type"]).toBe("Organization");
  });

  it("uses the cover image when there is no logo", () => {
    expect(orgSeo({ ...bare, cover_url: "https://img/cover.png" }).og_image).toBe("https://img/cover.png");
  });

  it("builds a partial PostalAddress from whatever fields exist", () => {
    const data = orgSeo({ ...bare, city: "Sydney", website: "https://solo.example" }).structured_data as {
      address: Record<string, string>;
      sameAs: string[];
    };
    expect(data.address).toEqual({ "@type": "PostalAddress", addressLocality: "Sydney" });
    expect(data.sameAs).toEqual(["https://solo.example"]);
  });

  it("types an institution as an EducationalOrganization", () => {
    const seo = orgSeo({ kind: "institution", slug: "uni-i1", name: "Uni" });
    expect(seo.structured_data["@type"]).toBe("EducationalOrganization");
    expect(seo.canonical_url).toBe(absoluteUrl("/institutions/uni-i1"));
    expect(seo.title).toContain("Courses, Admissions & Profile");
  });
});

describe("serviceSeo", () => {
  const id = "11112222-3333-4444-5555-666677778888";

  it("names the provider in the title and the graph when there is one", () => {
    const seo = serviceSeo({ service_id: id, name: "Bachelor of Marine Biology", provider_name: "Reef College" });
    expect(seo.title).toBe("Bachelor of Marine Biology at Reef College | Globaly");
    expect(seo.canonical_url).toBe(absoluteUrl("/course/bachelor-of-marine-biology-111122"));
    expect(seo.structured_data.provider).toMatchObject({ name: "Reef College" });
  });

  it("stands alone when the provider is unknown", () => {
    const seo = serviceSeo({ service_id: id, name: "Short Course" });
    expect(seo.title).toBe("Short Course | Globaly");
    expect(seo.description).toContain("fees, intakes and entry requirements");
    expect(seo.structured_data).not.toHaveProperty("provider");
    expect(seo.og_image).toBeNull();
  });

  it("prefers the service's own description over the overview", () => {
    const seo = serviceSeo({ service_id: id, name: "C", description: "Real copy.", overview: "Overview." });
    expect(seo.description).toBe("Real copy.");
  });
});
