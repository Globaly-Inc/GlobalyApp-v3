/**
 * Full end-to-end HTTP flow test, scoped to the student-only enquiry flow.
 * Run: node --import tsx tests/enquiries/e2e-http.ts (requires the dev server running
 * on localhost:3000 — same convention as tests/auth.ts).
 *
 * Every other test file in this directory calls service functions directly
 * (documented rationale in enquiries.ts/tenant-sync.ts: building signed JWTs is
 * extra plumbing). This file is the one gap that leaves: nothing exercises the real
 * routes with real JWTs, for both the student and business sides, together. Covers:
 *
 *   register + verify a student -> onboard -> register a business (provisions a
 *   real tenant schema) -> seed a course/institution fixture + a verified
 *   business_representations link for that business -> POST /enquiries (real matching, not
 *   direct-target) -> confirm GET /enquiries/:id embeds the matched business ->
 *   switch into the business's own context -> GET /enquiry-distributions (reads
 *   the business's own tenant DB, per the scope-reduction's tenant-sync design) ->
 *   confirm an enquiry_distributed email was queued for the business.
 *
 * Also covers eligibility end to end: GET /enquiries/eligibility/:courseId scores the student
 * against a course they fall short of, and POST /enquiries accepts that enquiry unchanged while
 * storing the verdict on the row. Eligibility informs, it never gates.
 *
 * DB is poked directly only for what has no public API: seeding
 * extraction_jobs/extraction_courses/extraction_institution_overview and the
 * eligibility requirements (superadmin-ingested data, out of this module's scope to create),
 * and creating the business_representations link, which the Partners tab owns — a different
 * actor's flow from the student->business path under test here.
 */

// Override with E2E_BASE_URL to run against a server on another port, e.g. when
// a stale dev server already holds 3000.
const BASE = `${process.env.E2E_BASE_URL ?? "http://localhost:3000"}/api/v3`;

let passed = 0;
let failed = 0;

async function api(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function assert(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.stack ?? err.message}`);
  }
}

function eq(actual: unknown, expected: unknown, label = "") {
  if (actual !== expected) {
    throw new Error(`${label ? label + ": " : ""}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function pgClient() {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ host: "localhost", port: 5432, user: "master_user", password: "password", database: "globalyapp" });
  await client.connect();
  return client;
}

async function setKnownOtp(client: any, email: string): Promise<string> {
  const { scryptSync, randomBytes } = await import("node:crypto");
  const knownOtp = "123456";
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(knownOtp, salt, 64).toString("hex");
  const stored = `${salt}:${hash}`;
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await client.query(`DELETE FROM auth_otp_challenges WHERE email = $1`, [email]);
  await client.query(`INSERT INTO auth_otp_challenges (email, otp_hash, expires_at) VALUES ($1, $2, $3)`, [email, stored, expires]);
  return knownOtp;
}

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const studentEmail = `e2e-student-${suffix}@example.com`;

let studentToken = "";
let studentUserId = 0;
let institutionIntId = 0;
let businessToken = "";
let businessOrgId = "";
let businessIntId = 0;
let courseId = "";
let jobId = "";
let enquiryId = "";

async function main() {
  const client = await pgClient();

  try {
    console.log("\n═══ End-to-end HTTP flow: submit -> match -> student sees business -> business portal reads tenant DB ═══\n");

    await assert("register + verify student account", async () => {
      const reg = await api("POST", "/auth/register", { first_name: "E2E", last_name: "Student", email: studentEmail });
      eq(reg.status, 201, "register status");
      const otp = await setKnownOtp(client, studentEmail);
      const verify = await api("POST", "/auth/verify-otp", { email: studentEmail, otp });
      eq(verify.status, 200, "verify status");
      studentToken = verify.data.access_token;
    });

    await assert("onboard student as personal student, profile complete", async () => {
      const { status } = await api("POST", "/platform-users/me/onboarding/personal", {
        individual_category: "student",
        nationality_id: 1,
        country_of_residence_id: 1,
        city_of_residence: "Sydney",
        date_of_birth: "2000-01-01",
        gender: "male",
        degree_level: "Bachelor",
      }, studentToken);
      eq(status, 201, "onboarding status");
      // POST /enquiries requires 100% profile completion, and onboarding only fills
      // 4 of the 8 criteria — top up the rest directly (photo, qualification,
      // language test, budget, destinations).
      //
      // Coordinates are set here too: onboarding collects a city but never geocodes,
      // so a freshly-registered student has NULL lat/long and distance ranking can't
      // engage. Set directly (Sydney CBD) until something writes them for real.
      const { rows: su } = await client.query(`SELECT id FROM platform_users WHERE email = $1`, [studentEmail]);
      studentUserId = su[0].id;
      await client.query(`UPDATE platform_users SET photo_url = 'test/photo.jpg' WHERE id = $1`, [studentUserId]);
      await client.query(
        `UPDATE platform_user_profiles
         SET latitude = -33.8688, longitude = 151.2093,
             budget_min = 10000, budget_max = 50000, preferred_destinations = '[1]'::jsonb
         WHERE user_id = $1`,
        [studentUserId],
      );
      // A real qualification, not just a row: the eligibility check compares
      // qualification_type (a degree_levels slug) against a course's min_degree_level, and a
      // NULL one can only ever produce "unknown".
      await client.query(
        `INSERT INTO platform_user_qualifications (user_id, qualification_type, grading_system, grade_value)
         VALUES ($1, 'diploma', 'percentage', '72')`,
        [studentUserId],
      );
      await client.query(`INSERT INTO platform_user_language_tests (user_id) VALUES ($1)`, [studentUserId]);
    });

    await assert("register a business (provisions a real tenant schema), switch into its context", async () => {
      const reg = await api("POST", "/businesses/register", {
        business_name: `E2E Biz ${suffix}`,
        subdomain: `e2e-biz-${suffix}`.slice(0, 20),
      }, studentToken);
      eq(reg.status, 201, "business register status");
      businessOrgId = reg.data.org.org_id;

      const { rows } = await client.query(`SELECT id FROM businesses WHERE schema_name = $1`, [businessOrgId]);
      eq(rows.length, 1, "business row found by schema_name");
      businessIntId = rows[0].id;
      await client.query(`UPDATE businesses SET status = 'verified' WHERE id = $1`, [businessIntId]);

      const sw = await api("POST", "/auth/switch-account", { org_id: businessOrgId }, studentToken);
      eq(sw.status, 200, "switch-account status");
      businessToken = sw.data.access_token;
    });

    await assert("seed an extraction_jobs/extraction_courses/institution fixture + a verified representation", async () => {
      const jobRes = await client.query(
        `INSERT INTO superadmin.extraction_jobs (institution_name, institution_url) VALUES ($1, $2) RETURNING id`,
        [`E2E Institution ${suffix}`, `https://e2e-${suffix}.example.com`],
      );
      jobId = jobRes.rows[0].id;
      const courseRes = await client.query(
        `INSERT INTO superadmin.extraction_courses (job_id, name, subject_area) VALUES ($1, $2, $3) RETURNING id`,
        [jobId, `E2E Course ${suffix}`, "Computer Science"],
      );
      courseId = courseRes.rows[0].id;
      await client.query(
        `INSERT INTO superadmin.extraction_institution_overview (job_id, name, logo_url) VALUES ($1, $2, $3)`,
        [jobId, `E2E Institution ${suffix}`, "https://example.com/logo.png"],
      );
      // The promoted institution — enquiries.institution_id points HERE (not at the overview
      // row), reached via source_job_id. Seeded directly because promote is an admin flow with
      // no part in this student->business path. Published, matching what the search page lists.
      const instRes = await client.query(
        `INSERT INTO institutions
           (platform_user_id, first_name, last_name, email, subdomain, institution_name, source_job_id, is_published)
         VALUES ($1, 'E2E', 'Institution', $2, $3, $4, $5, true) RETURNING id`,
        [studentUserId, `e2e-inst-${suffix}@example.com`, `e2e-inst-${suffix}`.slice(0, 20), `E2E Institution ${suffix}`, jobId],
      );
      institutionIntId = instRes.rows[0].id;
      // The eligibility link, seeded directly rather than through the Partners API: this suite is
      // the student -> business path, and the partner tab is a different actor's flow.
      await client.query(
        `INSERT INTO business_representations
           (originator_id, originator_type, target_id, target_type, status)
         VALUES ($1, 'business', $2, 'institution', 'active')`,
        [businessIntId, institutionIntId],
      );
      // Geography, verification and the enquiry flag are set directly because no portal writes
      // them yet. Same country and ~150m from the student, so the country + distance tiers are
      // actually exercised rather than sitting inert on NULLs. These columns ARE the matcher's
      // input now — there is no directory row synced from them any more.
      await client.query(
        `UPDATE businesses SET country_id = (SELECT id FROM countries WHERE iso2 = 'AU'),
                               latitude = -33.8700, longitude = 151.2100,
                               status = 'verified', enquiry_enabled = true,
                               email = $2
         WHERE id = $1`,
        [businessIntId, `e2e-shared-inbox-${suffix}@example.com`],
      );
    });

    await assert("POST /enquiries creates a pending enquiry (real matching, not direct-target)", async () => {
      const { status, data } = await api("POST", "/enquiries", {
        course_id: courseId,
        message: "I would like to know more about this course via the real HTTP flow.",
      }, studentToken);
      eq(status, 201, "status");
      eq(data.status, "pending", "enquiry status");
      // Derived server-side from the course's job, never sent by the client — and it is the
      // institutions row id, reached via institutions.source_job_id, not the overview uuid.
      eq(data.institution_id, institutionIntId, "institution_id resolves to the promoted institution");
      // Snapshotted from the profile so matching is reproducible.
      if (data.student_latitude === null) throw new Error("expected student coords to be snapshotted");
      enquiryId = data.id;

      // The whole point of the retarget: the extraction job is still reachable from an
      // enquiry, now by walking institution_id -> institutions.source_job_id.
      const { rows } = await client.query(
        `SELECT ej.id AS job_id, i.institution_name
           FROM enquiries e
           JOIN institutions i ON i.id = e.institution_id
           JOIN superadmin.extraction_jobs ej ON ej.id = i.source_job_id
          WHERE e.id = $1`,
        [enquiryId],
      );
      eq(rows.length, 1, "enquiry -> institution -> extraction job chain resolves");
      eq(rows[0].job_id, jobId, "chain lands on the course's extraction job");
    });

    await assert("matching distributes at T1 with a real distance (geo tiering active)", async () => {
      const { runMatching } = await import("../../src/modules/enquiries/services/matching.service.js");
      await runMatching(enquiryId);
      const { rows } = await client.query(
        `SELECT e.status, e.student_country_code, d.tier, d.match_distance_km
         FROM enquiries e LEFT JOIN enquiry_distributions d ON d.enquiry_id = e.id
         WHERE e.id = $1`,
        [enquiryId],
      );
      eq(rows[0].status, "distributed", "enquiry status after matching");
      eq(rows[0].student_country_code, "AU", "student country resolved");
      eq(rows[0].tier, 1, "verified rep in the same country ranks T1");
      if (rows[0].match_distance_km === null) throw new Error("expected a computed distance, got null");
    });

    await assert("the distribution is mirrored into the business's own tenant DB", async () => {
      const { rows } = await client.query(`SELECT schema_name FROM businesses WHERE id = $1`, [businessIntId]);
      const { rows: tenantRows } = await client.query(
        `SELECT enquiry_id, status FROM "${rows[0].schema_name}".business_enquiries WHERE enquiry_id = $1`,
        [enquiryId],
      );
      eq(tenantRows.length, 1, "one tenant mirror row");
      eq(tenantRows[0].status, "distributed", "tenant row status");
    });

    await assert("GET /enquiries/:id (student) embeds the matched business", async () => {
      const { status, data } = await api("GET", `/enquiries/${enquiryId}`, undefined, studentToken);
      eq(status, 200, "status");
      eq(data.distributions.length, 1, "distributions count");
      eq(data.distributions[0].business_id, businessIntId, "matched business_id");
      eq(data.distributions[0].business_name, `E2E Biz ${suffix}`, "matched business_name");
    });

    await assert("GET /enquiry-distributions (business, reads its own tenant DB) shows the enquiry", async () => {
      const { status, data } = await api("GET", "/enquiry-distributions", undefined, businessToken);
      eq(status, 200, "status");
      const row = (data.data ?? []).find((r: any) => r.enquiry_id === enquiryId);
      if (!row) throw new Error(`expected the enquiry to appear in the business's tenant-sourced inbox, got: ${JSON.stringify(data)}`);
      eq(row.course_name?.startsWith("E2E Course"), true, "listed course_name");
      eq(row.institution_name?.startsWith("E2E Institution"), true, "listed institution_name");
    });

    await assert("email queued for both the team member and the business's shared inbox", async () => {
      const { rows } = await client.query(
        `SELECT recipient_email, recipient_user_id FROM enquiry_email_queue
         WHERE business_id = $1 AND template = 'enquiry_distributed'`,
        [businessIntId],
      );
      eq(rows.length, 2, `one per team member plus the shared inbox, got ${JSON.stringify(rows)}`);
      const shared = rows.find((r: any) => r.recipient_email.includes("e2e-shared-inbox"));
      if (!shared) throw new Error("expected businesses.email to be queued");
      eq(shared.recipient_user_id, null, "shared inbox has no platform user");
    });

    await assert("the rendered email names the course and carries the View Enquiries CTA", async () => {
      const { mailerService } = await import("../../src/shared/mail/mailerService.js");
      const emailQueue = await import("../../src/modules/enquiries/services/email-queue.service.js");
      const sent: any[] = [];
      const original = mailerService.sendMail;
      mailerService.sendMail = async (m: any) => { sent.push(m); return { messageId: "stub" } as any; };
      try {
        const { rows } = await client.query(
          `SELECT id FROM enquiry_email_queue WHERE business_id = $1 AND status <> 'sent'`,
          [businessIntId],
        );
        for (const r of rows) await emailQueue.sendQueuedRow(r.id);
        if (sent.length === 0) throw new Error("expected at least one email to be sent");
        const one = sent[0];
        eq(one.subject.startsWith("New student enquiry — E2E Course"), true, `subject was: ${one.subject}`);
        eq(one.text.includes("/business/enquiries"), true, `body missing CTA: ${one.text}`);
        eq(one.text.includes("E2E Institution"), true, "body names the institution");
      } finally {
        mailerService.sendMail = original;
      }
    });

    await assert("an enquiry for a different institution is NOT distributed to this business", async () => {
      // The business represents only the institution seeded above, so an enquiry
      // about an unrelated institution must not reach it — the representation gate.
      const otherJob = await client.query(
        `INSERT INTO superadmin.extraction_jobs (institution_name, institution_url)
         VALUES ($1, $2) RETURNING id`,
        [`E2E Other Institution ${suffix}`, `https://e2e-other-inst-${suffix}.example.com`],
      );
      const otherJobId = otherJob.rows[0].id;
      const otherCourse = await client.query(
        `INSERT INTO superadmin.extraction_courses (job_id, name, subject_area)
         VALUES ($1, $2, $3) RETURNING id`,
        [otherJobId, `E2E Unrelated Course ${suffix}`, "Marine Biology"],
      );
      const { status, data } = await api("POST", "/enquiries", {
        course_id: otherCourse.rows[0].id,
        message: "This enquiry is about an institution nobody represents.",
      }, studentToken);
      eq(status, 201, "created");
      const { runMatching } = await import("../../src/modules/enquiries/services/matching.service.js");
      await runMatching(data.id);
      const { rows } = await client.query(
        `SELECT e.status, count(d.id)::int AS dist FROM enquiries e
         LEFT JOIN enquiry_distributions d ON d.enquiry_id = e.id
         WHERE e.id = $1 GROUP BY e.status`,
        [data.id],
      );
      eq(rows[0].status, "no_match", "unrepresented institution yields no_match");
      eq(rows[0].dist, 0, "no distributions created");

      await client.query(`DELETE FROM audit_logs WHERE entity_id = $1`, [data.id]);
      await client.query(`DELETE FROM enquiries WHERE id = $1`, [data.id]);
      await client.query(`DELETE FROM superadmin.extraction_courses WHERE job_id = $1`, [otherJobId]);
      await client.query(`DELETE FROM superadmin.extraction_jobs WHERE id = $1`, [otherJobId]);
    });

    await assert("falling short of the requirements is scored and stored, and never blocks the send", async () => {
      // A course at the SAME institution (so it is represented) whose entry requirement the
      // student definitively fails: they hold a diploma, this asks for a master's.
      const course = await client.query(
        `INSERT INTO superadmin.extraction_courses (job_id, name, subject_area)
         VALUES ($1, $2, $3) RETURNING id`,
        [jobId, `E2E Selective Course ${suffix}`, "Computer Science"],
      );
      const selectiveCourseId = course.rows[0].id;
      const requirement = await client.query(
        `INSERT INTO superadmin.extraction_eligibility_requirements
           (job_id, applicable_to, min_degree_level) VALUES ($1, 'both', $2) RETURNING id`,
        [jobId, "Master's"],
      );
      // Assigned to this course only — which is also what keeps it from leaking onto the other
      // course as an institution-level requirement.
      await client.query(
        `INSERT INTO superadmin.extraction_course_eligibility_assignments
           (job_id, course_id, eligibility_requirement_id) VALUES ($1, $2, $3)`,
        [jobId, selectiveCourseId, requirement.rows[0].id],
      );

      const check = await api("GET", `/enquiries/eligibility/${selectiveCourseId}`, undefined, studentToken);
      eq(check.status, 200, "eligibility check status");
      eq(check.data.status, "not_eligible", "verdict");
      eq(check.data.percentage, 0, "the one comparable criterion failed");
      eq(check.data.criteria[0].status, "fail", "the degree criterion fails");
      eq(check.data.criteria[0].actual, "diploma", "what the student holds");

      const sent = await api("POST", "/enquiries", {
        course_id: selectiveCourseId,
        message: "I would like to apply even though I may not meet the entry requirements.",
      }, studentToken);
      eq(sent.status, 201, "falling short must not refuse the enquiry");
      eq(sent.data.eligibility_snapshot.status, "not_eligible", "the verdict is stored on the enquiry");
      eq(sent.data.eligibility_snapshot.percentage, 0, "and so is the score");

      const { runMatching } = await import("../../src/modules/enquiries/services/matching.service.js");
      await runMatching(sent.data.id);

      await client.query(`DELETE FROM enquiry_email_queue WHERE enquiry_id = $1`, [sent.data.id]);
      const { rows: dists } = await client.query(`SELECT id FROM enquiry_distributions WHERE enquiry_id = $1`, [sent.data.id]);
      if (dists.length) {
        await client.query(`DELETE FROM audit_logs WHERE entity_id = ANY($1::uuid[])`, [dists.map((d: any) => d.id)]);
        await client.query(`DELETE FROM enquiry_distributions WHERE enquiry_id = $1`, [sent.data.id]);
      }
      await client.query(`DELETE FROM audit_logs WHERE entity_id = $1`, [sent.data.id]);
      await client.query(`DELETE FROM enquiries WHERE id = $1`, [sent.data.id]);
      await client.query(`DELETE FROM superadmin.extraction_courses WHERE id = $1`, [selectiveCourseId]);
      await client.query(`DELETE FROM superadmin.extraction_eligibility_requirements WHERE id = $1`, [requirement.rows[0].id]);
    });

    await assert("a second, unrelated business cannot see this enquiry in its own tenant inbox", async () => {
      const otherEmail = `e2e-other-${suffix}@example.com`;
      await api("POST", "/auth/register", { first_name: "Other", last_name: "Student", email: otherEmail });
      const otp = await setKnownOtp(client, otherEmail);
      const verify = await api("POST", "/auth/verify-otp", { email: otherEmail, otp });
      const otherStudentToken = verify.data.access_token;
      const reg = await api("POST", "/businesses/register", {
        business_name: `E2E Other Biz ${suffix}`,
        subdomain: `e2e-other-${suffix}`.slice(0, 20),
      }, otherStudentToken);
      const sw = await api("POST", "/auth/switch-account", { org_id: reg.data.org.org_id }, otherStudentToken);
      const { status, data } = await api("GET", "/enquiry-distributions", undefined, sw.data.access_token);
      eq(status, 200, "status");
      const row = (data.data ?? []).find((r: any) => r.enquiry_id === enquiryId);
      if (row) throw new Error("an unrelated business must not see another business's enquiry");
    });
    await assert("cleanup", async () => {
      await client.query(`DELETE FROM enquiry_distributions WHERE enquiry_id = $1`, [enquiryId]);
      await client.query(`DELETE FROM enquiry_email_queue WHERE business_id = $1`, [businessIntId]);
      await client.query(`DELETE FROM audit_logs WHERE entity_id = $1`, [enquiryId]);
      await client.query(`DELETE FROM enquiries WHERE id = $1`, [enquiryId]);
      await client.query(
        `DELETE FROM business_representations WHERE originator_id = $1 AND originator_type = 'business'`,
        [businessIntId],
      );
      await client.query(`DELETE FROM businesses WHERE business_name LIKE $1`, [`E2E%${suffix}`]);
      await client.query(`DELETE FROM institutions WHERE source_job_id = $1`, [jobId]);
      await client.query(`DELETE FROM superadmin.extraction_institution_overview WHERE job_id = $1`, [jobId]);
      await client.query(`DELETE FROM superadmin.extraction_courses WHERE job_id = $1`, [jobId]);
      await client.query(`DELETE FROM superadmin.extraction_jobs WHERE id = $1`, [jobId]);
      await client.query(`DELETE FROM platform_user_profiles WHERE user_id IN (SELECT id FROM platform_users WHERE email LIKE $1)`, [`e2e-%${suffix}%`]);
      await client.query(`DELETE FROM platform_users WHERE email LIKE $1`, [`e2e-%${suffix}%`]);
    });
  } finally {
    console.log(`\n${passed} passed, ${failed} failed`);
    await client.end();
    const { masterKnex } = await import("../../src/core/db/master-pool.js");
    await masterKnex.destroy();
    process.exit(failed > 0 ? 1 : 0);
  }
}

main();
