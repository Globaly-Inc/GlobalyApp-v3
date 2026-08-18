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
 *   representation for that business -> POST /enquiries (real matching, not
 *   direct-target) -> confirm GET /enquiries/:id embeds the matched business ->
 *   switch into the business's own context -> GET /enquiry-distributions (reads
 *   the business's own tenant DB, per the scope-reduction's tenant-sync design) ->
 *   confirm an enquiry_distributed email was queued for the business.
 *
 * DB is poked directly only for what has no public API: seeding
 * extraction_jobs/extraction_courses/extraction_institution_overview
 * (superadmin-ingested data, out of this module's scope to create) and creating
 * the `representations` row (deliberately internal-only in this phase, per the
 * scope-reduction plan).
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
      // ponytail: onboardPersonal doesn't flip onboarding_completed (pre-existing gap,
      // out of scope for this module) — set it directly like every other enquiry test does.
      //
      // Coordinates are set here too: onboarding collects a city but never geocodes,
      // so a freshly-registered student has NULL lat/long and distance ranking can't
      // engage. Set directly (Sydney CBD) until something writes them for real.
      await client.query(
        `UPDATE platform_user_profiles
         SET onboarding_completed = true, latitude = -33.8688, longitude = 151.2093
         WHERE user_id = (SELECT id FROM platform_users WHERE email = $1)`,
        [studentEmail],
      );
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

    await assert("seed an extraction_jobs/extraction_courses/institution-overview fixture + a verified representation", async () => {
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
      // Representations are internal-only in this phase (no HTTP CRUD) — seed directly.
      await client.query(
        `INSERT INTO representations (business_id, extraction_job_id, extraction_course_id, status)
         VALUES ($1, $2, $3, 'active')`,
        [businessIntId, jobId, courseId],
      );
      // Geography is set directly because no portal writes it yet. Same country
      // and ~150m from the student, so the country + distance tiers are actually
      // exercised rather than sitting inert on NULLs.
      await client.query(
        `UPDATE businesses SET country_id = (SELECT id FROM countries WHERE iso2 = 'AU'),
                               latitude = -33.8700, longitude = 151.2100,
                               email = $2
         WHERE id = $1`,
        [businessIntId, `e2e-shared-inbox-${suffix}@example.com`],
      );
      // Let the sync build the directory row from the representation + business,
      // rather than hand-inserting it — that exercises the real sync path
      // (verified status, geo, enquiry_enabled, sole-representer flag).
      const { syncForBusiness } = await import("../../src/modules/enquiries/services/match-directory-sync.service.js");
      await syncForBusiness(businessIntId);

      const { rows: dir } = await client.query(
        `SELECT subject_area, country_code, verification_status, latitude, is_institution_contact
         FROM enquiry_match_directory WHERE business_id = $1`,
        [businessIntId],
      );
      eq(dir.length, 1, "sync produced one directory row");
      eq(dir[0].subject_area, "Computer Science", "directory subject_area from the represented course");
      eq(dir[0].country_code, "AU", "directory country_code from the business");
      eq(dir[0].verification_status, "verified", "directory verification_status from the business");
      eq(dir[0].is_institution_contact, true, "sole representer flagged as institution contact");
    });

    await assert("POST /enquiries creates a pending enquiry (real matching, not direct-target)", async () => {
      const { status, data } = await api("POST", "/enquiries", {
        course_id: courseId,
        message: "I would like to know more about this course via the real HTTP flow.",
      }, studentToken);
      eq(status, 201, "status");
      eq(data.status, "pending", "enquiry status");
      // Derived server-side from the course's job, never sent by the client.
      if (!data.institution_id) throw new Error("expected institution_id to be resolved on create");
      // Snapshotted from the profile so matching is reproducible.
      if (data.student_latitude === null) throw new Error("expected student coords to be snapshotted");
      enquiryId = data.id;
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
      await client.query(`DELETE FROM enquiry_match_directory WHERE business_id = $1`, [businessIntId]);
      await client.query(`DELETE FROM representations WHERE business_id = $1`, [businessIntId]);
      await client.query(`DELETE FROM businesses WHERE business_name LIKE $1`, [`E2E%${suffix}`]);
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
