/**
 * Tenant-sync test — exercises tenant-sync.service + the tenant-sourced business
 * inbox listing, against the real dev DB. Run: node --import tsx tests/enquiries/tenant-sync.ts
 *
 * Service functions (not HTTP routes) are the unit under test, same rationale as
 * enquiries.ts/matching.ts: distributions.service.listForBusiness(db, filters) is
 * exactly what the GET /enquiry-distributions route handler calls with req.db, so
 * calling it directly with a tenant Knex handle proves the route's behavior without
 * the extra JWT-signing plumbing.
 *
 * Covers:
 *  1. Submitting an enquiry that matches a business → a tenant `business_enquiries` row
 *     appears in that business's own schema with the right enquiry_id/distribution_id.
 *  2. distributions.service.listForBusiness(tenantDb, {}) (the GET /enquiry-distributions
 *     handler's own call) returns the row enriched with course/institution/message.
 */

import { masterKnex } from "../../src/core/db/master-pool.js";
import { getKnex } from "../../src/core/db/pool-manager.js";
import { schemaName } from "../../src/core/db/knex.js";
import { provisionBusinessSchema } from "../../src/core/business/provisioner.js";
import { runMatching } from "../../src/modules/enquiries/services/matching.service.js";
import * as distributionsService from "../../src/modules/enquiries/services/distributions.service.js";

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
    console.log(`    ${err.stack ?? err.message}`);
  }
}

function eq(actual: unknown, expected: unknown, label = "") {
  if (actual !== expected) {
    throw new Error(`${label ? label + ": " : ""}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

/** Country is a hard matching gate, so the student and the directory row must
 * agree on one or nothing matches and this test can never reach the tenant sync. */
async function getCountryId(iso2: string): Promise<number> {
  const row = await masterKnex("countries").where({ iso2 }).first("id");
  if (row) return row.id;
  const [inserted] = await masterKnex("countries")
    .insert({ name: `Test-${iso2}-${Date.now()}`, iso2, iso3: `${iso2}X`, is_active: true })
    .returning("id");
  return inserted.id;
}

async function makeStudent(): Promise<number> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [user] = await masterKnex("platform_users")
    .insert({
      first_name: "Sync",
      last_name: "Student",
      email: `tenant-sync-test-${suffix}@example.com`,
      account_status: 1,
      is_personal_account: true,
    })
    .returning("id");
  await masterKnex("platform_user_profiles").insert({
    user_id: user.id,
    onboarding_completed: true,
    individual_category: "student",
    country_of_residence_id: await getCountryId("AU"),
  });
  return user.id;
}

async function makeJobAndCourse(): Promise<{ jobId: string; courseId: string; overviewId: string; institutionId: number }> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [job] = await masterKnex("superadmin.extraction_jobs")
    .insert({
      institution_name: `Tenant Sync Institution ${suffix}`,
      institution_url: `https://tenant-sync-${suffix}.example.com`,
    })
    .returning("id");
  const [course] = await masterKnex("superadmin.extraction_courses")
    .insert({ job_id: job.id, name: `Tenant Sync Course ${suffix}`, subject_area: "Tenant Sync Subject" })
    .returning("id");
  const [overview] = await masterKnex("superadmin.extraction_institution_overview")
    .insert({ job_id: job.id, name: `Tenant Sync Institution ${suffix}`, logo_url: "https://example.com/logo.png" })
    .returning("id");
  // The promoted institution — what a business_representations row targets and what the enquiry's
  // institution_id points at.
  const [institution] = await masterKnex("institutions")
    .insert({
      institution_name: `Tenant Sync Institution ${suffix}`,
      subdomain: `tenant-sync-inst-${suffix}`,
      email: `tenant-sync-inst-${suffix}@example.com`,
      source_job_id: job.id,
      status: "pending",
      claim_status: "unclaimed",
    })
    .returning("id");
  return { jobId: job.id, courseId: course.id, overviewId: overview.id, institutionId: institution.id };
}

/** Provisioned business (real schema, tenant migrations applied) — required to
 * exercise a real tenant Knex handle, unlike matching.ts's makeBusiness which
 * only needs a `businesses` row for central matching logic. */
async function makeProvisionedBusiness(): Promise<{ id: number; schemaUuid: string }> {
  const owner = await masterKnex("platform_users").orderBy("id").first();
  if (!owner) throw new Error("no platform_users row available to own the test business");
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [row] = await masterKnex("businesses")
    .insert({
      owner_id: owner.id,
      subdomain: `tenant-sync-test-${suffix}`,
      business_name: `Tenant Sync Test Biz ${suffix}`,
      account_status: 1,
    })
    .returning(["id", "schema_name"]);
  await provisionBusinessSchema(row.schema_name);
  // Ranking attributes live on the business itself now. No coordinates: this suite only cares
  // that a match happens at all, and an unknown distance still ranks (T3).
  await masterKnex("businesses").where({ id: row.id }).update({
    country_id: await getCountryId("AU"),
    status: "verified",
    enquiry_enabled: true,
  });
  return { id: row.id, schemaUuid: row.schema_name };
}

async function makeEnquiry(studentId: number, courseId: string, extractionJobId: string, institutionId: number) {
  const [row] = await masterKnex("enquiries")
    .insert({
      student_id: studentId,
      course_id: courseId,
      extraction_job_id: extractionJobId,
      // Matching keys its whole candidate query on this — the same derivation createEnquiry does.
      institution_id: institutionId,
      message: "This is a test enquiry message for tenant-sync tests.",
      status: "pending",
    })
    .returning("*");
  return row;
}

async function cleanup(opts: { studentId: number; jobId: string; businessId: number; enquiryId: string; overviewId: string }) {
  await masterKnex("enquiry_distributions").where({ enquiry_id: opts.enquiryId }).delete();
  await masterKnex("audit_logs").where({ entity_id: opts.enquiryId }).delete();
  await masterKnex("enquiries").where({ id: opts.enquiryId }).delete();
  await masterKnex("business_representations")
    .where({ originator_id: opts.businessId, originator_type: "business" })
    .delete();
  await masterKnex("businesses").where({ id: opts.businessId }).delete();
  await masterKnex("institutions").where({ source_job_id: opts.jobId }).delete();
  await masterKnex("superadmin.extraction_institution_overview").where({ id: opts.overviewId }).delete();
  await masterKnex("superadmin.extraction_courses").where({ job_id: opts.jobId }).delete();
  await masterKnex("superadmin.extraction_jobs").where({ id: opts.jobId }).delete();
  await masterKnex("platform_user_profiles").where({ user_id: opts.studentId }).delete();
  await masterKnex("platform_users").where({ id: opts.studentId }).delete();
}

async function main() {
  console.log("Tenant-sync tests (DB integration)\n");

  await assert("matched distribution syncs a tenant enquiries row + shows up in business inbox listing", async () => {
    const studentId = await makeStudent();
    const { jobId, courseId, overviewId, institutionId } = await makeJobAndCourse();
    const business = await makeProvisionedBusiness();
    // Eligibility is the representation and nothing else — a business with perfect country and
    // verification but no link to this institution matches nothing.
    await masterKnex("business_representations").insert({
      originator_id: business.id,
      originator_type: "business",
      target_id: institutionId,
      target_type: "institution",
      status: "active",
    });
    const enquiry = await makeEnquiry(studentId, courseId, jobId, institutionId);

    try {
      await runMatching(enquiry.id);

      const dist = await masterKnex("enquiry_distributions").where({ enquiry_id: enquiry.id }).first();
      if (!dist) throw new Error("expected a distribution row to be created");
      eq(dist.business_id, business.id, "distribution business_id");

      // give the fire-and-forget tenant sync (Promise.allSettled, awaited inside
      // commitDistributions before it returns) a moment — runMatching already
      // awaits it, but this guards against future changes loosening that.
      const tenantDb = await getKnex(business.id, schemaName(business.schemaUuid));
      const tenantRow = await tenantDb("business_enquiries").where({ enquiry_id: enquiry.id }).first();
      if (!tenantRow) throw new Error("expected a tenant business_enquiries row to be synced");
      eq(tenantRow.distribution_id, dist.id, "tenant row distribution_id");
      eq(tenantRow.status, "distributed", "tenant row status");

      const recipient = { kind: "business" as const, id: business.id };
      const inbox = (await distributionsService.listForBusiness(tenantDb, recipient, { page: 1, limit: 50 })).data;
      eq(inbox.length, 1, "inbox row count");
      eq(inbox[0].enquiry_id, enquiry.id, "inbox enquiry_id");
      eq(inbox[0].distribution_id, dist.id, "inbox distribution_id");
      eq(inbox[0].message, "This is a test enquiry message for tenant-sync tests.", "inbox message");
      eq(inbox[0].course_name?.startsWith("Tenant Sync Course"), true, "inbox course_name");
      eq(inbox[0].institution_name?.startsWith("Tenant Sync Institution"), true, "inbox institution_name");
      eq(inbox[0].tier, dist.tier, "inbox tier");
      eq(inbox[0].status, dist.status, "inbox status");

      // ── 3. The mirror repairs itself on read ──
      //
      // Every writer of business_enquiries swallows its errors, and the listing treats a
      // missing row as "no lead" — so a single flaked write used to lose the lead forever.
      // Deleting the row is exactly what a swallowed failure leaves behind.
      await tenantDb("business_enquiries").where({ enquiry_id: enquiry.id }).delete();
      eq(
        await tenantDb("business_enquiries").where({ enquiry_id: enquiry.id }).first(),
        undefined,
        "tenant row is gone before the repair",
      );

      const repaired = (await distributionsService.listForBusiness(tenantDb, recipient, { page: 1, limit: 50 })).data;
      eq(repaired.length, 1, "the lead is back in the inbox");
      eq(repaired[0].distribution_id, dist.id, "repaired distribution_id");
      // Replayed from the central row, not reset to 'distributed'.
      eq(repaired[0].status, dist.status, "repaired status comes from the central row");
    } finally {
      await cleanup({ studentId, jobId, businessId: business.id, enquiryId: enquiry.id, overviewId });
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  await masterKnex.destroy();
  process.exit(failed > 0 ? 1 : 0);
}

main();
