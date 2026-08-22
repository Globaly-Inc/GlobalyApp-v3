/**
 * Visa service extraction test — covers the new source_type: "visa_service" pipeline:
 * (1) looksLikeVisaServiceUrl matches a consultancy's own service/fee/registration pages
 *     without the hostname-bleed bug looksLikeCourseUrl had (see study-unit-classification.ts),
 * (2) the extraction prompt asks for the extraction_visa_services shape and warns against
 *     confusing a provider's own registration number with a visa subclass code,
 * (3) normaliseVisaServiceName gives writeVisaService's dedup the same stable key
 *     normaliseCourseName/normaliseUnitName already give courses/study units.
 * Run: node --import tsx tests/visa-service-extraction.ts
 *
 * Style matches tests/study-unit-classification.ts: plain tsx script, manual counters, no framework.
 * Section 5 hits the real dev DB (writeVisaService's jsonb-vs-text[] write path can't be
 * verified without Postgres actually validating the column types), so real .env credentials
 * must load before the "x" fallbacks below — those only cover the earlier DB-free sections
 * when run without a configured environment.
 */

import "dotenv/config";

process.env.DB_USERNAME = process.env.DB_USERNAME || "x";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "x";
process.env.DB_NAME = process.env.DB_NAME || "x";
process.env.JWT_SECRET = process.env.JWT_SECRET || "x";

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}

async function main() {
  const { looksLikeVisaServiceUrl, looksLikeCourseUrl } = await import("../src/modules/superadmin/data-extraction/lib/html-utils.js");
  const { visaServiceExtractionPrompt, visaServiceSiteAnalysisPrompt } = await import("../src/modules/superadmin/data-extraction/lib/extraction-prompts.js");
  const { normaliseVisaServiceName, writeVisaService, updateVisaServiceById } = await import("../src/modules/superadmin/data-extraction/lib/staging-writer.js");
  const { masterKnex } = await import("../src/core/db/master-pool.js");

  // 1. looksLikeVisaServiceUrl matches a consultancy's own pages, path-only (no hostname bleed).
  assert(looksLikeVisaServiceUrl("https://visaconsultancy.com/services/skilled-migration"), "matches a services page");
  assert(looksLikeVisaServiceUrl("https://visaconsultancy.com/fees"), "matches a fees page");
  assert(looksLikeVisaServiceUrl("https://visaconsultancy.com/registration"), "matches a registration page");
  assert(!looksLikeVisaServiceUrl("https://visaconsultancy.com/blog/2026-migration-news"), "does not match an unrelated blog post");
  // Same bug class as the UC job (an /admission-lookalike hostname bleeding into path signals) —
  // confirm this heuristic never inspects anything but the pathname.
  assert(
    !looksLikeVisaServiceUrl("https://services.example.com/careers"),
    "a 'services.' hostname alone does not make an unrelated page match",
  );

  // 2. Course and visa-service URL heuristics are independent — a course-shaped URL
  // shouldn't automatically also read as a visa-service URL, and vice versa.
  assert(looksLikeCourseUrl("https://university.edu/courses/bachelor-of-arts"), "course heuristic still matches its own domain");
  assert(!looksLikeVisaServiceUrl("https://university.edu/courses/bachelor-of-arts"), "visa heuristic doesn't false-positive on a course URL");

  // 3. Prompt asks for the extraction_visa_services shape and warns against the MARN-vs-subclass mixup.
  const prompt = visaServiceExtractionPrompt("https://visaconsultancy.com/services/skilled-migration", "Skilled Independent Visa (189) — from $3,500");
  assert(/registration_number/.test(prompt), "prompt requests registration_number");
  assert(/visa_types_handled/.test(prompt), "prompt requests visa_types_handled");
  assert(/registration.*subclass|subclass.*registration/is.test(prompt), "prompt warns against confusing registration number with visa subclass");

  const siteAnalysis = visaServiceSiteAnalysisPrompt("https://visaconsultancy.com", "Welcome to Visa Consultancy");
  assert(/visa_service_provider/.test(siteAnalysis), "site analysis prompt tags the institution_type as visa_service_provider");

  // 4. normaliseVisaServiceName collapses whitespace/casing so re-extractions dedup correctly.
  assert(
    normaliseVisaServiceName("Skilled Independent Visa (189) Lodgement") === normaliseVisaServiceName("  skilled  independent visa (189) lodgement  "),
    "normaliseVisaServiceName treats casing/whitespace variants as the same service",
  );
  assert(
    normaliseVisaServiceName("Skilled Independent Visa (189) Lodgement") !== normaliseVisaServiceName("Partner Visa Application"),
    "normaliseVisaServiceName does not collapse genuinely different services",
  );

  // 5. DB integration — writeVisaService against the real dev DB. Regression for a live
  // bug: services_offered is jsonb (not text[] like the other array columns), so passing
  // it through unstringified threw "invalid input syntax for type json" on every single
  // insert (seen live on job 74b0a26c-c8ff-44cf-a8d0-57d38a28d430 — Visa Guide Nepal).
  // Self-cleaning: creates its own throwaway job row (FK requirement) and deletes
  // everything it touched, since this runs against the shared dev DB, not a _test one.
  const [job] = await masterKnex("superadmin.extraction_jobs")
    .insert({ institution_url: "https://visa-service-extraction-test.invalid", source_type: "visa_service", status: "pending" })
    .returning("id");
  try {
    const id = await writeVisaService(job.id, {
      name: "Test Skilled Visa Lodgement",
      visa_types_handled: ["189", "190"],
    });
    const row = await masterKnex("superadmin.extraction_visa_services").where({ id }).first();
    assert(Array.isArray(row.visa_types_handled) && row.visa_types_handled.includes("189"), "visa_types_handled round-trips from the text[] column on insert");
    assert(Array.isArray(row.services_offered) && row.services_offered.length === 0, "services_offered starts as the column's empty-array default when the first extraction didn't find any");

    // Re-run with a case/whitespace-variant name — dedups onto the same row and, since
    // services_offered was empty, exercises the MERGE branch's jsonb serialization too.
    const id2 = await writeVisaService(job.id, {
      name: "test skilled visa lodgement",
      services_offered: ["visa_lodgement", "skills_assessment"],
    });
    assert(id2 === id, "second write with a case/whitespace-variant name dedups onto the same row");
    const merged = await masterKnex("superadmin.extraction_visa_services").where({ id }).first();
    assert(
      Array.isArray(merged.services_offered) && merged.services_offered.length === 2,
      "services_offered round-trips as a real array from the jsonb column after a merge-branch write",
    );

    // 6. Numeric coercion regression — Gemini returns decimal/integer visa-service fields
    // as human-formatted strings ("97%", "$3,500", "10 years", "1,234"), which Postgres
    // rejects outright ("invalid input syntax for type numeric"). Seen live across 5 pages
    // of atozeevisas.com, always on success_rate, but the same risk applies to every
    // numeric field — covering all of them, not just the one that happened to be hit.
    const numericId = await writeVisaService(job.id, {
      name: "Test Numeric Coercion Service",
      success_rate: "97%" as unknown as number,
      years_experience: "10 years" as unknown as number,
      fee_amount: "$3,500" as unknown as number,
      review_count: "1,234" as unknown as number,
      average_rating: 4.8,
    });
    const numericRow = await masterKnex("superadmin.extraction_visa_services").where({ id: numericId }).first();
    assert(Number(numericRow.success_rate) === 97, "success_rate coerces '97%' to 97");
    assert(Number(numericRow.years_experience) === 10, "years_experience coerces '10 years' to 10");
    assert(Number(numericRow.fee_amount) === 3500, "fee_amount coerces '$3,500' to 3500");
    assert(Number(numericRow.review_count) === 1234, "review_count coerces '1,234' to 1234");
    assert(Number(numericRow.average_rating) === 4.8, "a genuinely numeric field is unaffected by the coercion");

    // updateVisaServiceById (the per-item re-extract path) needs the same coercion.
    await updateVisaServiceById(numericId, { success_rate: "100%" as unknown as number });
    const reExtracted = await masterKnex("superadmin.extraction_visa_services").where({ id: numericId }).first();
    assert(Number(reExtracted.success_rate) === 100, "updateVisaServiceById coerces '100%' to 100 too");
  } finally {
    await masterKnex("superadmin.extraction_visa_services").where({ job_id: job.id }).delete();
    await masterKnex("superadmin.extraction_jobs").where({ id: job.id }).delete();
    await masterKnex.destroy();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
