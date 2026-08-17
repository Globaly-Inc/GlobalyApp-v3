// Wave C2: the unauthenticated public catalog over published services.
//
// The load-bearing assertions are the leak tests: an unpublished service and a
// soft-deleted service must be absent from every endpoint. The projection
// deliberately mirrors both, so these fail the moment the is_published /
// deleted_at filter is dropped from the read path.
//
// The app is built here rather than via tests/helpers/app.ts because the catalog
// takes no auth and no tenant context — registering the auth plugin would only
// obscure that.

import Fastify, { type FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dbAvailable } from "../helpers/db.js";
import {
  createInstitutionTenant,
  dropTenant,
  seedReferences,
  type Reference,
  type Tenant,
} from "../helpers/catalog-fixtures.js";

const describeDb = describe.skipIf(!dbAvailable);

const TAG = `c2c${process.pid}`;

interface Seeded {
  published: string;
  unpublished: string;
  softDeleted: string;
  other: string;
  cheap: string;
}

describeDb("public catalog", () => {
  let app: FastifyInstance;
  let db: Knex;
  let ref: Reference;
  let tenant: Tenant;
  let otherTenant: Tenant;
  let ids: Seeded;

  const get = async (url: string) => {
    const res = await app.inject({ method: "GET", url });
    expect(res.statusCode, res.body).toBe(200);
    return res.json();
  };

  beforeAll(async () => {
    ({ masterKnex: db } = await import("../../src/core/db/master-pool.js"));
    const { createSchemaKnex } = await import("../../src/core/db/knex.js");
    const { errorHandlerPlugin } = await import("../../src/core/plugins/error-handler.plugin.js");
    const { catalogRoutes } = await import("../../src/modules/search/routes/catalog.routes.js");

    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    await app.register(catalogRoutes, { prefix: "/api/v3/catalog" });
    await app.ready();

    ref = await seedReferences(db, TAG);

    tenant = await createInstitutionTenant(db, createSchemaKnex, {
      name: `Public College ${TAG}`,
      website: `https://public-${TAG}.edu`,
      countryId: ref.countryId,
      city: "Sydney",
    });
    otherTenant = await createInstitutionTenant(db, createSchemaKnex, {
      name: `Other College ${TAG}`,
      countryId: ref.otherCountryId,
      city: "Auckland",
    });

    const insert = async (
      t: Tenant,
      values: Record<string, unknown>,
      children?: { fee?: number; intakeMonth?: number },
    ) => {
      const [row] = await t.db("business_services").insert(values).returning("id");
      if (children?.fee !== undefined) {
        await t.db("service_fees").insert({ service_id: row.id, total_amount: children.fee, currency: "AUD" });
      }
      if (children?.intakeMonth !== undefined) {
        await t.db("service_intakes").insert({
          service_id: row.id,
          intake_month: children.intakeMonth,
          start_date: `2027-${String(children.intakeMonth).padStart(2, "0")}-01`,
        });
      }
      return row.id as string;
    };

    const base = {
      service_category_id: ref.categoryId,
      degree_level_id: ref.degreeLevelId,
      area_of_study_id: ref.areaOfStudyId,
      study_mode: ["on_campus"],
    };

    ids = {
      published: await insert(
        tenant,
        {
          ...base,
          name: `Bachelor of Marine Biology ${TAG}`,
          description: "Coral reefs, plankton and oceanography.",
          is_published: true,
          price: 30000,
          price_currency: "AUD",
        },
        { fee: 30000, intakeMonth: 2 },
      ),
      cheap: await insert(
        tenant,
        { ...base, name: `Certificate of Rock Pooling ${TAG}`, is_published: true, is_featured: true },
        { fee: 1500, intakeMonth: 7 },
      ),
      unpublished: await insert(tenant, {
        ...base,
        name: `Secret Draft Programme ${TAG}`,
        is_published: false,
      }),
      softDeleted: await insert(tenant, {
        ...base,
        name: `Retired Programme ${TAG}`,
        is_published: true,
        deleted_at: new Date(),
      }),
      other: await insert(otherTenant, {
        name: `Diploma of Elsewhere ${TAG}`,
        is_published: true,
        service_category_id: ref.categoryId,
      }),
    };
  });

  afterAll(async () => {
    await app?.close();
    await dropTenant(db, tenant);
    await dropTenant(db, otherTenant);
    if (ref?.accreditationId) await db("accreditations").where({ id: ref.accreditationId }).del();
    if (ref?.feeTypeId) await db("fee_types").where({ id: ref.feeTypeId }).del();
  });

  /** Only this suite's services — the table is shared with whatever else ran. */
  const mine = (body: { data: { service_id: string }[] }) =>
    body.data.filter((row) => Object.values(ids).includes(row.service_id)).map((row) => row.service_id);

  it("lists published services across tenant schemas from one query", async () => {
    const body = await get(`/api/v3/catalog/services?limit=100&q=${TAG}`);
    expect(mine(body).sort()).toEqual([ids.published, ids.cheap, ids.other].sort());

    const service = body.data.find((row: { service_id: string }) => row.service_id === ids.published);
    expect(service.provider).toMatchObject({
      org_type: "institution",
      org_id: tenant.orgId,
      name: `Public College ${TAG}`,
      city: "Sydney",
      claim_status: "unclaimed",
    });
    expect(service.provider.country.id).toBe(ref.countryId);
    expect(service.category).toMatchObject({ id: ref.categoryId });
    expect(service.degree_level).toMatchObject({ id: ref.degreeLevelId });
    expect(Number(service.min_fee)).toBe(30000);
    expect(service.intake_months).toEqual([2]);
    // The tenant schema id is a capability, never part of a public payload.
    expect(service.schema_name).toBeUndefined();
  });

  it("never exposes an unpublished service", async () => {
    const list = await get(`/api/v3/catalog/services?limit=100&q=${TAG}`);
    expect(mine(list)).not.toContain(ids.unpublished);

    // Present in the projection — so the absence above is the filter working,
    // not the row being missing.
    expect(await db("catalog_services").where({ service_id: ids.unpublished }).first()).toBeTruthy();

    const detail = await app.inject({ method: "GET", url: `/api/v3/catalog/services/${ids.unpublished}` });
    expect(detail.statusCode).toBe(404);
  });

  it("never exposes a soft-deleted service", async () => {
    const list = await get(`/api/v3/catalog/services?limit=100&q=${TAG}`);
    expect(mine(list)).not.toContain(ids.softDeleted);

    expect(await db("catalog_services").where({ service_id: ids.softDeleted }).first()).toBeTruthy();

    const detail = await app.inject({ method: "GET", url: `/api/v3/catalog/services/${ids.softDeleted}` });
    expect(detail.statusCode).toBe(404);
  });

  it("returns one service with its children", async () => {
    await tenant.db("service_eligibility_requirements").insert({
      service_id: ids.published,
      name: "Academic entry",
      applicable_to: "international",
    });
    const [option] = await tenant.db("service_study_options")
      .insert({ name: "Full time", study_mode: "on_campus", study_load: "full_time" })
      .returning("id");
    await tenant.db("service_study_option_assignments").insert({
      service_id: ids.published,
      study_option_id: option.id,
    });
    const [unit] = await tenant.db("service_study_units").insert({ unit_name: "Reef Ecology" }).returning("id");
    await tenant.db("service_study_unit_assignments").insert({
      service_id: ids.published,
      study_unit_id: unit.id,
      unit_type: "elective",
    });
    await tenant.db("service_accreditation_assignments").insert({
      service_id: ids.published,
      accreditation_id: ref.accreditationId,
      registration_number: "REG-1",
    });

    const { data } = await get(`/api/v3/catalog/services/${ids.published}`);
    expect(data.name).toBe(`Bachelor of Marine Biology ${TAG}`);
    expect(data.fees).toHaveLength(1);
    expect(data.intakes).toHaveLength(1);
    expect(data.eligibility).toHaveLength(1);
    expect(data.study_options[0].study_mode).toBe("on_campus");
    expect(data.study_units[0]).toMatchObject({ unit_name: "Reef Ecology", unit_type: "elective" });
    expect(data.accreditations[0]).toMatchObject({ id: ref.accreditationId, registration_number: "REG-1" });
    expect(data.schema_name).toBeUndefined();
  });

  it("404s on an unknown service id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v3/catalog/services/00000000-0000-0000-0000-000000000000",
    });
    expect(res.statusCode).toBe(404);
  });

  it("rejects a malformed service id instead of guessing", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v3/catalog/services/not-a-uuid" });
    expect(res.statusCode).toBe(400);
  });

  it("filters by country, city, category, degree level and area of study", async () => {
    const byCountry = await get(`/api/v3/catalog/services?limit=100&q=${TAG}&country=${ref.countryIso2}`);
    expect(mine(byCountry).sort()).toEqual([ids.published, ids.cheap].sort());
    expect(mine(byCountry)).not.toContain(ids.other);

    const byCity = await get(`/api/v3/catalog/services?limit=100&q=${TAG}&city=sydney`);
    expect(mine(byCity).sort()).toEqual([ids.published, ids.cheap].sort());

    const bySlug = await get(`/api/v3/catalog/services?limit=100&q=${TAG}&degree_level=bachelor-${TAG}`);
    expect(mine(bySlug).sort()).toEqual([ids.published, ids.cheap].sort());

    const byId = await get(`/api/v3/catalog/services?limit=100&q=${TAG}&area_of_study=${ref.areaOfStudyId}`);
    expect(mine(byId).sort()).toEqual([ids.published, ids.cheap].sort());

    const byCategory = await get(`/api/v3/catalog/services?limit=100&q=${TAG}&category=courses-${TAG}`);
    expect(mine(byCategory).sort()).toEqual([ids.published, ids.cheap, ids.other].sort());

    const byMode = await get(`/api/v3/catalog/services?limit=100&q=${TAG}&study_mode=online`);
    expect(mine(byMode)).toEqual([]);
  });

  it("filters by fee range and intake", async () => {
    const cheapOnly = await get(`/api/v3/catalog/services?limit=100&q=${TAG}&fee_max=2000`);
    expect(mine(cheapOnly)).toEqual([ids.cheap]);

    const dearOnly = await get(`/api/v3/catalog/services?limit=100&q=${TAG}&fee_min=20000`);
    expect(mine(dearOnly)).toEqual([ids.published]);

    const february = await get(`/api/v3/catalog/services?limit=100&q=${TAG}&intake_month=2`);
    expect(mine(february)).toEqual([ids.published]);

    const july = await get(`/api/v3/catalog/services?limit=100&q=${TAG}&intake_month=7`);
    expect(mine(july)).toEqual([ids.cheap]);

    const impossible = await app.inject({
      method: "GET",
      url: `/api/v3/catalog/services?fee_min=500&fee_max=100`,
    });
    expect(impossible.statusCode).toBe(400);
  });

  it("searches by name and description", async () => {
    const byWord = await get(`/api/v3/catalog/services?limit=100&q=oceanography`);
    expect(byWord.data.map((r: { service_id: string }) => r.service_id)).toContain(ids.published);

    const byPartialName = await get(`/api/v3/catalog/services?limit=100&q=Rock Pooling ${TAG}`);
    expect(mine(byPartialName)).toEqual([ids.cheap]);

    const nothing = await get(`/api/v3/catalog/services?limit=100&q=zzzznotathing${TAG}`);
    expect(nothing.data).toEqual([]);
    expect(nothing.meta.total).toBe(0);
  });

  it("paginates, including past the last page", async () => {
    const first = await get(`/api/v3/catalog/services?q=${TAG}&limit=1&page=1&sort=name`);
    expect(first.data).toHaveLength(1);
    expect(first.meta).toMatchObject({ page: 1, limit: 1, total: 3, totalPages: 3 });

    const second = await get(`/api/v3/catalog/services?q=${TAG}&limit=1&page=2&sort=name`);
    expect(second.data[0].service_id).not.toBe(first.data[0].service_id);

    const past = await get(`/api/v3/catalog/services?q=${TAG}&limit=1&page=99&sort=name`);
    expect(past.data).toEqual([]);
    expect(past.meta.total).toBe(3);

    for (const bad of ["limit=0", "limit=101", "page=0", "page=-1"]) {
      const res = await app.inject({ method: "GET", url: `/api/v3/catalog/services?${bad}` });
      expect(res.statusCode, bad).toBe(400);
    }
  });

  it("sorts by price and name", async () => {
    const asc = await get(`/api/v3/catalog/services?q=${TAG}&limit=100&sort=price_asc&country=${ref.countryIso2}`);
    expect(mine(asc)).toEqual([ids.cheap, ids.published]);

    const desc = await get(`/api/v3/catalog/services?q=${TAG}&limit=100&sort=price_desc&country=${ref.countryIso2}`);
    expect(mine(desc)).toEqual([ids.published, ids.cheap]);

    const featured = await get(`/api/v3/catalog/services?q=${TAG}&limit=100&featured=true`);
    expect(mine(featured)).toEqual([ids.cheap]);
  });

  it("reports facets for live services only", async () => {
    const { data } = await get("/api/v3/catalog/filters");
    const category = data.categories.find((c: { id: number }) => c.id === ref.categoryId);
    // published + cheap + other, but neither the draft nor the soft-deleted one.
    expect(Number(category.services)).toBe(3);

    const degreeLevel = data.degree_levels.find((d: { id: number }) => d.id === ref.degreeLevelId);
    expect(Number(degreeLevel.services)).toBe(2);
  });

  it("drops a service from the public catalog the moment the tenant unpublishes it", async () => {
    await tenant.db("business_services").where({ id: ids.cheap }).update({ is_published: false });
    const hidden = await get(`/api/v3/catalog/services?limit=100&q=${TAG}`);
    expect(mine(hidden)).not.toContain(ids.cheap);

    await tenant.db("business_services").where({ id: ids.cheap }).update({ is_published: true });
    const shown = await get(`/api/v3/catalog/services?limit=100&q=${TAG}`);
    expect(mine(shown)).toContain(ids.cheap);
  });
});
