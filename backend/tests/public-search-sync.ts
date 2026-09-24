// Check that the public search LIST agrees with the public DETAIL page, and that both agree with
// what superadmin holds. Each assertion here stands for a card that once contradicted the profile
// it links to: an institution card reading "0 courses" beside a profile listing dozens, an intake
// filter matching on a superseded intake row, an agency profile showing no offices while the
// job's Agents tab lists them.
//
// Run with: npm run test:public-search-sync
//
// Writes a throwaway extraction job, institution and business to the real DB and deletes them
// again, so it needs a database it may write to.

import "dotenv/config";
import assert from "node:assert/strict";
import { masterKnex } from "../src/core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../src/modules/superadmin/consts.js";
import * as courses from "../src/modules/search/repositories/courses.repository.js";
import * as businesses from "../src/modules/search/repositories/businesses.repository.js";
import { courseSlug } from "../src/modules/search/utils/slug.js";

const STAMP = Date.now();

async function seed() {
  const [job] = await masterKnex(`${S}.extraction_jobs`)
    .insert({ institution_url: `https://example.test/search-sync-${STAMP}`, status: "exported" })
    .returning("id");
  const jobId = job.id as string;

  const [institution] = await masterKnex("institutions")
    .insert({
      institution_name: `Test Institution ${STAMP}`,
      subdomain: `test-institution-${STAMP}`,
      source_job_id: jobId,
      is_published: true,
      institution_type: "university",
    })
    .returning("id");

  // Two courses, neither verified — 'unverified' is what every extracted course is today, and the
  // public catalog doesn't gate on it.
  const courseRows = await masterKnex(`${S}.extraction_courses`)
    .insert([
      { job_id: jobId, name: `Test Course A ${STAMP}`, subject_area: "Business", degree_level: "bachelor" },
      { job_id: jobId, name: `Test Course B ${STAMP}`, subject_area: "Nursing", degree_level: "master" },
    ])
    .returning("id");

  // What reject/bulk-reject write (courses.service.ts) — a course students must not be shown.
  const [flagged] = await masterKnex(`${S}.extraction_courses`)
    .insert({
      job_id: jobId, name: `Test Rejected Course ${STAMP}`,
      subject_area: "Rejected Studies", degree_level: "bachelor", verification_status: "flagged",
    })
    .returning("id");

  // One linked intake in 2027, plus a superseded 2030 row that only `course_id` still points at.
  const [linked] = await masterKnex(`${S}.extraction_intakes`)
    .insert({ job_id: jobId, course_id: courseRows[0].id, intake_name: "Linked", intake_month: 3, intake_year: 2027 })
    .returning("id");
  await masterKnex(`${S}.extraction_intakes`)
    .insert({ job_id: jobId, course_id: courseRows[0].id, intake_name: "Superseded", intake_month: 1, intake_year: 2030 });
  await masterKnex(`${S}.extraction_course_intake_assignments`)
    .insert({ job_id: jobId, course_id: courseRows[0].id, intake_id: linked.id });

  // A scraped agency: promoted to its own unclaimed business (no tenant schema), two offices.
  const [agent] = await masterKnex(`${S}.extraction_agents`)
    .insert({ job_id: jobId, name: `Test Agency ${STAMP}`, country: "Australia" })
    .returning("id");
  await masterKnex(`${S}.extraction_agent_locations`).insert([
    { job_id: jobId, agent_id: agent.id, is_head_office: true, city: "Sydney", address: "1 Test St" },
    { job_id: jobId, agent_id: agent.id, city: "Melbourne", street1: "2 Test Rd", street2: "Level 3" },
  ]);
  const [business] = await masterKnex("businesses")
    .insert({
      business_name: `Test Agency ${STAMP}`,
      subdomain: `test-agency-${STAMP}`,
      business_type: "agent",
      is_published: true,
      source_job_id: jobId,
      source_agent_id: agent.id,
      // Unclaimed: no tenant schema, so nothing to read from `business_branches`.
      schema_provisioned_at: null,
    })
    .returning("id");

  // A scraped visa-service provider: two services, one of them discarded by an admin.
  const [visaJob] = await masterKnex(`${S}.extraction_jobs`)
    .insert({
      institution_url: `https://example.test/visa-${STAMP}`,
      status: "exported", source_type: "visa_service",
    })
    .returning("id");
  await masterKnex(`${S}.extraction_institution_overview`)
    .insert({ job_id: visaJob.id, name: `Test Visa Provider ${STAMP}`, facebook_url: "https://facebook.test/x" });
  await masterKnex(`${S}.extraction_visa_services`).insert([
    { job_id: visaJob.id, name: "Kept service", type: `test_kept_${STAMP}`, status: "pending" },
    { job_id: visaJob.id, name: "Discarded service", type: `test_discarded_${STAMP}`, status: "discarded" },
  ]);

  return {
    jobId, visaJobId: visaJob.id as string,
    institutionId: institution.id as number,
    businessId: business.id as number,
    flaggedCourseId: flagged.id as string,
    flaggedCourseName: `Test Rejected Course ${STAMP}`,
  };
}

async function main() {
  const { jobId, visaJobId, institutionId, businessId, flaggedCourseId, flaggedCourseName } = await seed();
  try {
    const fragment = String(institutionId).padStart(6, "0");

    // ── The institution card's counts are the profile's counts ──
    const [card] = await businesses.listPublicInstitutionsByFragments([fragment]);
    assert.ok(card, "the seeded institution must be searchable (published, exported job)");
    const profileCount = await courses.countPublicCourses({ jobId });
    assert.equal(profileCount, 2, "the two unverified courses are visible; the flagged one is not");
    assert.equal(
      card.course_count, profileCount,
      "the card's course count must be the same number the profile's course tab shows",
    );
    assert.equal(card.subject_area_count, 2);

    // ── A course an admin rejected is gone from every public read ──
    const listed = await courses.listPublicCourses({ jobId }, undefined, 50, 0);
    assert.ok(
      !listed.some((row) => row.id === flaggedCourseId),
      "a 'flagged' course is a rejected course — it must not be in the search list",
    );
    assert.equal(
      await courses.findPublicCourseBySlug(courseSlug(flaggedCourseName, flaggedCourseId)), null,
      "…nor reachable by its own URL",
    );
    const facets = await courses.listCourseFacets(jobId);
    assert.ok(
      !facets.subject_areas.some((area) => area.name === "Rejected Studies"),
      "…nor countable in the institution profile's subject grid",
    );

    // The catalog filters and the filter panel run off the same visible set.
    const bySubject = await businesses.listPublicInstitutions({ subjectArea: "Rejected Studies" }, 100, 0);
    assert.ok(
      !bySubject.some((row) => row.id === fragment),
      "filtering institutions by a subject only a rejected course teaches must not match",
    );
    const catalog = await businesses.listInstitutionCatalogFacets();
    assert.ok(catalog.subject_areas.includes("Business"), "a visible course puts its subject in the panel");
    assert.ok(!catalog.subject_areas.includes("Rejected Studies"), "a rejected one does not");

    // ── Intake filter and its facet list run off the curated links ──
    const months = await businesses.listInstitutionIntakeMonths();
    assert.ok(months.includes("2027-03"), "the linked intake's month must be offered");
    assert.ok(!months.includes("2030-01"), "a superseded intake must not put a month in the picker");

    const from2027 = await businesses.countPublicInstitutions({ intakeFrom: "2027-01" });
    assert.ok(from2027 >= 1, "an institution with a linked 2027 intake matches 'from 2027-01'");
    const fragmentsFrom2028 = await businesses.listPublicInstitutions({ intakeFrom: "2028-01" }, 100, 0);
    assert.ok(
      !fragmentsFrom2028.some((row) => row.id === fragment),
      "only the superseded intake is in 2028+, so the institution must not match",
    );

    // ── An unclaimed agency profile shows the offices superadmin holds ──
    const business = await masterKnex("businesses").where({ id: businessId }).first();
    const branches = await businesses.listScrapedBranches(business.source_agent_id);
    assert.equal(branches.length, 2, "both scraped offices must reach the profile");
    assert.equal(branches[0].name, "Head Office", "the head office leads the list");
    assert.equal(branches[0].address, "1 Test St");
    assert.equal(branches[1].address, "2 Test Rd, Level 3", "street lines stand in when there's no formatted address");

    const listedBusiness = (await businesses.listPublicBusinesses({ businessType: "agent" }, 200, 0))
      .find((row) => row.id === businessId);
    assert.ok(listedBusiness, "an unclaimed agency listing must still reach the search list");

    // ── A visa service an admin discarded is gone too, and the provider keeps its socials ──
    const services = await businesses.listPublicVisaServicesForJob(visaJobId);
    assert.deepEqual(
      services.map((s: { name: string }) => s.name), ["Kept service"],
      "a discarded service must not be listed on the provider's profile",
    );
    const providerCard = (await businesses.listPublicVisaServiceProviders({}, 200, 0))
      .find((row) => row.business_name === `Test Visa Provider ${STAMP}`);
    assert.ok(providerCard, "the provider itself stays listed");
    assert.equal(providerCard.service_count, 1, "the card counts only the services still standing");
    const provider = await businesses.findPublicVisaServiceProviderBySlug(providerCard.slug);
    assert.equal(provider?.facebook_url, "https://facebook.test/x", "the profile carries the curated socials");
    const visaFacets = await businesses.listVisaServiceFacets();
    assert.ok(visaFacets.service_types.includes(`test_kept_${STAMP}`), "a live service puts its type in the panel");
    assert.ok(
      !visaFacets.service_types.includes(`test_discarded_${STAMP}`),
      "a filter option backed only by a discarded service would return nothing",
    );

    console.log(
      `ok — institution ${institutionId}: card ${card.course_count} courses = profile ${profileCount}; ` +
      `intake months ${months.filter((m) => m.startsWith("20")).length}; agency ${businessId}: 2 offices`,
    );
  } finally {
    await masterKnex("businesses").where({ id: businessId }).delete();
    await masterKnex("institutions").where({ id: institutionId }).delete();
    await masterKnex(`${S}.extraction_jobs`).whereIn("id", [jobId, visaJobId]).delete();
  }
  await masterKnex.destroy();
}

main().catch(async (err) => {
  console.error("FAILED:", (err as Error).message);
  await masterKnex.destroy();
  process.exit(1);
});
