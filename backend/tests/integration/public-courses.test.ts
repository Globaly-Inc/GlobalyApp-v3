// Wave COV-2: /api/v3/search/courses — the public course search over staged
// extraction rows. It shipped with no tests at all, which is why every filter
// below is asserted by exclusion as well as inclusion: a test that only checks
// "the course I asked for came back" passes just as happily when the WHERE clause
// is dropped and everything comes back.
//
// The load-bearing assertion is the first one: `verification_status <> 'verified'`
// rows are scraped, unreviewed data and must never reach a public response.

import Fastify, { type FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dbAvailable } from "../helpers/db.js";

const describeDb = describe.skipIf(!dbAvailable);

const S = "superadmin";
const TAG = `cov2courses${process.pid}`;

interface Seeded {
  jobId: string;
  /** Verified, AU, bachelor, business, domestic fee 20000 AUD, 52wk, 2 intakes. */
  au: string;
  /** Verified, NZ, master, engineering, international fee only 45000 NZD, 104wk. */
  nz: string;
  /** Verified, GB, bachelor, business, no fee at all, no intakes. */
  gb: string;
  /** UNVERIFIED — must never appear in any public response. */
  hidden: string;
}

describeDb("public course search", () => {
  let app: FastifyInstance;
  let db: Knex;
  let ids: Seeded;

  const get = async (url: string) => {
    const res = await app.inject({ method: "GET", url });
    expect(res.statusCode, res.body).toBe(200);
    return res.json();
  };

  const namesOf = (body: { data: { name: string }[] }) => body.data.map((r) => r.name);

  beforeAll(async () => {
    ({ masterKnex: db } = await import("../../src/core/db/master-pool.js"));
    const { errorHandlerPlugin } = await import("../../src/core/plugins/error-handler.plugin.js");
    const { searchCoursesRoutes } = await import("../../src/modules/search/routes/courses.routes.js");

    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    await app.register(searchCoursesRoutes, { prefix: "/api/v3" });
    await app.ready();

    const [job] = await db(`${S}.extraction_jobs`)
      .insert({ institution_name: `${TAG} Uni`, institution_url: `https://${TAG}.test`, status: "completed" })
      .returning(["id"]);

    const insertCourse = async (row: Record<string, unknown>) => {
      const [c] = await db(`${S}.extraction_courses`)
        .insert({ job_id: job.id, ...row })
        .returning(["id"]);
      return c.id as string;
    };

    const au = await insertCourse({
      name: `${TAG} Bachelor of Business`,
      degree_level: "bachelor",
      subject_area: "Business and Management",
      duration_weeks: 52,
      country_code: "au",
      domestic_fee_total: 20_000,
      domestic_currency: "AUD",
      verification_status: "verified",
      awarding_institution: `${TAG} Alpha College`,
    });
    const nz = await insertCourse({
      name: `${TAG} Master of Engineering`,
      degree_level: "master",
      subject_area: "Engineering",
      duration_weeks: 104,
      country_code: "NZ",
      international_fee_total: 45_000,
      international_currency: "NZD",
      verification_status: "verified",
      awarding_institution: `${TAG} Beta Institute`,
    });
    const gb = await insertCourse({
      name: `${TAG} Zeta Bachelor of Business`,
      degree_level: "bachelor",
      subject_area: "Business and Management",
      country_code: "GB",
      verification_status: "verified",
      awarding_institution: `${TAG} Gamma School`,
    });
    const hidden = await insertCourse({
      name: `${TAG} Unverified Diploma`,
      degree_level: "bachelor",
      subject_area: "Business and Management",
      country_code: "AU",
      domestic_fee_total: 1,
      domestic_currency: "AUD",
      verification_status: "unverified",
      awarding_institution: `${TAG} Alpha College`,
    });

    await db(`${S}.extraction_intakes`).insert([
      { job_id: job.id, course_id: au, intake_year: 2027, intake_month: 7 },
      { job_id: job.id, course_id: au, intake_year: 2026, intake_month: 2 },
      { job_id: job.id, course_id: nz, intake_year: 2026, intake_month: 9 },
      // The unverified course gets an intake year nothing else uses, so the
      // intake-year filter has something to reject.
      { job_id: job.id, course_id: hidden, intake_year: 2099, intake_month: 1 },
    ]);

    ids = { jobId: job.id, au, nz, gb, hidden };
  });

  afterAll(async () => {
    if (ids?.jobId) await db(`${S}.extraction_jobs`).where({ id: ids.jobId }).del();
    await app?.close();
  });

  // ── the guard that matters ────────────────────────────────────────────────

  it("never returns an unverified course", async () => {
    const body = await get(`/api/v3/search/courses?search=${TAG}&limit=100`);
    expect(namesOf(body)).not.toContain(`${TAG} Unverified Diploma`);
    expect(body.data).toHaveLength(3);
    expect(body.meta.total).toBe(3);
  });

  it("404s on the detail route for an unverified course", async () => {
    const { courseSlug } = await import("../../src/modules/search/utils/slug.js");
    const res = await app.inject({
      method: "GET",
      url: `/api/v3/search/courses/${courseSlug(`${TAG} Unverified Diploma`, ids.hidden)}`,
    });
    expect(res.statusCode).toBe(404);
  });

  // ── filters ───────────────────────────────────────────────────────────────

  it("filters by country name and by country slug, case-insensitively", async () => {
    for (const value of ["Australia", "australia", "AUSTRALIA"]) {
      const body = await get(`/api/v3/search/courses?search=${TAG}&country=${value}&limit=100`);
      expect(namesOf(body)).toEqual([`${TAG} Bachelor of Business`]);
    }
    // country_code is stored lowercase on the AU row and uppercase on the NZ row;
    // the join upper()s both sides, so casing in the data must not matter either.
    const nz = await get(`/api/v3/search/courses?search=${TAG}&country=new-zealand&limit=100`);
    expect(namesOf(nz)).toEqual([`${TAG} Master of Engineering`]);
  });

  it("returns nothing for a country with no matching courses", async () => {
    const body = await get(`/api/v3/search/courses?search=${TAG}&country=Atlantis&limit=100`);
    expect(body.data).toEqual([]);
    expect(body.meta.total).toBe(0);
  });

  it("filters by degree level exactly", async () => {
    const master = await get(`/api/v3/search/courses?search=${TAG}&degree_level=master&limit=100`);
    expect(namesOf(master)).toEqual([`${TAG} Master of Engineering`]);
    // Exact match, not a prefix: "mast" must not match "master".
    const partial = await get(`/api/v3/search/courses?search=${TAG}&degree_level=mast&limit=100`);
    expect(partial.data).toEqual([]);
  });

  it("filters by subject area as a case-insensitive substring", async () => {
    const body = await get(`/api/v3/search/courses?search=${TAG}&subject_area=enginee&limit=100`);
    expect(namesOf(body)).toEqual([`${TAG} Master of Engineering`]);
  });

  it("searches course name and awarding institution, not just the name", async () => {
    const byName = await get(`/api/v3/search/courses?search=${TAG} Master of Eng&limit=100`);
    expect(namesOf(byName)).toEqual([`${TAG} Master of Engineering`]);

    const byInstitution = await get(`/api/v3/search/courses?search=Beta Institute&limit=100`);
    expect(namesOf(byInstitution)).toEqual([`${TAG} Master of Engineering`]);
  });

  it("filters on the effective fee — domestic first, international as the fallback", async () => {
    // 45000 is the NZ row's *international* fee; it has no domestic fee at all.
    // If the filter only looked at domestic_fee_total this would return nothing.
    const expensive = await get(`/api/v3/search/courses?search=${TAG}&fee_min=30000&limit=100`);
    expect(namesOf(expensive)).toEqual([`${TAG} Master of Engineering`]);

    const cheap = await get(`/api/v3/search/courses?search=${TAG}&fee_max=25000&limit=100`);
    expect(namesOf(cheap)).toEqual([`${TAG} Bachelor of Business`]);

    const band = await get(`/api/v3/search/courses?search=${TAG}&fee_min=10000&fee_max=50000&limit=100`);
    expect(namesOf(band).sort()).toEqual([`${TAG} Bachelor of Business`, `${TAG} Master of Engineering`]);

    // A priced-fee filter excludes courses with no fee recorded at all — SQL
    // comparisons against NULL are unknown, so the GB row drops out of both.
    expect(namesOf(band)).not.toContain(`${TAG} Zeta Bachelor of Business`);
  });

  it("filters by currency across both the domestic and international columns", async () => {
    const aud = await get(`/api/v3/search/courses?search=${TAG}&currency=AUD&limit=100`);
    expect(namesOf(aud)).toEqual([`${TAG} Bachelor of Business`]);
    const nzd = await get(`/api/v3/search/courses?search=${TAG}&currency=NZD&limit=100`);
    expect(namesOf(nzd)).toEqual([`${TAG} Master of Engineering`]);
    const none = await get(`/api/v3/search/courses?search=${TAG}&currency=JPY&limit=100`);
    expect(none.data).toEqual([]);
  });

  it("filters by intake year via the intakes table", async () => {
    const y2027 = await get(`/api/v3/search/courses?search=${TAG}&intake_year=2027&limit=100`);
    expect(namesOf(y2027)).toEqual([`${TAG} Bachelor of Business`]);

    const y2026 = await get(`/api/v3/search/courses?search=${TAG}&intake_year=2026&limit=100`);
    expect(namesOf(y2026).sort()).toEqual([`${TAG} Bachelor of Business`, `${TAG} Master of Engineering`]);

    // The GB row has no intakes, so an intake-year filter must exclude it.
    expect(namesOf(y2026)).not.toContain(`${TAG} Zeta Bachelor of Business`);

    // 2099 belongs only to the unverified course.
    const y2099 = await get(`/api/v3/search/courses?search=${TAG}&intake_year=2099&limit=100`);
    expect(y2099.data).toEqual([]);
  });

  it("combines filters conjunctively", async () => {
    const body = await get(
      `/api/v3/search/courses?search=${TAG}&country=Australia&degree_level=bachelor&currency=AUD&intake_year=2026&limit=100`,
    );
    expect(namesOf(body)).toEqual([`${TAG} Bachelor of Business`]);

    // Same filters, one contradiction: AU + master matches nothing.
    const contradiction = await get(
      `/api/v3/search/courses?search=${TAG}&country=Australia&degree_level=master&limit=100`,
    );
    expect(contradiction.data).toEqual([]);
  });

  // ── sorting ───────────────────────────────────────────────────────────────

  it("sorts by effective fee ascending with unpriced courses last", async () => {
    const body = await get(`/api/v3/search/courses?search=${TAG}&sort=fee_asc&limit=100`);
    expect(namesOf(body)).toEqual([
      `${TAG} Bachelor of Business`, // 20000
      `${TAG} Master of Engineering`, // 45000 (international fallback)
      `${TAG} Zeta Bachelor of Business`, // null → last
    ]);
  });

  it("sorts by effective fee descending, still with unpriced courses last", async () => {
    const body = await get(`/api/v3/search/courses?search=${TAG}&sort=fee_desc&limit=100`);
    expect(namesOf(body)).toEqual([
      `${TAG} Master of Engineering`,
      `${TAG} Bachelor of Business`,
      `${TAG} Zeta Bachelor of Business`,
    ]);
  });

  it("sorts by duration ascending with unknown durations last", async () => {
    const body = await get(`/api/v3/search/courses?search=${TAG}&sort=duration_asc&limit=100`);
    expect(namesOf(body)).toEqual([
      `${TAG} Bachelor of Business`, // 52
      `${TAG} Master of Engineering`, // 104
      `${TAG} Zeta Bachelor of Business`, // null → last
    ]);
  });

  it("defaults to name order when no sort is given, and for best_match", async () => {
    const byName = [
      `${TAG} Bachelor of Business`,
      `${TAG} Master of Engineering`,
      `${TAG} Zeta Bachelor of Business`,
    ];
    expect(namesOf(await get(`/api/v3/search/courses?search=${TAG}&limit=100`))).toEqual(byName);
    expect(namesOf(await get(`/api/v3/search/courses?search=${TAG}&sort=best_match&limit=100`))).toEqual(byName);
  });

  it("rejects a sort value it does not implement rather than silently ignoring it", async () => {
    const res = await app.inject({ method: "GET", url: `/api/v3/search/courses?sort=fee_sideways` });
    expect(res.statusCode).toBe(400);
  });

  // ── pagination ────────────────────────────────────────────────────────────

  it("paginates while reporting the unpaginated total", async () => {
    const page1 = await get(`/api/v3/search/courses?search=${TAG}&sort=fee_asc&page=1&limit=2`);
    expect(namesOf(page1)).toEqual([`${TAG} Bachelor of Business`, `${TAG} Master of Engineering`]);
    expect(page1.meta).toMatchObject({ page: 1, limit: 2, total: 3 });

    const page2 = await get(`/api/v3/search/courses?search=${TAG}&sort=fee_asc&page=2&limit=2`);
    expect(namesOf(page2)).toEqual([`${TAG} Zeta Bachelor of Business`]);
    expect(page2.meta.total).toBe(3);
  });

  // ── projection ────────────────────────────────────────────────────────────

  it("projects the joined country name and the soonest intake, not just any intake", async () => {
    const body = await get(`/api/v3/search/courses?search=${TAG}&country=Australia&limit=100`);
    const [row] = body.data;
    expect(row.country_name).toBe("Australia");
    // Two intakes exist: 2026-02 and 2027-07. The soonest is the contract.
    expect(row.next_intake_year).toBe(2026);
    expect(row.next_intake_month).toBe(2);
    expect(row.slug).toMatch(/-[0-9a-f]{6}$/);
  });

  it("leaves country_name null when the scraped country code matches no country", async () => {
    const [orphan] = await db(`${S}.extraction_courses`)
      .insert({
        job_id: ids.jobId,
        name: `${TAG} Orphan Country Course`,
        country_code: "ZZ",
        verification_status: "verified",
      })
      .returning(["id"]);
    try {
      const body = await get(`/api/v3/search/courses?search=${TAG} Orphan&limit=100`);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].country_name).toBeNull();
    } finally {
      await db(`${S}.extraction_courses`).where({ id: orphan.id }).del();
    }
  });

  // ── detail route ──────────────────────────────────────────────────────────

  it("resolves a course by its derived slug and returns its related rows", async () => {
    const list = await get(`/api/v3/search/courses?search=${TAG}&country=Australia&limit=100`);
    const { slug } = list.data[0];

    const body = await get(`/api/v3/search/courses/${slug}`);
    expect(body.id).toBe(ids.au);
    expect(body.country_name).toBe("Australia");
    // Intakes come back in chronological order, not insertion order.
    expect(body.intakes.map((i: { intake_year: number }) => i.intake_year)).toEqual([2026, 2027]);
    expect(body.eligibility).toEqual([]);
    expect(body.englishRequirements).toEqual([]);
  });

  it("matches on the id fragment, so a stale name in the slug still resolves", async () => {
    const { courseIdFragment } = await import("../../src/modules/search/utils/slug.js");
    const body = await get(`/api/v3/search/courses/completely-different-title-${courseIdFragment(ids.au)}`);
    expect(body.id).toBe(ids.au);
    // The response re-derives the canonical slug from the row it actually found.
    expect(body.slug).not.toBe(`completely-different-title-${courseIdFragment(ids.au)}`);
  });

  it("404s on a slug with no parsable id fragment", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v3/search/courses/no-fragment-here" });
    expect(res.statusCode).toBe(404);
  });

  it("404s on a well-formed fragment that matches nothing", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v3/search/courses/ghost-course-ffffff" });
    expect(res.statusCode).toBe(404);
  });

  // ── filter options ────────────────────────────────────────────────────────

  it("lists intake years ascending and de-duplicated currencies", async () => {
    const body = await get("/api/v3/search/courses/filters");
    expect(body.years).toEqual([...body.years].sort((a: number, b: number) => a - b));
    expect(new Set(body.years).size).toBe(body.years.length);
    expect(body.years).toContain(2026);
    expect(body.years).toContain(2027);
    expect(body.currencies).toContain("AUD");
    expect(body.currencies).toContain("NZD");
    expect(new Set(body.currencies).size).toBe(body.currencies.length);
    expect(body.currencies).not.toContain(null);
  });
});
