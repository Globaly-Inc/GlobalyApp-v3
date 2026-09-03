/**
 * Matching engine tests — exercises matching.service against the real dev DB.
 * Run: node --import tsx tests/enquiries/matching.ts
 *
 * Covers:
 *  1. rankCandidates in isolation: distance bands, the hard country gate, verified-outranks-
 *     unverified, ordering, MAX_DISTRIBUTIONS, and "no representation, no match".
 *  2. Verified same-country rep gets matched at Tier 1, distribution row created, with the
 *     business_representations uuid recorded on the row.
 *  3. Every gate on eligibility: valid_until, status, deleted_at on the representation;
 *     enquiry_enabled and suspension on the business.
 *  4. Zero eligible businesses + no extraction_job_id → no_match.
 *  5. Institution-direct fallback, and its refusal when the institution is unreachable.
 *  6. Never creates more than MAX_DISTRIBUTIONS rows even with more eligible businesses.
 *  7. Idempotency: running matching twice does not duplicate distribution rows
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

/**
 * A job, a course, and the institution the job was promoted to.
 *
 * The institution is what matching keys on now: eligibility is a business_representations row
 * targeting `institutions.id`, and enquiries.institution_id is resolved from the job through
 * `institutions.source_job_id`. `email` is set so the institution counts as reachable — the
 * fallback declines an institution nobody can be notified at.
 */
async function makeJobAndCourse(
  subjectArea: string,
  opts: { institutionEmail?: string | null } = {},
): Promise<{ jobId: string; courseId: string; institutionId: number }> {
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
  const [institution] = await masterKnex("institutions")
    .insert({
      institution_name: `Match Test Institution ${suffix}`,
      subdomain: `match-test-inst-${suffix}`,
      email: opts.institutionEmail === undefined ? `match-test-${suffix}@example.com` : opts.institutionEmail,
      source_job_id: job.id,
      status: "pending",
      claim_status: "unclaimed",
    })
    .returning("id");
  return { jobId: job.id, courseId: course.id, institutionId: institution.id };
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
 * A promoted-but-unclaimed institution: no owner, no members, no tenant schema — exactly what
 * promoteInstitution writes. `email` is the knob under test: promote leaves it NULL when
 * extraction found no address, or when another institution already holds it.
 */
async function makeInstitution(email: string | null): Promise<number> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [row] = await masterKnex("institutions")
    .insert({
      institution_name: `Match Test Inst ${suffix}`,
      subdomain: `match-test-inst-${suffix}`,
      email,
      status: "pending",
      claim_status: "unclaimed",
    })
    .returning("id");
  return row.id;
}

/**
 * An ACTIVE business_representations link is the ONLY thing that makes a business eligible.
 * Without one, a business with perfect country/verification/geo matches nothing — there is no
 * general pool.
 *
 * Still takes a jobId so the call sites read the same; the institution is resolved through
 * `institutions.source_job_id`, which is the chain matching itself follows.
 *
 * `courseId` is accepted and ignored: representations are institution-level, so one covers every
 * course there. The call sites keep passing it because that is what they are enquiring about.
 */
async function makeRepresentation(
  businessId: number,
  opts: { jobId?: string | null; courseId?: string | null; validUntil?: string | null; status?: string },
): Promise<string> {
  const institution = opts.jobId
    ? await masterKnex("institutions").where({ source_job_id: opts.jobId }).first("id")
    : null;
  if (!institution) throw new Error("makeRepresentation needs a jobId whose institution exists");
  const [row] = await masterKnex("business_representations")
    .insert({
      originator_id: businessId,
      originator_type: "business",
      target_id: institution.id,
      target_type: "institution",
      valid_until: opts.validUntil ?? null,
      status: opts.status ?? "active",
    })
    .returning("uuid");
  return row.uuid;
}

/**
 * The ranking attributes, set on the business itself.
 *
 * They used to be cached on a projection table kept in sync by a background service; they are now
 * read live, so setting them here is all a case needs to do.
 *
 * `subject_area` and `is_institution_contact` are accepted and ignored: subject matching stopped
 * gating eligibility when representations took over, and the sole-representer flag is gone — a
 * sole representer is simply the only member of the ranked pool.
 */
async function setMatchAttributes(businessId: number, opts: Partial<{
  subject_area: string | null;
  country_code: string | null;
  verification_status: "verified" | "unverified";
  latitude: number | null;
  longitude: number | null;
  is_institution_contact: boolean;
  is_suspended: boolean;
}>) {
  await masterKnex("businesses")
    .where({ id: businessId })
    .update({
      country_id: opts.country_code ? await getCountryId(opts.country_code) : null,
      status: opts.is_suspended ? "suspended" : opts.verification_status === "verified" ? "verified" : "pending",
      latitude: opts.latitude ?? null,
      longitude: opts.longitude ?? null,
      enquiry_enabled: true,
    });
}

async function makeEnquiry(
  studentId: number,
  courseId: string,
  extractionJobId: string | null,
  geo?: { lat?: number; lon?: number; institutionId?: number },
) {
  const [row] = await masterKnex("enquiries")
    .insert({
      student_id: studentId,
      course_id: courseId,
      extraction_job_id: extractionJobId,
      // Same derivation createEnquiry performs: job -> institutions.source_job_id. Matching keys
      // its whole candidate query on this, so a null here matches nobody.
      institution_id:
        geo?.institutionId ??
        (extractionJobId
          ? (await masterKnex("institutions").where({ source_job_id: extractionJobId }).first("id"))?.id ?? null
          : null),
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

async function cleanup(opts: {
  studentIds?: number[];
  jobIds?: string[];
  businessIds?: number[];
  enquiryIds?: string[];
  institutionIds?: number[];
}) {
  if (opts.enquiryIds?.length) {
    await masterKnex("enquiry_distributions").whereIn("enquiry_id", opts.enquiryIds).delete();
    await masterKnex("audit_logs").whereIn("entity_id", opts.enquiryIds).delete();
    await masterKnex("enquiries").whereIn("id", opts.enquiryIds).delete();
  }
  if (opts.businessIds?.length) {
    await masterKnex("business_representations")
      .whereIn("originator_id", opts.businessIds)
      .where("originator_type", "business")
      .delete();
    await masterKnex("businesses").whereIn("id", opts.businessIds).delete();
  }
  if (opts.jobIds?.length) {
    // Institutions first: business_representations rows target them, and enquiries reference them.
    const institutions: number[] = await masterKnex("institutions").whereIn("source_job_id", opts.jobIds).pluck("id");
    if (institutions.length) {
      await masterKnex("business_representations")
        .whereIn("target_id", institutions)
        .where("target_type", "institution")
        .delete();
      await masterKnex("institutions").whereIn("id", institutions).delete();
    }
    for (const jobId of opts.jobIds) {
      await masterKnex("superadmin.extraction_courses").where({ job_id: jobId }).delete();
      await masterKnex("superadmin.extraction_jobs").where({ id: jobId }).delete();
    }
  }
  if (opts.institutionIds?.length) {
    await masterKnex("institutions").whereIn("id", opts.institutionIds).delete();
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

  await assert("a candidate with no country_code is never a recipient", () => {
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

  // ── 1. Verified same-country rep → Tier 1 ──
  await assert("a verified same-country rep is matched at Tier 1", async () => {
    const countryId = await getCountryId("AU");
    const studentId = await makeStudent({ countryId, lat: -33.8688, lon: 151.2093 }); // Sydney
    // Unique subject area to keep real dev-DB rows out of this enquiry's result
    // set. Belt-and-braces now that eligibility is representation-only, but it
    // costs nothing and keeps the test isolated from seed data.
    const subject = `Tier1 Subject ${Date.now()}`;
    const { jobId, courseId } = await makeJobAndCourse(subject);
    const businessId = await makeBusiness();
    await makeRepresentation(businessId, { jobId, courseId });
    await setMatchAttributes(businessId, {
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
  await assert("a business that does not represent the institution is NOT matched", async () => {
    const studentId = await makeStudent({ countryId: null });
    // Unique subjects: real dev-DB businesses can legitimately qualify for the
    // general tier on a common subject like "Business" and inflate the counts.
    const uniq = `Gate Subject ${Date.now()}`;
    const represented = await makeJobAndCourse(`${uniq} A`); // what the business reps
    const enquired = await makeJobAndCourse(`${uniq} B`); // an unrelated institution+course
    const businessId = await makeBusiness();
    await makeRepresentation(businessId, { jobId: represented.jobId, courseId: represented.courseId });
    await setMatchAttributes(businessId, {
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

  // ── 1c. Representing the institution (not the exact course) still counts ──
  await assert("a distribution records the representation that made the business eligible", async () => {
    const countryId = await getCountryId("AU");
    const studentId = await makeStudent({ countryId, lat: -33.8688, lon: 151.2093 });
    const subject = `RepId Subject ${Date.now()}`;
    const { jobId, courseId } = await makeJobAndCourse(subject);
    const businessId = await makeBusiness();
    const representationId = await makeRepresentation(businessId, { jobId, courseId });
    await setMatchAttributes(businessId, {
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
    await setMatchAttributes(businessId, {
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
  // ── 1d. The gates on the representation and on the business itself ──
  //
  // Each of these used to be a column on the match directory kept in sync by a background
  // service. They are now read live off business_representations / businesses, so a change takes
  // effect on the next enquiry rather than on the next sync.
  //
  // The institution behind these fixtures is reachable, so it takes the lead as the fallback —
  // what each case asserts is that the BUSINESS is not a recipient, not that nobody is.
  const gateCases: { name: string; apply: (businessId: number, jobId: string) => Promise<void> }[] = [
    {
      name: "a representation past its valid_until is not eligible",
      apply: async (businessId, jobId) => {
        await makeRepresentation(businessId, { jobId, validUntil: "2020-01-01" });
      },
    },
    {
      name: "an inactive representation is not eligible",
      apply: async (businessId, jobId) => {
        await makeRepresentation(businessId, { jobId, status: "inactive" });
      },
    },
    {
      name: "a soft-deleted representation is not eligible",
      apply: async (businessId, jobId) => {
        const uuid = await makeRepresentation(businessId, { jobId });
        await masterKnex("business_representations").where({ uuid }).update({ deleted_at: masterKnex.fn.now() });
      },
    },
    {
      name: "a business with enquiry_enabled = false is not eligible",
      apply: async (businessId, jobId) => {
        await makeRepresentation(businessId, { jobId });
        await masterKnex("businesses").where({ id: businessId }).update({ enquiry_enabled: false });
      },
    },
    {
      name: "a suspended business is not eligible",
      apply: async (businessId, jobId) => {
        await makeRepresentation(businessId, { jobId });
        await masterKnex("businesses").where({ id: businessId }).update({ status: "suspended" });
      },
    },
  ];

  for (const gate of gateCases) {
    await assert(gate.name, async () => {
      const countryId = await getCountryId("AU");
      const studentId = await makeStudent({ countryId });
      const { jobId, courseId } = await makeJobAndCourse(`Gate Subject ${Date.now()}`);
      const businessId = await makeBusiness();
      // Verified, same country — everything the ranker wants. Only the gate under test differs.
      await setMatchAttributes(businessId, { country_code: "AU", verification_status: "verified" });
      await gate.apply(businessId, jobId);
      const enquiry = await makeEnquiry(studentId, courseId, jobId);
      try {
        await runMatching(enquiry.id);
        const mine = await masterKnex("enquiry_distributions").where({ enquiry_id: enquiry.id, business_id: businessId });
        eq(mine.length, 0, "the gated business must not be a recipient");
      } finally {
        await masterKnex("enquiry_email_queue").where({ enquiry_id: enquiry.id }).delete();
        await cleanup({ studentIds: [studentId], jobIds: [jobId], businessIds: [businessId], enquiryIds: [enquiry.id] });
      }
    });
  }

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

  // ── 3b. The institution fallback needs someone to notify ──
  //
  // An unclaimed institution has no members and no tenant schema, so its contact email is the
  // whole audience. With that NULL there is nobody to mail and nowhere to mirror — distributing
  // anyway left the student on a 'distributed' enquiry no one could ever open.
  await assert("an institution with no contact email and no members is NOT a fallback recipient", async () => {
    const studentId = await makeStudent({ countryId: null });
    const { jobId, courseId } = await makeJobAndCourse("Unreachable Subject XYZ");
    const institutionId = await makeInstitution(null);
    const enquiry = await makeEnquiry(studentId, courseId, jobId, { institutionId });
    try {
      await runMatching(enquiry.id);
      const updated = await masterKnex("enquiries").where({ id: enquiry.id }).first();
      eq(updated.status, "no_match", "enquiry status");
      const dists = await masterKnex("enquiry_distributions").where({ enquiry_id: enquiry.id });
      eq(dists.length, 0, "no distributions created");
    } finally {
      await cleanup({ studentIds: [studentId], jobIds: [jobId], enquiryIds: [enquiry.id], institutionIds: [institutionId] });
    }
  });

  await assert("an institution WITH a contact email still receives the fallback", async () => {
    const studentId = await makeStudent({ countryId: null });
    const { jobId, courseId } = await makeJobAndCourse("Reachable Subject XYZ");
    const institutionId = await makeInstitution(`match-test-${Date.now()}@example.com`);
    const enquiry = await makeEnquiry(studentId, courseId, jobId, { institutionId });
    try {
      await runMatching(enquiry.id);
      const updated = await masterKnex("enquiries").where({ id: enquiry.id }).first();
      eq(updated.status, "distributed", "enquiry status");
      const dists = await masterKnex("enquiry_distributions").where({ enquiry_id: enquiry.id });
      eq(dists.length, 1, "sole recipient");
      eq(dists[0].institution_id, institutionId, "fallback institution_id");
      eq(dists[0].business_id, null, "no business behind an institution fallback");
      eq(dists[0].tier, 4, "institution fallback is tier 4");
    } finally {
      await masterKnex("enquiry_email_queue").where({ enquiry_id: enquiry.id }).delete();
      await cleanup({ studentIds: [studentId], jobIds: [jobId], enquiryIds: [enquiry.id], institutionIds: [institutionId] });
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
      // Eligibility is the representation and nothing else — matching attributes alone match nothing.
      await makeRepresentation(businessId, { jobId, courseId });
      await setMatchAttributes(businessId, {
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
    await setMatchAttributes(businessId, {
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
