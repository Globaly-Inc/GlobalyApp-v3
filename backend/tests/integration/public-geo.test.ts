// Gate 3: the unauthenticated destinations shelf and the country/city detail pages.
//
// Two defects the Gate 3 harness found against the migrated database, both proven
// here end-to-end through the route rather than through the helper:
//
//   1. `GET /api/v3/countries/:slug` and `/api/v3/cities/:slug` returned 500 on 191
//      of 198 migrated countries and 338 cities. V1's hero/thumbnail/gallery columns
//      hold absolute external URLs, and the preview resolver signed them as if they
//      were GCS objects. The corpus control was Cyprus — no images, HTTP 200 — which
//      is what localised the fault to the image path and not the geo read.
//   2. `GET /api/v3/countries/featured` returned 0 items. That half is fixed in the
//      W1 transform (see stage2-transforms.test.ts); asserted here as the read
//      contract the shelf depends on: featured only, in sort_order.
//
// The app is built here rather than via tests/helpers/app.ts because these routes
// take no auth and no tenant context — registering the auth plugin would only
// obscure that. GCS is deliberately NOT configured, which is the production-shaped
// worst case: signing cannot succeed, so a hard-failing resolver 500s every one of
// these reads.

import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { errorHandlerPlugin } from "../../src/core/plugins/error-handler.plugin.js";
import geoModule from "../../src/modules/geo/index.js";
import { masterKnex } from "../../src/core/db/master-pool.js";
import { dbAvailable } from "../helpers/db.js";

const describeDb = describe.skipIf(!dbAvailable);

// iso2/iso3 are UNIQUE and hold real ISO codes from the seeder, so the fixture's
// codes are deliberately not letter-shaped — a two-letter slice of the tag lands on
// a real country (GE = Georgia) and collides.
const TAG = `geo3${process.pid}`;

// A real V1 value, not a synthetic one: this is the shape 191 migrated countries carry.
const PEXELS = "https://images.pexels.com/photos/2325446/pexels-photo-2325446.jpeg?auto=compress&cs=tinysrgb&w=1600";
const UNSPLASH = "https://images.unsplash.com/photo-1523482580672-f109ba8cb9be?w=800";

describeDb("public geo endpoints", () => {
  let app: FastifyInstance;
  let countryId: number;

  const get = async (url: string) => {
    const res = await app.inject({ method: "GET", url });
    return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
  };

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    await app.register(geoModule);
    await app.ready();

    await masterKnex("countries").where("iso2", "like", `${TAG}%`).del();

    const [country] = await masterKnex("countries")
      .insert({
        name: `Imageland ${TAG}`,
        slug: `${TAG}-imageland`,
        iso2: `${TAG}-2a`,
        iso3: `${TAG}-3a`,
        hero_image_url: PEXELS,
        thumbnail_image_url: UNSPLASH,
        gallery_images: [PEXELS, UNSPLASH],
        is_active: true,
        is_featured: true,
        sort_order: 1,
      })
      .returning("id");
    countryId = typeof country === "object" ? country.id : country;

    // A second featured country, ordered ahead of the first, plus one that is not
    // featured — the shelf must show exactly two, in sort_order.
    await masterKnex("countries").insert([
      {
        name: `Firstland ${TAG}`, slug: `${TAG}-firstland`,
        iso2: `${TAG}-2b`, iso3: `${TAG}-3b`,
        is_active: true, is_featured: true, sort_order: 0,
      },
      {
        name: `Plainland ${TAG}`, slug: `${TAG}-plainland`,
        iso2: `${TAG}-2c`, iso3: `${TAG}-3c`,
        is_active: true, is_featured: false, sort_order: 0,
      },
    ]);

    await masterKnex("cities").insert({
      country_id: countryId,
      name: `Imageville ${TAG}`,
      slug: `${TAG}-imageville`,
      hero_image_url: PEXELS,
      thumbnail_image_url: UNSPLASH,
      status: "active",
    });
  }, 60_000);

  afterAll(async () => {
    await masterKnex("cities").where("slug", "like", `${TAG}%`).del();
    await masterKnex("countries").where("iso2", "like", `${TAG}%`).del();
    await app?.close();
    await masterKnex.destroy();
  });

  it("serves a country whose images are absolute external URLs", async () => {
    const { status, body } = await get(`/api/v3/countries/${TAG}-imageland`);

    expect(status, "an unsignable image must never 500 the page it appears on").toBe(200);
    expect(body.hero_image_url, "a pexels URL is already fetchable — nothing to sign").toBe(PEXELS);
    expect(body.thumbnail_image_url).toBe(UNSPLASH);
    expect(body.gallery_images).toEqual([PEXELS, UNSPLASH]);
  });

  it("serves the cities under it with their external images intact", async () => {
    const { status, body } = await get(`/api/v3/countries/${TAG}-imageland`);

    expect(status).toBe(200);
    const city = body.cities.find((c: { slug: string }) => c.slug === `${TAG}-imageville`);
    expect(city, "the city list is resolved through the same helper").toBeDefined();
    expect(city.hero_image_url).toBe(PEXELS);
  });

  it("serves a city detail page whose images are absolute external URLs", async () => {
    const { status, body } = await get(`/api/v3/cities/${TAG}-imageville`);

    expect(status).toBe(200);
    expect(body.hero_image_url).toBe(PEXELS);
    expect(body.thumbnail_image_url).toBe(UNSPLASH);
    expect(body.country.slug).toBe(`${TAG}-imageland`);
  });

  it("puts featured countries on the shelf in sort_order, and nothing else", async () => {
    const { status, body } = await get("/api/v3/countries/featured");

    expect(status).toBe(200);
    const mine = body.countries.filter((c: { slug: string }) => c.slug.startsWith(TAG));
    expect(mine.map((c: { slug: string }) => c.slug)).toEqual([`${TAG}-firstland`, `${TAG}-imageland`]);
  });

  // The shelf renders a photograph per country. The projection used to stop at the flag emoji, so
  // every card fell back to a grey placeholder no matter what the row held.
  it("carries the hero photograph the shelf renders", async () => {
    const { status, body } = await get("/api/v3/countries/featured");

    expect(status).toBe(200);
    const imageland = body.countries.find((c: { slug: string }) => c.slug === `${TAG}-imageland`);
    expect(imageland.hero_image_url, "an external URL is already fetchable — nothing to sign").toBe(PEXELS);

    const firstland = body.countries.find((c: { slug: string }) => c.slug === `${TAG}-firstland`);
    expect(firstland.hero_image_url, "a country with no photo still has to reach the client").toBeNull();
  });
});
