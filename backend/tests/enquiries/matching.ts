/**
 * Matching engine tests — exercises matching.service against the real dev DB.
 * Run: node --import tsx tests/enquiries/matching.ts
 *
 * Covers:
 *  1. Verified same-country same-subject rep gets matched at Tier 1, distribution row created.
 *  2. Zero eligible businesses + no extraction_job_id → no_match.
 *  3. Zero tier 1-4 matches, valid extraction_job_id → institution-direct fallback (is_institution_contact=true).
 *  4. Never creates more than MAX_DISTRIBUTIONS rows even with more eligible businesses.
 *  5. Idempotency: running matching twice does not duplicate distribution rows
 *     (relies on the status guard in runMatching — a matched enquiry is no
 *     longer 'pending' — with the DB's UNIQUE(enquiry_id, business_id) +
 *     ON CONFLICT DO NOTHING as the backstop if that guard is bypassed).
 */

import { masterKnex } from "../../src/core/db/master-pool.js";
import { runMatching, rankCandidates, MAX_DISTRIBUTIONS } from "../../src/modules/enquiries/services/matching.service.js";

let passed = 0;
let failed = 0;

async function assert(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
  }
}

function eq(actual: unknown, expected: unknown, label = "") {
  if (actual !== expected) {
    throw new Error(`${label ? label + ": " : ""}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function makeStudent(opts: { countryId: number | null; lat?: number; lon?: number }): Promise<number> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [user] = await masterKnex("platform_users")
    .insert({
      first_name: "Match",
      last_name: "Student",
      email: `match-test-${suffix}@example.com`,
      account_status: 1,
      is_personal_account: true,
    })
    .returning("id");
  await masterKnex("platform_user_profiles").insert({
    user_id: user.id,
    onboarding_completed: true,
    individual_category: "student",
    country_of_residence_id: opts.countryId,
    latitude: opts.lat ?? null,
    longitude: opts.lon ?? null,
  });
  return user.id;
}

async function makeJobAndCourse(subjectArea: string): Promise<{ jobId: string; courseId: string }> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [job] = await masterKnex("superadmin.extraction_jobs")
    .insert({
      institution_name: `Match Test Institution ${suffix}`,
      institution_url: `https://match-test-${suffix}.example.com`,
    })
    .returning("id");
  const [course] = await masterKnex("superadmin.extraction_courses")
    .insert({ job_id: job.id, name: `Match Test Course ${suffix}`, subject_area: subjectArea })
    .returning("id");
  return { jobId: job.id, courseId: course.id };
}

async function makeBusiness(): Promise<number> {
  const owner = await masterKnex("platform_users").orderBy("id").first();
  if (!owner) throw new Error("no platform_users row available to own the test business");
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [row] = await masterKnex("businesses")
    .insert({
      owner_id: owner.id,
      subdomain: `match-test-${suffix}`,
      business_name: `Match Test Biz ${suffix}`,
    })
    .returning("id");
  return row.id;
}

/**
 * An ACTIVE representation is the ONLY thing that makes a business eligible.
 * Without one, a directory row alone matches nothing — there is no general pool.
 */
async function makeRepresentation(
  businessId: number,
  opts: { jobId?: string | null; courseId?: string | null },
): Promise<string> {
  const [row] = await masterKnex("representations")
    .insert({
      business_id: businessId,
      extraction_job_id: opts.jobId ?? null,
      extraction_course_id: opts.courseId ?? null,
      status: "active",
    })
    .returning("id");
  return row.id;
}

async function makeDirectoryRow(businessId: number, opts: Partial<{
  subject_area: string | null;
  country_code: string | null;
  verification_status: "verified" | "unverified";
  latitude: number | null;
  longitude: number | null;
  is_institution_contact: boolean;
  is_suspended: boolean;
}>) {
  await masterKnex("enquiry_match_directory").insert({
    business_id: businessId,
    subject_area: opts.subject_area ?? null,
    country_code: opts.country_code ?? null,
    verification_status: opts.verification_status ?? "unverified",
    latitude: opts.latitude ?? null,
    longitude: opts.longitude ?? null,
    is_institution_contact: opts.is_institution_contact ?? false,
    is_suspended: opts.is_suspended ?? false,
  });
}

async function makeEnquiry(
  studentId: number,
  courseId: string,
  extractionJobId: string | null,
  geo?: { lat?: number; lon?: number },
) {
  const [row] = await masterKnex("enquiries")
    .insert({
      student_id: studentId,
      course_id: courseId,
      extraction_job_id: extractionJobId,
      message: "This is a test enquiry message for matching tests.",
      student_latitude: geo?.lat ?? null,
      student_longitude: geo?.lon ?? null,
      status: "pending",
    })
    .returning("*");
  return row;
}

async function getCountryId(iso2: string): Promise<number> {
  const row = await masterKnex("countries").where({ iso2 }).first("id");
  if (row) return row.id;
  const [inserted] = await masterKnex("countries")
    .insert({ name: `Test-${iso2}-${Date.now()}`, iso2, iso3: `${iso2}X`, is_active: true })
    .returning("id");
  return inserted.id;
}

async function cleanup(opts: { studentIds?: number[]; jobIds?: string[]; businessIds?: number[]; enquiryIds?: string[] }) {
  if (opts.enquiryIds?.length) {
    await masterKnex("enquiry_distributions").whereIn("enquiry_id", opts.enquiryIds).delete();
    await masterKnex("audit_logs").whereIn("entity_id", opts.enquiryIds).delete();
    await masterKnex("enquiries").whereIn("id", opts.enquiryIds).delete();
  }
  if (opts.businessIds?.length) {
    await masterKnex("enquiry_match_directory").whereIn("business_id", opts.businessIds).delete();
    await masterKnex("representations").whereIn("business_id", opts.businessIds).delete();
    await masterKnex("businesses").whereIn("id", opts.businessIds).delete();
  }
  if (opts.jobIds?.length) {
    for (const jobId of opts.jobIds) {
      await masterKnex("superadmin.extraction_courses").where({ job_id: jobId }).delete();
      await masterKnex("superadmin.extraction_jobs").where({ id: jobId }).delete();
    }
  }
  if (opts.studentIds?.length) {
    await masterKnex("platform_user_profiles").whereIn("user_id", opts.studentIds).delete();
    await masterKnex("platform_users").whereIn("id", opts.studentIds).delete();
  }
}

function candidate(id: number, opts: Partial<{
  subject_area: string | null;
  country_code: string | null;
  verification_status: "verified" | "unverified";
  latitude: number | null;
  longitude: number | null;
  is_institution_contact: boolean;
}> = {}) {
  return {
    business_id: id,
    subject_area: opts.subject_area ?? null,
    country_code: opts.country_code ?? null,
    verification_status: opts.verification_status ?? "unverified",
    latitude: opts.latitude ?? null,
    longitude: opts.longitude ?? null,
    is_institution_contact: opts.is_institution_contact ?? false,
  };
}

/** Pure unit tests for rankCandidates — no DB access, per PRD §30/§32. */
async function runPureRankingTests() {
  console.log("rankCandidates: pure unit tests (no DB)\n");

  // Coordinates below sit on the equator/prime meridian so distances are exact
  // and readable: 1 degree of latitude is 111.19km, so 0.09 deg = 10.01km.
  const atKm = (km: number) => ({ latitude: km / 111.19, longitude: 0 });
  const fromOrigin = (repCandidates: ReturnType<typeof candidate>[]) =>
    rankCandidates({
      repCandidates,
      studentCountryCode: "AU",
      studentLat: 0,
      studentLon: 0,
      maxDistributions: 6,
    });

  await assert("distance bands split verified same-country: <20km T1, 20-40km T2, >=40km T3", () => {
    const ranked = fromOrigin([
      candidate(1, { verification_status: "verified", country_code: "AU", ...atKm(10) }),
      candidate(2, { verification_status: "verified", country_code: "AU", ...atKm(30) }),
      candidate(3, { verification_status: "verified", country_code: "AU", ...atKm(50) }),
      candidate(4, { verification_status: "verified", country_code: "AU", latitude: null, longitude: null }),
    ]);
    const tierOf = (id: number) => ranked.find((r) => r.business_id === id)!.tier;
    eq(ranked.length, 4, "all ranked");
    eq(tierOf(1), 1, "10km is T1");
    eq(tierOf(2), 2, "30km is T2");
    eq(tierOf(3), 3, "50km is T3");
    eq(tierOf(4), 3, "unknown distance is T3");
    eq(ranked.map((r) => r.business_id).join(","), "1,2,3,4", "emitted in tier order, unknown last");
    return Promise.resolve();
  });

  await assert("band boundaries are exclusive-upper: 20km is T2, 40km is T3", () => {
    const ranked = fromOrigin([
      candidate(1, { verification_status: "verified", country_code: "AU", ...atKm(19.9) }),
      candidate(2, { verification_status: "verified", country_code: "AU", ...atKm(20.1) }),
      candidate(3, { verification_status: "verified", country_code: "AU", ...atKm(39.9) }),
      candidate(4, { verification_status: "verified", country_code: "AU", ...atKm(40.1) }),
    ]);
    const tierOf = (id: number) => ranked.find((r) => r.business_id === id)!.tier;
    eq(tierOf(1), 1, "19.9km is T1");
    eq(tierOf(2), 2, "20.1km is T2");
    eq(tierOf(3), 2, "39.9km is T2");
    eq(tierOf(4), 3, "40.1km is T3");
    return Promise.resolve();
  });

  await assert("country is a hard gate: a rep in another country is never a recipient", () => {
    const ranked = fromOrigin([
      candidate(1, { verification_status: "verified", country_code: "GB", ...atKm(5) }), // near but abroad
      candidate(2, { verification_status: "unverified", country_code: "GB", ...atKm(2) }), // nearer, abroad
      candidate(3, { verification_status: "verified", country_code: "AU", ...atKm(500) }), // far but home
    ]);
    eq(ranked.length, 1, "both foreign reps are dropped, not demoted");
    eq(ranked[0].business_id, 3, "only the same-country rep survives");
    eq(ranked[0].tier, 3, "500km same-country is T3, the farthest home band");
    return Promise.resolve();
  });

  await assert("a directory row with no country_code is never a recipient", () => {
    const ranked = fromOrigin([
      candidate(1, { verification_status: "verified", country_code: null, ...atKm(1) }),
      candidate(2, { verification_status: "verified", country_code: "AU", ...atKm(30) }),
    ]);
    eq(ranked.length, 1, "the null-country rep is dropped despite being 1km away");
    eq(ranked[0].business_id, 2, "only the AU rep survives");
    return Promise.resolve();
  });

  await assert("verified reps outrank unverified ones (T4), however close the unverified rep is", () => {
    const ranked = fromOrigin([
      candidate(1, { verification_status: "unverified", country_code: "AU", ...atKm(1) }),
      candidate(2, { verification_status: "verified", country_code: "AU", ...atKm(500) }),
    ]);
    eq(ranked.map((r) => r.business_id).join(","), "2,1", "T3 before T4");
    eq(ranked[1].tier, 4, "the 1km unverified rep is T4, ranked last");
    return Promise.resolve();
  });

  await assert("T4 has no distance bands: unverified reps stay T4 at every distance", () => {
    const ranked = fromOrigin([
      candidate(1, { verification_status: "unverified", country_code: "AU", ...atKm(5) }),
      candidate(2, { verification_status: "unverified", country_code: "AU", ...atKm(30) }),
      candidate(3, { verification_status: "unverified", country_code: "AU", ...atKm(500) }),
    ]);
    eq(ranked.every((r) => r.tier === 4), true, "5km, 30km and 500km are all T4");
    eq(ranked.map((r) => r.business_id).join(","), "1,2,3", "distance still orders within T4");
    return Promise.resolve();
  });

  await assert("nearest-first ordering inside a single band", () => {
    const ranked = fromOrigin([
      candidate(1, { verification_status: "verified", country_code: "AU", ...atKm(15) }),
      candidate(2, { verification_status: "verified", country_code: "AU", ...atKm(5) }),
      candidate(3, { verification_status: "verified", country_code: "AU", ...atKm(10) }),
    ]);
    eq(ranked.every((r) => r.tier === 1), true, "all under 20km, so all T1");
    eq(ranked.map((r) => r.business_id).join(","), "2,3,1", "5km, 10km, 15km");
    return Promise.resolve();
  });

  await assert("a student with no resolvable country matches NOBODY, nothing throws", () => {
    // Country is a hard gate, so an unresolvable student country empties the
    // whole candidate set — only the institution-direct fallback in runMatching
    // can still produce a recipient. Guarding this because it is a silent
    // no_match, not an error.
    const ranked = rankCandidates({
      repCandidates: [
        candidate(1, { verification_status: "verified", country_code: "AU", ...atKm(1) }),
        candidate(2, { verification_status: "unverified", country_code: "GB", ...atKm(2) }),
      ],
      studentCountryCode: null,
      studentLat: 0,
      studentLon: 0,
      maxDistributions: 6,
    });
    eq(ranked.length, 0, "no country to match against, so no recipients");
    return Promise.resolve();
  });

  await assert("all verified same-country but no coordinates anywhere: everything collapses to T3", () => {
    const ranked = rankCandidates({
      repCandidates: [
        candidate(1, { verification_status: "verified", country_code: "AU" }),
        candidate(2, { verification_status: "verified", country_code: "AU" }),
      ],
      studentCountryCode: "AU",
      studentLat: null,
      studentLon: null,
      maxDistributions: 6,
    });
    eq(ranked.every((r) => r.tier === 3), true, "no distance computable, so the bottom home band");
    eq(ranked.length, 2, "still matched, still ahead of any T4/T5");
    return Promise.resolve();
  });

  await assert("an unexpected verification_status is ranked as unverified, not dropped", () => {
    // The column has no CHECK constraint, so 'pending' is storable. It must not
    // silently vanish from the ranking.
    const ranked = fromOrigin([
      candidate(1, { verification_status: "pending" as "verified", country_code: "AU", ...atKm(5) }),
      candidate(2, { verification_status: "verified", country_code: "AU", ...atKm(15) }),
    ]);
    eq(ranked.length, 2, "the 'pending' candidate is still ranked");
    eq(ranked[0].business_id, 2, "'verified' outranks 'pending'");
    eq(ranked[1].tier, 4, "'pending' is treated as unverified → T4");
    return Promise.resolve();
  });

  await assert("no general fallback: a business without a representation is never ranked", () => {
    // repCandidates is the whole eligible universe — the caller only puts
    // representation-backed businesses in it, and there is no second pool.
    const ranked = rankCandidates({
      repCandidates: [],
      studentCountryCode: "AU",
      studentLat: null,
      studentLon: null,
      maxDistributions: 6,
    });
    eq(ranked.length, 0, "nothing to rank without a representation");
    return Promise.resolve();
  });

  await assert("never returns more than maxDistributions candidates even when more are eligible", () => {
    const repCandidates = Array.from({ length: 10 }, (_, i) =>
      candidate(i + 1, { verification_status: "verified", country_code: "AU" }),
    );
    const ranked = rankCandidates({
      repCandidates,
      studentCountryCode: "AU",
      studentLat: null,
      studentLon: null,
      maxDistributions: 6,
    });
    eq(ranked.length, 6, "capped at maxDistributions");
    return Promise.resolve();
  });
}

async function main() {
  await runPureRankingTests();

  console.log("\nMatching engine tests (DB integration)\n");

  // ── 1. Verified same-country same-subject → Tier 1 ──
  await assert("verified same-country same-subject rep is matched at Tier 1", async () => {
    const countryId = await getCountryId("AU");
    const studentId = await makeStudent({ countryId, lat: -33.8688, lon: 151.2093 }); // Sydney
    // Unique subject area to keep real dev-DB rows out of this enquiry's result
    // set. Belt-and-braces now that eligibility is representation-only, but it
    // costs nothing and keeps the test isolated from seed data.
    const subject = `Tier1 Subject ${Date.now()}`;
    const { jobId, courseId } = await makeJobAndCourse(subject);
    const businessId = await makeBusiness();
    await makeRepresentation(businessId, { jobId, courseId });
    await makeDirectoryRow(businessId, {
      subject_area: subject,
      country_code: "AU",
      verification_status: "verified",
      latitude: -33.87,
      longitude: 151.21, // ~a few km away
    });
    const enquiry = await makeEnquiry(studentId, courseId, jobId, { lat: -33.8688, lon: 151.2093 });
    try {
      await runMatching(enquiry.id);

      const updated = await masterKnex("enquiries").where({ id: enquiry.id }).first();
      eq(updated.status, "distributed", "enquiry status");

      const dists = await masterKnex("enquiry_distributions").where({ enquiry_id: enquiry.id });
      eq(dists.length, 1, "distribution row count");
      eq(dists[0].business_id, businessId, "distribution business_id");
      eq(dists[0].tier, 1, "distribution tier");
      eq(dists[0].status, "distributed", "distribution status");
    } finally {
      await cleanup({ studentIds: [studentId], jobIds: [jobId], businessIds: [businessId], enquiryIds: [enquiry.id] });
    }
  });

  // ── 1b. Regression: a business must represent the institution/course ──
  // Reproduces the reported bug: business represented Test University / BSc
  // Computer Science but received a Cornell "Food Executive Program" (subject
  // "Business") enquiry via the old unfiltered Tier 7 general pool.
  await assert("a business that represents neither the institution nor the course is NOT matched", async () => {
    const studentId = await makeStudent({ countryId: null });
    // Unique subjects: real dev-DB businesses can legitimately qualify for the
    // general tier on a common subject like "Business" and inflate the counts.
    const uniq = `Gate Subject ${Date.now()}`;
    const represented = await makeJobAndCourse(`${uniq} A`); // what the business reps
    const enquired = await makeJobAndCourse(`${uniq} B`); // an unrelated institution+course
    const businessId = await makeBusiness();
    await makeRepresentation(businessId, { jobId: represented.jobId, courseId: represented.courseId });
    await makeDirectoryRow(businessId, {
      subject_area: `${uniq} A`,
      verification_status: "verified",
    });
    const enquiry = await makeEnquiry(studentId, enquired.courseId, enquired.jobId);
    try {
      await runMatching(enquiry.id);

      const dists = await masterKnex("enquiry_distributions").where({ enquiry_id: enquiry.id });
      eq(dists.length, 0, "unrelated business must not receive the enquiry");

      const updated = await masterKnex("enquiries").where({ id: enquiry.id }).first();
      eq(updated.status, "no_match", "enquiry status");
    } finally {
      await cleanup({
        studentIds: [studentId],
        jobIds: [represented.jobId, enquired.jobId],
        businessIds: [businessId],
        enquiryIds: [enquiry.id],
      });
    }
  });

  // ── 1b-ii. Regression: an institution-contact rep is still matched as an agent ──
  // Under the sole-representer rule a business earns is_institution_contact by
  // being an institution's only representer. It must still rank in the rep tiers
  // — excluding it handed the enquiry to an unrelated subject-matched general
  // agent while the actual representer got nothing.
  await assert("a rep flagged is_institution_contact is still matched, not skipped for a general agent", async () => {
    const studentId = await makeStudent({ countryId: null });
    const subject = `Contact Rep Subject ${Date.now()}`;
    const { jobId, courseId } = await makeJobAndCourse(subject);
    const repBusiness = await makeBusiness();
    const generalBusiness = await makeBusiness();
    await makeRepresentation(repBusiness, { jobId, courseId });
    await makeDirectoryRow(repBusiness, {
      subject_area: subject,
      verification_status: "verified",
      is_institution_contact: true, // sole representer of this institution
    });
    await makeDirectoryRow(generalBusiness, {
      subject_area: subject,
      verification_status: "verified",
      is_institution_contact: false,
    });
    const enquiry = await makeEnquiry(studentId, courseId, jobId);
    try {
      await runMatching(enquiry.id);
      const dists = await masterKnex("enquiry_distributions").where({ enquiry_id: enquiry.id });
      const repRow = dists.find((d: any) => d.business_id === repBusiness);
      if (!repRow) throw new Error("the institution's own representer must receive the enquiry");
      // T1-T4 are all representation-backed (exact tier depends on distance
      // band, country and verification) — there is no general/subject-matched
      // pool, so any tier at all means it was matched as the representer.
      eq(repRow.tier <= 4, true, `representer ranks in a rep tier, got tier ${repRow.tier}`);
    } finally {
      await cleanup({
        studentIds: [studentId],
        jobIds: [jobId],
        businessIds: [repBusiness, generalBusiness],
        enquiryIds: [enquiry.id],
      });
    }
  });

  // ── 1b-iii. Regression: a course-specific rep must not cover sibling courses ──
  // A representation that names a course also carries that institution's job_id.
  // Matching on job_id alone let a business representing ONE course at an
  // institution receive enquiries for every other course there.
  await assert("a rep scoped to one course does NOT match a different course at the same institution", async () => {
    // Country must match on both sides — it is a hard eligibility gate, so a
    // countryless fixture would match nothing and mask what this test checks.
    const countryId = await getCountryId("AU");
    const studentId = await makeStudent({ countryId });
    const subject = `Scoped Rep Subject ${Date.now()}`;
    const { jobId, courseId } = await makeJobAndCourse(subject);
    // A second course under the SAME institution, which the business does not name.
    const [sibling] = await masterKnex("superadmin.extraction_courses")
      .insert({ job_id: jobId, name: `Sibling Course ${Date.now()}`, subject_area: subject })
      .returning("id");
    const businessId = await makeBusiness();
    // Course-scoped representation: names both the job and one specific course.
    await makeRepresentation(businessId, { jobId, courseId });
    await makeDirectoryRow(businessId, { subject_area: subject, country_code: "AU", verification_status: "verified" });

    const own = await makeEnquiry(studentId, courseId, jobId);
    const other = await makeEnquiry(studentId, sibling.id, jobId);
    try {
      await runMatching(own.id);
      await runMatching(other.id);

      const ownDists = await masterKnex("enquiry_distributions").where({ enquiry_id: own.id });
      eq(ownDists.length, 1, "the represented course still matches");

      const otherDists = await masterKnex("enquiry_distributions")
        .where({ enquiry_id: other.id, business_id: businessId });
      eq(otherDists.length, 0, "a sibling course must NOT reach a course-scoped rep");
    } finally {
      await cleanup({
        studentIds: [studentId],
        jobIds: [jobId],
        businessIds: [businessId],
        enquiryIds: [own.id, other.id],
      });
    }
  });

  // ── 1c. Representing the institution (not the exact course) still counts ──
  await assert("a distribution records the representation that made the business eligible", async () => {
    const countryId = await getCountryId("AU");
    const studentId = await makeStudent({ countryId, lat: -33.8688, lon: 151.2093 });
    const subject = `RepId Subject ${Date.now()}`;
    const { jobId, courseId } = await makeJobAndCourse(subject);
    const businessId = await makeBusiness();
    const representationId = await makeRepresentation(businessId, { jobId, courseId });
    await makeDirectoryRow(businessId, {
      subject_area: subject,
      country_code: "AU",
      verification_status: "verified",
      latitude: -33.87,
      longitude: 151.21,
    });
    const enquiry = await makeEnquiry(studentId, courseId, jobId, { lat: -33.8688, lon: 151.2093 });
    try {
      await runMatching(enquiry.id);
      const dists = await masterKnex("enquiry_distributions").where({ enquiry_id: enquiry.id });
      eq(dists.length, 1, "one distribution");
      eq(dists[0].representation_id, representationId, "representation_id is recorded, not null");
    } finally {
      await cleanup({ studentIds: [studentId], jobIds: [jobId], businessIds: [businessId], enquiryIds: [enquiry.id] });
    }
  });

  await assert("with both a course-scoped and an institution-level rep, the course-scoped one is recorded", async () => {
    const countryId = await getCountryId("AU");
    const studentId = await makeStudent({ countryId, lat: -33.8688, lon: 151.2093 });
    const subject = `RepPref Subject ${Date.now()}`;
    const { jobId, courseId } = await makeJobAndCourse(subject);
    const businessId = await makeBusiness();
    // Institution-level first, so "most recently created" can't be what wins.
    await makeRepresentation(businessId, { jobId, courseId: null });
    const courseScopedId = await makeRepresentation(businessId, { jobId, courseId });
    await makeDirectoryRow(businessId, {
      subject_area: subject,
      country_code: "AU",
      verification_status: "verified",
      latitude: -33.87,
      longitude: 151.21,
    });
    const enquiry = await makeEnquiry(studentId, courseId, jobId, { lat: -33.8688, lon: 151.2093 });
    try {
      await runMatching(enquiry.id);
      const dists = await masterKnex("enquiry_distributions").where({ enquiry_id: enquiry.id });
      eq(dists.length, 1, "both reps belong to one business, so still one distribution");
      eq(dists[0].representation_id, courseScopedId, "the course-scoped representation wins");
    } finally {
      await cleanup({ studentIds: [studentId], jobIds: [jobId], businessIds: [businessId], enquiryIds: [enquiry.id] });
    }
  });

  await assert("representing the institution matches an enquiry for one of its other courses", async () => {
    const countryId = await getCountryId("AU");
    const studentId = await makeStudent({ countryId });
    const siblingSubject = `Sibling Subject ${Date.now()}`;
    const jobId = (await makeJobAndCourse(siblingSubject)).jobId;
    // A second course under the SAME institution, which the business does not
    // name explicitly — the institution-level representation should cover it.
    const [otherCourse] = await masterKnex("superadmin.extraction_courses")
      .insert({ job_id: jobId, name: `Other Course ${Date.now()}`, subject_area: siblingSubject })
      .returning("id");
    const businessId = await makeBusiness();
    await makeRepresentation(businessId, { jobId, courseId: null });
    await makeDirectoryRow(businessId, {
      subject_area: siblingSubject,
      country_code: "AU",
      verification_status: "verified",
    });
    const enquiry = await makeEnquiry(studentId, otherCourse.id, jobId);
    try {
      await runMatching(enquiry.id);
      const dists = await masterKnex("enquiry_distributions").where({ enquiry_id: enquiry.id });
      eq(dists.length, 1, "institution-level rep should match");
      eq(dists[0].business_id, businessId, "matched business");
    } finally {
      await cleanup({
        studentIds: [studentId],
        jobIds: [jobId],
        businessIds: [businessId],
        enquiryIds: [enquiry.id],
      });
    }
  });

  // ── 2. Zero eligible + no extraction_job_id → no_match ──
  await assert("zero eligible businesses and no extraction_job_id ends up no_match", async () => {
    const studentId = await makeStudent({ countryId: null });
    const { jobId, courseId } = await makeJobAndCourse("Underwater Basket Weaving XYZ");
    const enquiry = await makeEnquiry(studentId, courseId, null);
    try {
      await runMatching(enquiry.id);
      const updated = await masterKnex("enquiries").where({ id: enquiry.id }).first();
      eq(updated.status, "no_match", "enquiry status");
      const dists = await masterKnex("enquiry_distributions").where({ enquiry_id: enquiry.id });
      eq(dists.length, 0, "no distributions created");
    } finally {
      await cleanup({ studentIds: [studentId], jobIds: [jobId], enquiryIds: [enquiry.id] });
    }
  });

  // ── 3. Institution-direct fallback ──
  await assert("zero tier matches + extraction_job_id with is_institution_contact business → sole recipient", async () => {
    const studentId = await makeStudent({ countryId: null });
    const { jobId, courseId } = await makeJobAndCourse("Fallback Subject XYZ");
    const businessId = await makeBusiness(40);
    await masterKnex("representations").insert({
      business_id: businessId,
      extraction_job_id: jobId,
      extraction_course_id: null,
      status: "active",
    });
    await makeDirectoryRow(businessId, { is_institution_contact: true, verification_status: "verified" });
    const enquiry = await makeEnquiry(studentId, courseId, jobId);
    try {
      await runMatching(enquiry.id);
      const updated = await masterKnex("enquiries").where({ id: enquiry.id }).first();
      eq(updated.status, "distributed", "enquiry status");
      const dists = await masterKnex("enquiry_distributions").where({ enquiry_id: enquiry.id });
      eq(dists.length, 1, "sole recipient");
      eq(dists[0].business_id, businessId, "fallback business_id");
    } finally {
      await cleanup({ studentIds: [studentId], jobIds: [jobId], businessIds: [businessId], enquiryIds: [enquiry.id] });
    }
  });

  // ── 4. Never exceeds MAX_DISTRIBUTIONS ──
  await assert(`never creates more than ${MAX_DISTRIBUTIONS} distribution rows`, async () => {
    const countryId = await getCountryId("AU");
    const studentId = await makeStudent({ countryId, lat: -33.8688, lon: 151.2093 });
    const { jobId, courseId } = await makeJobAndCourse("Business Studies");
    const businessIds: number[] = [];
    for (let i = 0; i < MAX_DISTRIBUTIONS + 3; i++) {
      const businessId = await makeBusiness();
      businessIds.push(businessId);
      // Eligibility is representation-only now — a directory row alone matches nothing.
      await makeRepresentation(businessId, { jobId, courseId });
      await makeDirectoryRow(businessId, {
        subject_area: "Business Studies",
        country_code: "AU",
        verification_status: "verified",
        latitude: -33.87 - i * 0.01,
        longitude: 151.21,
      });
    }
    const enquiry = await makeEnquiry(studentId, courseId, jobId, { lat: -33.8688, lon: 151.2093 });
    try {
      await runMatching(enquiry.id);
      const dists = await masterKnex("enquiry_distributions").where({ enquiry_id: enquiry.id });
      eq(dists.length, MAX_DISTRIBUTIONS, "capped distribution count");
    } finally {
      await cleanup({ studentIds: [studentId], jobIds: [jobId], businessIds, enquiryIds: [enquiry.id] });
    }
  });

  // ── 5. Idempotency ──
  await assert("running matching twice does not duplicate distribution rows", async () => {
    const countryId = await getCountryId("AU");
    const studentId = await makeStudent({ countryId, lat: -33.8688, lon: 151.2093 });
    const { jobId, courseId } = await makeJobAndCourse("Data Science");
    const businessId = await makeBusiness();
    await makeRepresentation(businessId, { jobId, courseId });
    await makeDirectoryRow(businessId, {
      subject_area: "Data Science",
      country_code: "AU",
      verification_status: "verified",
      latitude: -33.87,
      longitude: 151.21,
    });
    const enquiry = await makeEnquiry(studentId, courseId, jobId, { lat: -33.8688, lon: 151.2093 });
    try {
      await runMatching(enquiry.id);
      await runMatching(enquiry.id); // second run — enquiry is no longer 'pending'

      const dists = await masterKnex("enquiry_distributions").where({ enquiry_id: enquiry.id });
      eq(dists.length, 1, "still exactly one distribution row");
    } finally {
      await cleanup({ studentIds: [studentId], jobIds: [jobId], businessIds: [businessId], enquiryIds: [enquiry.id] });
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  await masterKnex.destroy();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error("Fatal error:", err);
  await masterKnex.destroy();
  process.exit(1);
});
