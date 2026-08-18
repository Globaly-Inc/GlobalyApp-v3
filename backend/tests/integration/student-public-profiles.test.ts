// Public student profiles (D4) — the unauthenticated read of a published student profile.
//
// This is the widest anonymous read over `platform_user_profiles`, a table that carries a
// student's home address, coordinates, date of birth, phone and budget currency. The
// load-bearing assertions here are therefore the leak tests: every private column is
// asserted ABSENT from the serialised body (not merely null), by name and by value, so
// adding one back to the projection fails the suite rather than quietly shipping it.
//
// Built like public-catalog.test.ts / public-profiles.test.ts: a Fastify instance with no
// auth plugin for the public routes, plus a second, JWT-protected instance for the publish
// endpoint the student uses to opt in.

import Fastify, { type FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dbAvailable, uniqueEmail } from "../helpers/db.js";

const describeDb = describe.skipIf(!dbAvailable);

/**
 * Columns of platform_user_profiles / platform_users that must never reach an anonymous
 * reader. Asserted against the whole serialised body, so a nested or renamed leak still
 * trips the check.
 */
const FORBIDDEN_KEYS = [
  "user_id",
  "email",
  "phone",
  "uuid",
  "date_of_birth",
  "gender",
  "gpa",
  "graduation_year",
  "english_test_type",
  "english_test_score",
  "english_test_date",
  "budget_currency",
  "include_living_expenses",
  "expected_start_date",
  "city_of_residence",
  "latitude",
  "longitude",
  "personal_address_country_id",
  "personal_address_city",
  "personal_address_state",
  "personal_address_street",
  "personal_address_postcode",
  "completion_percentage",
  "onboarding_completed",
  "individual_category",
  "degree_level",
  "preferred_degree_levels",
  "nationality_id",
  "country_of_residence_id",
  "account_status",
  "meta",
  "deleted_at",
  "public_visibility",
  "created_at",
  "updated_at",
];

/** Distinctive private values seeded on the fixture — none may appear anywhere in the body. */
const FORBIDDEN_VALUES = [
  "1991-02-03", // date_of_birth
  "13 Secret Lane", // personal_address_street
  "SW1A 1AA", // personal_address_postcode
  "Hiddenville", // personal_address_city / city_of_residence
  "51.5074", // latitude
  "-0.1278", // longitude
  "ZWD", // budget_currency
  "+441234567890", // phone
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

function expectNoPrivateData(body: unknown) {
  const keys = [...collectKeys(body)];
  for (const forbidden of FORBIDDEN_KEYS) expect(keys).not.toContain(forbidden);
  const serialised = JSON.stringify(body);
  for (const value of FORBIDDEN_VALUES) expect(serialised).not.toContain(value);
}

describeDb("public student profiles", () => {
  let publicApp: FastifyInstance;
  let authedApp: FastifyInstance;
  let masterKnex: Knex;
  let shutdownPools: () => Promise<void>;

  let studentId = 0;
  let quietId = 0; // published, but with every optional section hidden
  let unpublishedId = 0;
  let studentToken = "";
  let slug = "";
  let quietSlug = "";
  let countryId = 0;

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const jwt = (await import("jsonwebtoken")).default;
    ({ masterKnex } = await import("../../src/core/db/master-pool.js"));
    ({ shutdownAll: shutdownPools } = await import("../../src/core/db/pool-manager.js"));
    const { config } = (await import("../../src/config.js")) as unknown as { config: Record<string, string> };
    const { errorHandlerPlugin } = await import("../../src/core/plugins/error-handler.plugin.js");
    const { requestContextPlugin } = await import("../../src/core/plugins/request-context.plugin.js");
    const { authPlugin } = await import("../../src/core/plugins/auth.plugin.js");
    const { publicStudentProfilesModule } = await import("../../src/modules/platform-users/index.js");
    const { platformUserRoutes } = await import(
      "../../src/modules/platform-users/routes/platform-users.routes.js"
    );

    publicApp = Fastify({ logger: false });
    await publicApp.register(errorHandlerPlugin);
    await publicApp.register(requestContextPlugin);
    await publicApp.register(publicStudentProfilesModule);
    await publicApp.ready();

    authedApp = Fastify({ logger: false });
    await authedApp.register(errorHandlerPlugin);
    await authedApp.register(requestContextPlugin);
    await authedApp.register(async (scope) => {
      await scope.register(authPlugin);
      await scope.register(platformUserRoutes, { prefix: "/api/v3/platform-users" });
    });
    await authedApp.ready();

    const country = await masterKnex("countries").first("id");
    countryId = Number(country!.id);

    const newUser = async (label: string) => {
      const [row] = await masterKnex("platform_users")
        .insert({
          first_name: "Pub",
          last_name: label,
          email: uniqueEmail(`pub.${label}`),
          phone: "+441234567890",
          photo_url: "https://cdn.test/avatar.png",
          account_status: 1,
          is_personal_account: true,
        })
        .returning(["id"]);
      return row.id as number;
    };
    studentId = await newUser("student");
    quietId = await newUser("quiet");
    unpublishedId = await newUser("unpublished");

    /** Every private column gets a distinctive value so a leak is visible, not just typed. */
    const privateColumns = {
      date_of_birth: "1991-02-03",
      gender: "female",
      gpa: 3.9,
      graduation_year: 2019,
      english_test_type: "IELTS",
      english_test_score: 7.5,
      english_test_date: "2023-05-05",
      budget_currency: "ZWD",
      include_living_expenses: true,
      expected_start_date: "2026-09",
      city_of_residence: "Hiddenville",
      latitude: 51.5074,
      longitude: -0.1278,
      personal_address_country_id: countryId,
      personal_address_city: "Hiddenville",
      personal_address_state: "Secretshire",
      personal_address_street: "13 Secret Lane",
      personal_address_postcode: "SW1A 1AA",
      completion_percentage: 80,
      onboarding_completed: true,
      individual_category: "student",
      degree_level: "Master",
      preferred_degree_levels: ["Master"],
    };

    for (const uid of [studentId, quietId, unpublishedId]) {
      await masterKnex("platform_user_profiles").insert({
        user_id: uid,
        nationality_id: countryId,
        country_of_residence_id: countryId,
        highest_degree_level: "bachelor",
        institution_attended: "Riverside College",
        budget_min: 10000,
        budget_max: 40000,
        preferred_destinations: JSON.stringify([countryId]),
        fields_of_study: JSON.stringify([{ name: "Law" }]),
        linkedin_url: "https://linkedin.com/in/pub",
        website_url: "https://pub.test",
        ...privateColumns,
      });
      await masterKnex("platform_user_qualifications").insert({
        user_id: uid,
        qualification_type: "bachelor",
        degree_title: "BSc Law",
        institution_name: "Riverside College",
      });
      await masterKnex("platform_user_work_experiences").insert({
        user_id: uid,
        job_title: "Paralegal",
        organization_name: "Riverside Chambers",
      });
      await masterKnex("platform_user_language_tests").insert([
        { user_id: uid, test_type: "IELTS", overall_score: "7.5", category: "language" },
        { user_id: uid, test_type: "GRE", overall_score: "320", category: "academic" },
      ]);
    }

    studentToken = jwt.sign(
      { sub: String(studentId), type: "platform_user", email: "pub@vitest.local" },
      config.JWT_SECRET,
    );

    // The quiet student publishes with every optional section switched off.
    await masterKnex("platform_user_profiles")
      .where({ user_id: quietId })
      .update({
        profile_slug: `quiet-u${quietId}`,
        public_visibility: JSON.stringify({
          about: false,
          education: false,
          work_experience: false,
          language_tests: false,
          academic_tests: false,
          social_links: false,
          contact_info: false,
        }),
      });
    quietSlug = `quiet-u${quietId}`;
  });

  afterAll(async () => {
    if (masterKnex) {
      await masterKnex("platform_users").whereIn("id", [studentId, quietId, unpublishedId]).del();
    }
    if (shutdownPools) await shutdownPools();
  });

  // ── publishing ──

  it("404s for a student who has not published a public profile", async () => {
    const res = await publicApp.inject({ method: "GET", url: `/api/v3/students/whoever-u${unpublishedId}` });
    expect(res.statusCode).toBe(404);
  });

  it("publishes on request and returns the derived slug", async () => {
    const res = await authedApp.inject({
      method: "PUT",
      url: "/api/v3/platform-users/me/public-profile",
      headers: auth(studentToken),
      payload: { published: true },
    });
    expect(res.statusCode).toBe(200);
    slug = res.json().profile_slug;
    // Deterministic and collision-free by construction: slugified name + "-u" + user id.
    expect(slug).toBe(`pub-student-u${studentId}`);
  });

  it("requires a token to publish", async () => {
    const res = await authedApp.inject({
      method: "PUT",
      url: "/api/v3/platform-users/me/public-profile",
      payload: { published: true },
    });
    expect(res.statusCode).toBe(401);
  });

  // ── the public read ──

  it("serves the published profile to an anonymous reader", async () => {
    const res = await publicApp.inject({ method: "GET", url: `/api/v3/students/${slug}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.profile.slug).toBe(slug);
    expect(body.profile.first_name).toBe("Pub");
    expect(body.profile.photo_url).toBe("https://cdn.test/avatar.png");
    expect(body.profile.institution_attended).toBe("Riverside College");
    expect(body.profile.highest_degree_level).toBe("bachelor");
    expect(body.profile.budget_min).toBe(10000);
    expect(body.profile.budget_max).toBe(40000);
    expect(body.profile.fields_of_study).toEqual(["Law"]);
    expect(body.profile.linkedin_url).toBe("https://linkedin.com/in/pub");
    expect(body.education).toHaveLength(1);
    expect(body.work_experience).toHaveLength(1);
    expect(body.language_tests.map((t: any) => t.test_type)).toEqual(["IELTS"]);
    expect(body.academic_tests.map((t: any) => t.test_type)).toEqual(["GRE"]);
  });

  it("omits every private profile field from the public payload", async () => {
    const res = await publicApp.inject({ method: "GET", url: `/api/v3/students/${slug}` });
    expectNoPrivateData(res.json());
  });

  it("hides country_of_residence unless contact_info is explicitly enabled", async () => {
    const res = await publicApp.inject({ method: "GET", url: `/api/v3/students/${slug}` });
    // contact_info defaults to false (V1's DEFAULT_VISIBILITY) — the key must be absent.
    expect(Object.keys(res.json().profile)).not.toContain("country_of_residence");
  });

  it("omits gated sections and their fields entirely, rather than nulling them", async () => {
    const res = await publicApp.inject({ method: "GET", url: `/api/v3/students/${quietSlug}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const profileKeys = Object.keys(body.profile);
    for (const gated of [
      "highest_degree_level",
      "fields_of_study",
      "preferred_destinations",
      "linkedin_url",
      "website_url",
      "country_of_residence",
    ]) {
      expect(profileKeys).not.toContain(gated);
    }
    expect(body.education).toEqual([]);
    expect(body.work_experience).toEqual([]);
    expect(body.language_tests).toEqual([]);
    expect(body.academic_tests).toEqual([]);
    expectNoPrivateData(body);
  });

  it("unpublishes on request, and the URL stops resolving", async () => {
    const off = await authedApp.inject({
      method: "PUT",
      url: "/api/v3/platform-users/me/public-profile",
      headers: auth(studentToken),
      payload: { published: false },
    });
    expect(off.statusCode).toBe(200);
    expect(off.json().profile_slug).toBeNull();

    const res = await publicApp.inject({ method: "GET", url: `/api/v3/students/${slug}` });
    expect(res.statusCode).toBe(404);
  });

  it("restores the same slug when the student republishes", async () => {
    const on = await authedApp.inject({
      method: "PUT",
      url: "/api/v3/platform-users/me/public-profile",
      headers: auth(studentToken),
      payload: { published: true, visibility: { contact_info: true } },
    });
    expect(on.statusCode).toBe(200);
    expect(on.json().profile_slug).toBe(slug);

    const res = await publicApp.inject({ method: "GET", url: `/api/v3/students/${slug}` });
    expect(res.statusCode).toBe(200);
    // contact_info now on — the country name (not the id) becomes visible.
    expect(typeof res.json().profile.country_of_residence).toBe("string");
    expectNoPrivateData(res.json());
  });

  it("selects no private column at all — the leak is blocked in the query, not just the assembler", async () => {
    // Second line of defence. The assembler above enumerates its output keys, so a private column
    // that reaches the repository row is not exposed *today* — but it is one careless `...row`
    // away from being exposed tomorrow. Asserting the projection itself keeps the private columns
    // out of the process, not just out of the response.
    const repo = await import("../../src/modules/platform-users/repositories/public-profiles.repository.js");
    const row = await repo.findPublishedProfileBySlug(slug);
    expect(row).toBeTruthy();
    expect(Object.keys(row!).sort()).toEqual(
      [
        "budget_max",
        "budget_min",
        "country_of_residence",
        "fields_of_study",
        "first_name",
        "highest_degree_level",
        "institution_attended",
        "last_name",
        "linkedin_url",
        "nationality",
        "photo_url",
        "preferred_destinations",
        "public_visibility",
        "slug",
        "user_id",
        "website_url",
      ].sort(),
    );
  });

  it("404s for an unknown slug", async () => {
    const res = await publicApp.inject({ method: "GET", url: "/api/v3/students/nobody-u999999" });
    expect(res.statusCode).toBe(404);
  });

  it("never serves a soft-deleted profile", async () => {
    await masterKnex("platform_user_profiles").where({ user_id: studentId }).update({ deleted_at: masterKnex.fn.now() });
    const res = await publicApp.inject({ method: "GET", url: `/api/v3/students/${slug}` });
    expect(res.statusCode).toBe(404);
    await masterKnex("platform_user_profiles").where({ user_id: studentId }).update({ deleted_at: null });
  });
});
