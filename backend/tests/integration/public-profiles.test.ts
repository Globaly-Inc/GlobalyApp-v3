// Wave C2b: the public institution and agent profiles, the completed facet set,
// and the SEO/sitemap surface — the half of §3.3's C2 row that C2 left.
//
// The load-bearing assertions are the leak tests. A public profile is the widest
// unauthenticated read in the product: it joins an org row (which carries billing
// ids, the owner's user id and the tenant's schema uuid) to that org's services.
// Every one of those must be provably absent, and an unpublished or soft-deleted
// service must never surface on a profile even though the projection mirrors it.
//
// Built like public-catalog.test.ts: Fastify with no auth plugin, because these
// routes take no auth and no tenant context.

import Fastify, { type FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dbAvailable } from "../helpers/db.js";
import {
  createBusinessTenant,
  createInstitutionTenant,
  dropBusinessTenant,
  dropTenant,
  ensureBusinessCategory,
  seedReferences,
  type Reference,
  type Tenant,
} from "../helpers/catalog-fixtures.js";

const describeDb = describe.skipIf(!dbAvailable);

const TAG = `c2b${process.pid}`;

/**
 * Anything that identifies the tenant, its owner, or its billing relationship.
 * Asserted against the serialised body, so a nested or renamed leak still trips it.
 */
const FORBIDDEN_KEYS = [
  "schema_name",
  "owner_id",
  "platform_user_id",
  "subscription_id",
  "customer_id",
  "plan_code",
  "account_status",
  "agreed_to_t_and_c",
  "onboarding_completed",
  "registration_licenses",
  "business_registration_number",
  "registration_number",
  "v1_business_id",
  "deleted_at",
  "meta",
];

function collectKeys(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, into);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      into.add(key);
      collectKeys(child, into);
    }
  }
  return into;
}

function expectNoInternals(body: unknown, tenantSchemas: string[]) {
  const keys = collectKeys(body);
  for (const forbidden of FORBIDDEN_KEYS) expect([...keys]).not.toContain(forbidden);
  const serialised = JSON.stringify(body);
  for (const schema of tenantSchemas) expect(serialised).not.toContain(schema);
}

describeDb("public profiles, facets and SEO", () => {
  let app: FastifyInstance;
  let db: Knex;
  let ref: Reference;

  /** An unclaimed institution — no owner, no publication flag: the directory's reason to exist. */
  let unclaimed: Tenant;
  /** A claimed institution business (business_categories.slug = "institutions"). */
  let claimed: Tenant;
  /** An education agency — the "agent" half of the public directory. */
  let agency: Tenant;
  /** Published false: has services in the projection but must have no public profile. */
  let hidden: Tenant;
  /** Same name as `claimed`, to prove slug derivation is collision-safe. */
  let twin: Tenant;

  let institutionsCategoryId: number;
  let agencyCategoryId: number;

  const publishedName = `Reef Ecology ${TAG}`;
  const draftName = `Unlisted Draft ${TAG}`;
  const retiredName = `Retired Course ${TAG}`;

  const get = async (url: string, expected = 200) => {
    const res = await app.inject({ method: "GET", url });
    expect(res.statusCode, res.body).toBe(expected);
    return res.json();
  };

  beforeAll(async () => {
    ({ masterKnex: db } = await import("../../src/core/db/master-pool.js"));
    const { createSchemaKnex } = await import("../../src/core/db/knex.js");
    const { errorHandlerPlugin } = await import("../../src/core/plugins/error-handler.plugin.js");
    const { catalogRoutes } = await import("../../src/modules/search/routes/catalog.routes.js");
    const { profileRoutes } = await import("../../src/modules/search/routes/profiles.routes.js");

    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    await app.register(catalogRoutes, { prefix: "/api/v3/catalog" });
    await app.register(profileRoutes, { prefix: "/api/v3/catalog" });
    await app.ready();

    ref = await seedReferences(db, TAG);
    institutionsCategoryId = await ensureBusinessCategory(db, "institutions", "Institutions");
    agencyCategoryId = await ensureBusinessCategory(db, "education_agency", "Education Agency");

    unclaimed = await createInstitutionTenant(db, createSchemaKnex, {
      name: `Directory College ${TAG}`,
      website: `https://directory-${TAG}.edu`,
      countryId: ref.countryId,
      city: `Profiletown ${TAG}`,
    });
    claimed = await createBusinessTenant(db, createSchemaKnex, {
      name: `Claimed Institute ${TAG}`,
      categoryId: institutionsCategoryId,
      countryId: ref.countryId,
      city: `Profiletown ${TAG}`,
    });
    twin = await createBusinessTenant(db, createSchemaKnex, {
      name: `Claimed Institute ${TAG}`,
      categoryId: institutionsCategoryId,
      countryId: ref.countryId,
    });
    agency = await createBusinessTenant(db, createSchemaKnex, {
      name: `Helpful Agency ${TAG}`,
      categoryId: agencyCategoryId,
      countryId: ref.otherCountryId,
      city: `Agencyville ${TAG}`,
    });
    hidden = await createBusinessTenant(db, createSchemaKnex, {
      name: `Hidden Institute ${TAG}`,
      categoryId: institutionsCategoryId,
      countryId: ref.countryId,
      isPublished: false,
    });

    const base = {
      service_category_id: ref.categoryId,
      degree_level_id: ref.degreeLevelId,
      area_of_study_id: ref.areaOfStudyId,
      study_mode: ["on_campus"],
    };

    const insert = async (t: Tenant, values: Record<string, unknown>, fee?: number, month?: number) => {
      const [row] = await t.db("business_services").insert({ ...base, ...values }).returning("id");
      if (fee !== undefined) {
        await t.db("service_fees").insert({ service_id: row.id, total_amount: fee, currency: "AUD" });
      }
      if (month !== undefined) {
        await t.db("service_intakes").insert({
          service_id: row.id,
          intake_month: month,
          start_date: `2027-${String(month).padStart(2, "0")}-01`,
        });
      }
      return row.id as string;
    };

    // The unclaimed institution carries one of each state, so a single profile
    // read proves the live scope on all three at once.
    await insert(unclaimed, { name: publishedName, is_published: true }, 24000, 3);
    await insert(unclaimed, { name: draftName, is_published: false }, 1000, 3);
    await insert(unclaimed, { name: retiredName, is_published: true, deleted_at: new Date() }, 1000, 3);

    await insert(claimed, { name: `Claimed Programme ${TAG}`, is_published: true }, 9000, 9);
    await insert(agency, { name: `Visa Help ${TAG}`, is_published: true, study_mode: ["online"] }, 500, 11);
    await insert(hidden, { name: `Hidden Programme ${TAG}`, is_published: true }, 700, 5);
  }, 120_000);

  afterAll(async () => {
    await dropTenant(db, unclaimed);
    for (const t of [claimed, twin, agency, hidden]) await dropBusinessTenant(db, t);
  });

  const slugOf = async (table: string, id: number) =>
    (await db(table).where({ id }).first("slug"))?.slug as string;

  describe("slugs", () => {
    it("gives every org a slug without the application asking for one", async () => {
      expect(await slugOf("institutions", unclaimed.orgId)).toBe(
        `directory-college-${TAG}-i${unclaimed.orgId}`,
      );
      expect(await slugOf("businesses", agency.orgId)).toBe(`helpful-agency-${TAG}-b${agency.orgId}`);
    });

    it("resolves a name collision deterministically instead of failing", async () => {
      const a = await slugOf("businesses", claimed.orgId);
      const b = await slugOf("businesses", twin.orgId);
      expect(a).not.toBe(b);
      expect(a).toBe(`claimed-institute-${TAG}-b${claimed.orgId}`);
      expect(b).toBe(`claimed-institute-${TAG}-b${twin.orgId}`);
    });

    it("keeps the slug stable when the org renames itself", async () => {
      const before = await slugOf("businesses", agency.orgId);
      await db("businesses").where({ id: agency.orgId }).update({ business_name: `Renamed ${TAG}` });
      expect(await slugOf("businesses", agency.orgId)).toBe(before);
      await db("businesses").where({ id: agency.orgId }).update({ business_name: `Helpful Agency ${TAG}` });
    });

    it("keeps a slug supplied by the caller — the V1→V3 migration carries old URLs across", async () => {
      const [row] = await db("institutions")
        .insert({ institution_name: `Legacy ${TAG}`, slug: `legacy-v1-slug-${TAG}` })
        .returning(["id", "slug"]);
      expect(row.slug).toBe(`legacy-v1-slug-${TAG}`);
      await db("institutions").where({ id: row.id }).del();
    });
  });

  describe("institution profiles", () => {
    it("renders an unclaimed institution — the directory's whole purpose", async () => {
      const slug = await slugOf("institutions", unclaimed.orgId);
      const { data } = await get(`/api/v3/catalog/institutions/${slug}`);

      expect(data.name).toBe(`Directory College ${TAG}`);
      expect(data.org_type).toBe("institution");
      expect(data.kind).toBe("institution");
      expect(data.claim_status).toBe("unclaimed");
      expect(data.website).toBe(`https://directory-${TAG}.edu`);
      expect(data.country).toMatchObject({ id: ref.countryId, name: ref.countryName });
    });

    it("lists only published, live services on the profile", async () => {
      const slug = await slugOf("institutions", unclaimed.orgId);
      const { data } = await get(`/api/v3/catalog/institutions/${slug}`);

      const names = data.services.map((s: { name: string }) => s.name);
      expect(names).toContain(publishedName);
      expect(names).not.toContain(draftName);
      expect(names).not.toContain(retiredName);
      expect(data.services_total).toBe(1);
    });

    it("exposes nothing owner-only on an unclaimed profile", async () => {
      const slug = await slugOf("institutions", unclaimed.orgId);
      const body = await get(`/api/v3/catalog/institutions/${slug}`);
      expectNoInternals(body, [unclaimed.schema]);
    });

    it("serves a claimed institution business under the same path", async () => {
      const slug = await slugOf("businesses", claimed.orgId);
      const { data } = await get(`/api/v3/catalog/institutions/${slug}`);
      expect(data.org_type).toBe("business");
      expect(data.kind).toBe("institution");
      expect(data.claim_status).toBeNull();
      expect(data.category).toMatchObject({ slug: "institutions" });
    });

    it("404s an unpublished business even though its services exist", async () => {
      const slug = await slugOf("businesses", hidden.orgId);
      await get(`/api/v3/catalog/institutions/${slug}`, 404);
    });

    it("404s an unknown slug", async () => {
      await get(`/api/v3/catalog/institutions/no-such-org-b999999`, 404);
    });

    it("404s an agent slug — the path asserts the kind", async () => {
      const slug = await slugOf("businesses", agency.orgId);
      await get(`/api/v3/catalog/institutions/${slug}`, 404);
    });

    it("filters and paginates the services on a profile", async () => {
      const slug = await slugOf("institutions", unclaimed.orgId);
      const { data } = await get(
        `/api/v3/catalog/institutions/${slug}?degree_level=bachelor-${TAG}&limit=1`,
      );
      expect(data.services).toHaveLength(1);
      const empty = await get(`/api/v3/catalog/institutions/${slug}?study_mode=online`);
      expect(empty.data.services).toHaveLength(0);
      expect(empty.data.services_total).toBe(0);
    });
  });

  describe("agent profiles", () => {
    it("serves an education agency by slug", async () => {
      const slug = await slugOf("businesses", agency.orgId);
      const { data } = await get(`/api/v3/catalog/agents/${slug}`);
      expect(data.name).toBe(`Helpful Agency ${TAG}`);
      expect(data.kind).toBe("agent");
      expect(data.services.map((s: { name: string }) => s.name)).toContain(`Visa Help ${TAG}`);
    });

    it("404s an institution slug on the agent path", async () => {
      const slug = await slugOf("institutions", unclaimed.orgId);
      await get(`/api/v3/catalog/agents/${slug}`, 404);
    });

    it("exposes no internal identifiers", async () => {
      const slug = await slugOf("businesses", agency.orgId);
      const body = await get(`/api/v3/catalog/agents/${slug}`);
      expectNoInternals(body, [agency.schema]);
    });
  });

  describe("SEO", () => {
    it("gives an institution a canonical url, title, description and structured data", async () => {
      const slug = await slugOf("institutions", unclaimed.orgId);
      const { data } = await get(`/api/v3/catalog/institutions/${slug}`);

      expect(data.seo.canonical_url).toMatch(new RegExp(`^https?://.+/institutions/${slug}$`));
      expect(data.seo.title).toContain(`Directory College ${TAG}`);
      expect(data.seo.description.length).toBeLessThanOrEqual(160);
      expect(data.seo.structured_data["@type"]).toBe("EducationalOrganization");
      expect(data.seo.structured_data.url).toBe(data.seo.canonical_url);
    });

    it("marks an agent as an Organization, not an EducationalOrganization", async () => {
      const slug = await slugOf("businesses", agency.orgId);
      const { data } = await get(`/api/v3/catalog/agents/${slug}`);
      expect(data.seo.canonical_url).toContain(`/agents/${slug}`);
      expect(data.seo.structured_data["@type"]).toBe("Organization");
    });

    it("gives a service detail its own canonical url and title", async () => {
      const slug = await slugOf("institutions", unclaimed.orgId);
      const { data } = await get(`/api/v3/catalog/institutions/${slug}`);
      const detail = await get(`/api/v3/catalog/services/${data.services[0].service_id}`);
      expect(detail.data.seo.canonical_url).toContain("/course/");
      expect(detail.data.seo.title).toContain(publishedName);
    });
  });

  describe("sitemap", () => {
    it("emits one entry per public url, typed and prioritised", async () => {
      const body = await get(`/api/v3/catalog/sitemap?limit=100&type=institution`);
      const paths = body.data.map((e: { path: string }) => e.path);
      expect(paths).toContain(`/institutions/${await slugOf("institutions", unclaimed.orgId)}`);
      expect(paths).toContain(`/institutions/${await slugOf("businesses", claimed.orgId)}`);
      expect(body.data[0]).toMatchObject({ type: "institution", changefreq: expect.any(String) });
      expect(body.data[0].priority).toBeGreaterThan(0);
      expect(body.base_url).toMatch(/^https?:\/\//);
    });

    it("never lists an org or a service the public cannot open", async () => {
      const institutions = await get(`/api/v3/catalog/sitemap?limit=100&type=institution`);
      expect(institutions.data.map((e: { path: string }) => e.path)).not.toContain(
        `/institutions/${await slugOf("businesses", hidden.orgId)}`,
      );

      const services = await get(`/api/v3/catalog/sitemap?limit=100&type=service`);
      const joined = JSON.stringify(services.data);
      expect(joined).not.toContain("unlisted-draft");
      expect(joined).not.toContain("retired-course");
    });

    it("covers agents, services and geo as well as institutions", async () => {
      const agents = await get(`/api/v3/catalog/sitemap?limit=100&type=agent`);
      expect(agents.data.map((e: { path: string }) => e.path)).toContain(
        `/agents/${await slugOf("businesses", agency.orgId)}`,
      );

      const countries = await get(`/api/v3/catalog/sitemap?limit=5&type=country`);
      expect(countries.data.every((e: { path: string }) => e.path.startsWith("/country/"))).toBe(true);
      expect(countries.meta.total).toBeGreaterThan(5);
    });

    it("emits a city under its country's path, not a bare slug", async () => {
      const country = await db("countries").whereNotNull("slug").orderBy("id").first("id", "slug");
      const [city] = await db("cities")
        .insert({ country_id: country.id, name: `Sitemap City ${TAG}`, slug: `sitemap-city-${TAG}` })
        .returning("id");
      try {
        const body = await get(`/api/v3/catalog/sitemap?type=city&limit=5000`);
        expect(body.data.map((e: { path: string }) => e.path)).toContain(
          `/city/${country.slug}/sitemap-city-${TAG}`,
        );
      } finally {
        await db("cities").where({ id: city.id }).del();
      }
    });

    it("paginates rather than dumping every url at once", async () => {
      const first = await get(`/api/v3/catalog/sitemap?type=country&limit=2&page=1`);
      const second = await get(`/api/v3/catalog/sitemap?type=country&limit=2&page=2`);
      expect(first.data).toHaveLength(2);
      expect(first.data[0].path).not.toBe(second.data[0].path);
    });

    it("rejects an unknown entry type instead of returning everything", async () => {
      await get(`/api/v3/catalog/sitemap?type=secrets`, 400);
    });
  });

  describe("facet completeness", () => {
    it("reports every dimension the catalog can actually be filtered on", async () => {
      const { data } = await get("/api/v3/catalog/filters");
      // Shipped by C2.
      for (const key of ["categories", "degree_levels", "areas_of_study", "countries"]) {
        expect(Object.keys(data)).toContain(key);
      }
      // The gaps: every one of these is a live filter with no facet behind it.
      for (const key of ["cities", "currencies", "study_modes", "intake_months", "fee_range", "total"]) {
        expect(Object.keys(data)).toContain(key);
      }
    });

    it("counts cities, currencies, study modes and intake months", async () => {
      const { data } = await get("/api/v3/catalog/filters");

      const city = data.cities.find((c: { name: string }) => c.name === `Profiletown ${TAG}`);
      expect(Number(city.services)).toBe(2);

      expect(data.currencies.map((c: { code: string }) => c.code)).toContain("AUD");
      expect(data.study_modes.map((m: { value: string }) => m.value)).toEqual(
        expect.arrayContaining(["on_campus", "online"]),
      );
      expect(data.intake_months.map((m: { month: number }) => m.month)).toEqual(
        expect.arrayContaining([3, 9, 11]),
      );
      expect(Number(data.fee_range.min)).toBeLessThanOrEqual(500);
      expect(Number(data.fee_range.max)).toBeGreaterThanOrEqual(24000);
      expect(data.total).toBeGreaterThanOrEqual(3);
    });

    it("agrees with the counts the filtered list returns", async () => {
      const { data } = await get("/api/v3/catalog/filters");

      const checks: [string, string][] = [
        [`city=${encodeURIComponent(`Profiletown ${TAG}`)}`, String(
          data.cities.find((c: { name: string }) => c.name === `Profiletown ${TAG}`).services,
        )],
        ...data.study_modes
          .filter((m: { value: string }) => m.value === "online")
          .map((m: { value: string; services: number }) => [`study_mode=${m.value}`, String(m.services)] as [string, string]),
        ...data.intake_months
          .filter((m: { month: number }) => m.month === 11)
          .map((m: { month: number; services: number }) => [`intake_month=${m.month}`, String(m.services)] as [string, string]),
        ...data.categories
          .filter((c: { slug: string }) => c.slug === `courses-${TAG}`)
          .map((c: { slug: string; services: number }) => [`category=${c.slug}`, String(c.services)] as [string, string]),
      ];

      for (const [query, expected] of checks) {
        const list = await get(`/api/v3/catalog/services?${query}&limit=1`);
        expect(String(list.meta.total), query).toBe(expected);
      }
    });

    it("counts no service the public catalog would refuse to list", async () => {
      const { data } = await get("/api/v3/catalog/filters");
      const hiddenCity = data.cities.find((c: { name: string }) => c.name === `Agencyville ${TAG}`);
      // The unpublished org's services are live rows, so they still count — but the
      // draft and soft-deleted ones from the unclaimed institution never may.
      const city = data.cities.find((c: { name: string }) => c.name === `Profiletown ${TAG}`);
      expect(Number(city.services)).toBe(2);
      expect(Number(hiddenCity.services)).toBe(1);
    });
  });
});
