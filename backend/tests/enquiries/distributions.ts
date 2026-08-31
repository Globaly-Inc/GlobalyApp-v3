/**
 * Distributions test — the business side of an enquiry: unlock (paywall) and close.
 * Run: node --import tsx tests/enquiries/distributions.ts
 *
 * Exercises distributions.service directly rather than over HTTP, same rationale as
 * the sibling suites: the route handlers are thin wrappers that parse params and
 * call these functions with req.businessId, so calling them directly proves the
 * behaviour without JWT-signing plumbing.
 *
 * Businesses here are REAL provisioned tenant schemas, because unlock/close mirror
 * their new status onto `business_enquiries` and a business without a schema would
 * let that regress unnoticed.
 *
 * Note credits are ONE shared in-code pool (see credits.service.ts), so every test
 * reads getBalance() before and after rather than assuming a starting value.
 */

import { masterKnex } from "../../src/core/db/master-pool.js";
import { getKnex } from "../../src/core/db/pool-manager.js";
import { schemaName } from "../../src/core/db/knex.js";
import { provisionBusinessSchema } from "../../src/core/business/provisioner.js";
import { runMatching } from "../../src/modules/enquiries/services/matching.service.js";
import * as service from "../../src/modules/enquiries/services/distributions.service.js";
import * as creditsService from "../../src/modules/enquiries/services/credits.service.js";

/** The services now address a recipient (business or institution) rather than a bare id. */
const asBiz = (id: number) => ({ kind: "business" as const, id });


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

/** Asserts fn rejects with a specific error class, so a silent success can't pass. */
async function rejectsWith(fn: () => Promise<unknown>, errorName: string, label = "") {
  try {
    await fn();
  } catch (err: any) {
    eq(err.constructor.name, errorName, `${label} error type`);
    return err;
  }
  throw new Error(`${label}: expected ${errorName}, but it resolved`);
}

const MESSAGE =
  "I would like detailed information about scholarships, intake dates and the visa process for this course.";

async function getCountryId(iso2: string): Promise<number> {
  const row = await masterKnex("countries").where({ iso2 }).first("id");
  if (row) return row.id;
  const [inserted] = await masterKnex("countries")
    .insert({ name: `Test-${iso2}-${Date.now()}`, iso2, iso3: `${iso2}X`, is_active: true })
    .returning("id");
  return inserted.id;
}

async function makeStudent(countryId: number): Promise<number> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [user] = await masterKnex("platform_users")
    .insert({
      first_name: "Unlock",
      last_name: "Student",
      email: `dist-test-${suffix}@example.com`,
      phone: "+61400000000",
      account_status: 1,
      is_personal_account: true,
    })
    .returning("id");
  await masterKnex("platform_user_profiles").insert({
    user_id: user.id,
    onboarding_completed: true,
    individual_category: "student",
    country_of_residence_id: countryId,
    latitude: -33.8688,
    longitude: 151.2093,
  });
  return user.id;
}

/**
 * Job, course, and the institution the job was promoted to. The institution is what eligibility
 * hangs off now — a business_representations row targets `institutions.id`, and the enquiry's
 * own `institution_id` is resolved through `institutions.source_job_id`.
 */
async function makeJobAndCourse(subject: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [job] = await masterKnex("superadmin.extraction_jobs")
    .insert({ institution_name: `Dist Institution ${suffix}`, institution_url: `https://dist-${suffix}.example.com` })
    .returning("id");
  const [course] = await masterKnex("superadmin.extraction_courses")
    .insert({ job_id: job.id, name: `Dist Course ${suffix}`, subject_area: subject })
    .returning("id");
  await masterKnex("superadmin.extraction_institution_overview").insert({
    job_id: job.id,
    name: `Dist Institution ${suffix}`,
  });
  const [institution] = await masterKnex("institutions")
    .insert({
      institution_name: `Dist Institution ${suffix}`,
      subdomain: `dist-inst-${suffix}`,
      email: `dist-inst-${suffix}@example.com`,
      source_job_id: job.id,
      status: "pending",
      claim_status: "unclaimed",
    })
    .returning("id");
  return { jobId: job.id, courseId: course.id, institutionId: institution.id };
}

/** Provisioned business + active representation + directory row: a business that
 * will actually be matched AND has a tenant schema to mirror status into. */
async function makeRecipient(
  jobId: string,
  courseId: string,
  subject: string,
  offsetDeg = 0,
): Promise<{ id: number; schemaUuid: string }> {
  const owner = await masterKnex("platform_users").orderBy("id").first();
  if (!owner) throw new Error("no platform_users row available to own the test business");
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [row] = await masterKnex("businesses")
    .insert({
      owner_id: owner.id,
      subdomain: `dist-test-${suffix}`,
      business_name: `Dist Test Biz ${suffix}`,
      account_status: 1,
    })
    .returning(["id", "schema_name"]);
  await provisionBusinessSchema(row.schema_name);
  const institution = await masterKnex("institutions").where({ source_job_id: jobId }).first("id");
  await masterKnex("business_representations").insert({
    originator_id: row.id,
    originator_type: "business",
    target_id: institution.id,
    target_type: "institution",
    status: "active",
  });
  // Ranking attributes live on the business now, not on a synced directory row.
  await masterKnex("businesses").where({ id: row.id }).update({
    country_id: await getCountryId("AU"),
    status: "verified",
    // Spread a few km apart so ranking is deterministic; all well inside T1.
    latitude: -33.87 - offsetDeg,
    longitude: 151.21,
    enquiry_enabled: true,
  });
  return { id: row.id, schemaUuid: row.schema_name };
}

async function distributionFor(enquiryId: string, businessId: number) {
  const row = await masterKnex("enquiry_distributions")
    .where({ enquiry_id: enquiryId, business_id: businessId })
    .first();
  if (!row) throw new Error(`no distribution for business ${businessId}`);
  return row;
}

async function tenantStatus(businessId: number, schemaUuid: string, enquiryId: string) {
  const db = await getKnex(businessId, schemaName(schemaUuid));
  const row = await db("business_enquiries").where({ enquiry_id: enquiryId }).first();
  return row?.status ?? null;
}

async function listFor(businessId: number, schemaUuid: string) {
  const db = await getKnex(businessId, schemaName(schemaUuid));
  return service.listForBusiness(db, { kind: "business", id: businessId }, {});
}

/** One enquiry fanned out to `count` provisioned businesses. */
async function scenario(count: number) {
  const countryId = await getCountryId("AU");
  const studentId = await makeStudent(countryId);
  const subject = `Dist Subject ${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const { jobId, courseId, institutionId } = await makeJobAndCourse(subject);

  const businesses: Array<{ id: number; schemaUuid: string }> = [];
  for (let i = 0; i < count; i++) {
    businesses.push(await makeRecipient(jobId, courseId, subject, i * 0.01));
  }

  const [enquiry] = await masterKnex("enquiries")
    .insert({
      student_id: studentId,
      course_id: courseId,
      extraction_job_id: jobId,
      // Matching keys its whole candidate query on this — the same derivation createEnquiry does.
      institution_id: institutionId,
      message: MESSAGE,
      student_latitude: -33.8688,
      student_longitude: 151.2093,
      status: "pending",
    })
    .returning("*");

  await runMatching(enquiry.id);

  return {
    studentId,
    enquiry,
    businesses,
    cleanup: async () => {
      const distIds = (
        await masterKnex("enquiry_distributions").where({ enquiry_id: enquiry.id }).select("id")
      ).map((r) => r.id);
      if (distIds.length) await masterKnex("audit_logs").whereIn("entity_id", distIds).delete();
      await masterKnex("audit_logs").where({ entity_id: enquiry.id }).delete();
      await masterKnex("enquiry_email_queue").where({ enquiry_id: enquiry.id }).delete();
      await masterKnex("enquiry_distributions").where({ enquiry_id: enquiry.id }).delete();
      await masterKnex("enquiries").where({ id: enquiry.id }).delete();
      const ids = businesses.map((b) => b.id);
      await masterKnex("business_representations")
        .whereIn("originator_id", ids)
        .where("originator_type", "business")
        .delete();
      await masterKnex("user_business_index").whereIn("business_id", ids).delete();
      await masterKnex("businesses").whereIn("id", ids).delete();
      // Institutions before the job: enquiries reference them and representations target them.
      await masterKnex("institutions").where({ source_job_id: jobId }).delete();
      await masterKnex("superadmin.extraction_institution_overview").where({ job_id: jobId }).delete();
      await masterKnex("superadmin.extraction_courses").where({ job_id: jobId }).delete();
      await masterKnex("superadmin.extraction_jobs").where({ id: jobId }).delete();
      await masterKnex("platform_user_profiles").where({ user_id: studentId }).delete();
      await masterKnex("platform_users").where({ id: studentId }).delete();
    },
  };
}

async function main() {
  console.log("Distributions tests — unlock & close (DB integration)\n");

  await assert("unlock reveals contact, records paywall state, charges, and syncs the tenant row", async () => {
    const s = await scenario(1);
    const biz = s.businesses[0]!;
    try {
      const before = creditsService.getBalance();
      const result: any = await service.unlock(asBiz(biz.id),
        (await distributionFor(s.enquiry.id, biz.id)).id,
        s.studentId,
      );

      eq(result.status, "unlocked", "returned status");
      eq(result.already_unlocked, false, "not a repeat unlock");
      eq(result.coin_cost, creditsService.UNLOCK_COST, "charged the unlock cost");
      eq(result.student_first_name, "Unlock", "student first name revealed");
      eq(result.student_phone, "+61400000000", "student phone revealed");
      eq(creditsService.getBalance(), before - creditsService.UNLOCK_COST, "balance deducted");

      const row = await distributionFor(s.enquiry.id, biz.id);
      eq(row.status, "unlocked", "central status");
      eq(row.unlocked_at != null, true, "unlocked_at set");
      eq(row.unlocked_by, s.studentId, "unlocked_by recorded");
      eq(Number(row.coin_cost), creditsService.UNLOCK_COST, "coin_cost persisted");

      // Not 'unlocked': the unlock seeds the thread's greeting, and a thread with a
      // message in it is a conversation. The central row above stays on 'unlocked' —
      // that one tracks the platform's side, this one the business's workflow.
      eq(
        await tenantStatus(biz.id, biz.schemaUuid, s.enquiry.id),
        "in_conversation",
        "tenant row status after the greeting",
      );
    } finally {
      await s.cleanup();
    }
  });

  await assert("unlock is idempotent — a second call is not charged again", async () => {
    const s = await scenario(1);
    const biz = s.businesses[0]!;
    try {
      const distId = (await distributionFor(s.enquiry.id, biz.id)).id;
      await service.unlock(asBiz(biz.id), distId, s.studentId);
      const afterFirst = creditsService.getBalance();

      const second: any = await service.unlock(asBiz(biz.id), distId, s.studentId);
      eq(second.already_unlocked, true, "flagged as already unlocked");
      eq(second.student_email != null, true, "contact still returned");
      eq(creditsService.getBalance(), afterFirst, "balance unchanged on repeat");

      const enquiry = await masterKnex("enquiries").where({ id: s.enquiry.id }).first();
      eq(Number(enquiry.accept_count), 1, "accept_count incremented once, not twice");
    } finally {
      await s.cleanup();
    }
  });

  await assert("the max_accepts cap rejects the 4th business with NO deduction", async () => {
    const s = await scenario(4);
    try {
      const enquiry = await masterKnex("enquiries").where({ id: s.enquiry.id }).first();
      eq(Number(enquiry.max_accepts), 3, "cap is 3 by default");
      eq(s.businesses.length, 4, "four businesses received it");

      for (const biz of s.businesses.slice(0, 3)) {
        await service.unlock(asBiz(biz.id), (await distributionFor(s.enquiry.id, biz.id)).id, s.studentId);
      }

      const fourth = s.businesses[3]!;
      const balanceBefore = creditsService.getBalance();
      await rejectsWith(
        async () => service.unlock(asBiz(fourth.id), (await distributionFor(s.enquiry.id, fourth.id)).id, s.studentId),
        "ConflictError",
        "4th unlock",
      );
      eq(creditsService.getBalance(), balanceBefore, "NOT charged when the cap rejects");
      eq((await distributionFor(s.enquiry.id, fourth.id)).status, "distributed", "4th row untouched");
    } finally {
      await s.cleanup();
    }
  });

  await assert("insufficient credits returns 402 and leaves the distribution untouched", async () => {
    const s = await scenario(1);
    const biz = s.businesses[0]!;
    const restore = creditsService.getBalance();
    try {
      // One credit short of an unlock.
      creditsService.resetForTests(creditsService.UNLOCK_COST - 1);

      const err: any = await rejectsWith(
        async () => service.unlock(asBiz(biz.id), (await distributionFor(s.enquiry.id, biz.id)).id, s.studentId),
        "PaymentRequiredError",
        "unlock with no credits",
      );
      eq(err.statusCode, 402, "maps to HTTP 402");
      eq(creditsService.getBalance(), creditsService.UNLOCK_COST - 1, "balance unchanged");
      eq((await distributionFor(s.enquiry.id, biz.id)).status, "distributed", "still locked");
    } finally {
      creditsService.resetForTests(restore);
      await s.cleanup();
    }
  });

  await assert("a business cannot unlock or close another business's distribution", async () => {
    const s = await scenario(2);
    const [a, b] = s.businesses as [{ id: number }, { id: number }];
    try {
      const aDist = (await distributionFor(s.enquiry.id, a.id)).id;
      const balanceBefore = creditsService.getBalance();

      await rejectsWith(() => service.unlock(asBiz(b.id), aDist, s.studentId), "NotFoundError", "cross-business unlock");
      await rejectsWith(
        () => service.close(asBiz(b.id), aDist, "not mine", s.studentId),
        "NotFoundError",
        "cross-business close",
      );

      eq(creditsService.getBalance(), balanceBefore, "no charge for a foreign row");
      eq((await distributionFor(s.enquiry.id, a.id)).status, "distributed", "A's row untouched");
    } finally {
      await s.cleanup();
    }
  });

  await assert("listing shows a teaser and no contact until unlocked, then both in full", async () => {
    const s = await scenario(1);
    const biz = s.businesses[0]!;
    try {
      const [locked] = await listFor(biz.id, biz.schemaUuid);
      eq(locked!.is_unlocked, false, "starts locked");
      eq(locked!.message_truncated, true, "message is truncated");
      eq(locked!.message!.length < MESSAGE.length, true, "teaser shorter than the real message");
      eq(locked!.message!.endsWith("…"), true, "teaser is elided");
      eq(locked!.student_email, null, "no contact while locked");
      eq(locked!.student_name, null, "no name while locked");

      await service.unlock(asBiz(biz.id), (await distributionFor(s.enquiry.id, biz.id)).id, s.studentId);

      const [unlocked] = await listFor(biz.id, biz.schemaUuid);
      eq(unlocked!.is_unlocked, true, "now unlocked");
      eq(unlocked!.message_truncated, false, "no longer truncated");
      eq(unlocked!.message, MESSAGE, "full message");
      eq(unlocked!.student_name, "Unlock Student", "name revealed");
      eq(unlocked!.student_phone, "+61400000000", "phone revealed");
      eq(unlocked!.coin_cost, creditsService.UNLOCK_COST, "cost surfaced in the list");
    } finally {
      await s.cleanup();
    }
  });

  await assert("close writes reason/closed_at on enquiry_distributions, NOT on enquiries", async () => {
    const s = await scenario(1);
    const biz = s.businesses[0]!;
    try {
      const result: any = await service.close(asBiz(biz.id),
        (await distributionFor(s.enquiry.id, biz.id)).id,
        "Student is outside the regions we service.",
        s.studentId,
      );
      eq(result.status, "closed", "returned status");

      const row = await distributionFor(s.enquiry.id, biz.id);
      eq(row.status, "closed", "distribution status");
      eq(row.close_reason, "Student is outside the regions we service.", "reason on the distribution");
      eq(row.closed_at != null, true, "closed_at on the distribution");

      const enquiry = await masterKnex("enquiries").where({ id: s.enquiry.id }).first();
      eq(enquiry.close_reason, null, "parent enquiry close_reason untouched");
      eq(enquiry.closed_at, null, "parent enquiry closed_at untouched");

      eq(await tenantStatus(biz.id, biz.schemaUuid, s.enquiry.id), "closed", "tenant row status");
    } finally {
      await s.cleanup();
    }
  });

  await assert("two businesses close the same enquiry with different reasons, independently", async () => {
    const s = await scenario(2);
    const [a, b] = s.businesses as [{ id: number }, { id: number }];
    try {
      await service.close(asBiz(a.id), (await distributionFor(s.enquiry.id, a.id)).id, "Out of our catchment area.", s.studentId);
      await service.close(asBiz(b.id), (await distributionFor(s.enquiry.id, b.id)).id, "No capacity for this intake.", s.studentId);

      eq((await distributionFor(s.enquiry.id, a.id)).close_reason, "Out of our catchment area.", "A's reason");
      eq((await distributionFor(s.enquiry.id, b.id)).close_reason, "No capacity for this intake.", "B's reason");
    } finally {
      await s.cleanup();
    }
  });

  await assert("close without unlocking works; unlocking a closed row is a conflict", async () => {
    const s = await scenario(1);
    const biz = s.businesses[0]!;
    try {
      const distId = (await distributionFor(s.enquiry.id, biz.id)).id;
      await service.close(asBiz(biz.id), distId, "Not a fit for us.", s.studentId);

      eq((await distributionFor(s.enquiry.id, biz.id)).unlocked_at, null, "closed without ever unlocking");

      const balanceBefore = creditsService.getBalance();
      await rejectsWith(() => service.unlock(asBiz(biz.id), distId, s.studentId), "ConflictError", "unlock after close");
      eq(creditsService.getBalance(), balanceBefore, "no charge for unlocking a closed row");

      await rejectsWith(() => service.close(asBiz(biz.id), distId, "again", s.studentId), "ConflictError", "double close");
    } finally {
      await s.cleanup();
    }
  });

  await assert("a tenant row whose central distribution was deleted is not listed", async () => {
    // Reproduces the reported 404: the tenant table keeps enquiry_id/distribution_id
    // as plain uuids (no cross-schema FK is possible), so a row can outlive the
    // central distribution. It used to render as a normal actionable card and then
    // 404 on unlock because there was no central row to lock.
    const s = await scenario(1);
    const biz = s.businesses[0]!;
    try {
      eq((await listFor(biz.id, biz.schemaUuid)).length, 1, "listed while the central row exists");

      const distId = (await distributionFor(s.enquiry.id, biz.id)).id;
      await masterKnex("enquiry_distributions").where({ id: distId }).delete();

      const db = await getKnex(biz.id, schemaName(biz.schemaUuid));
      eq(Number((await db("business_enquiries").count("id as c").first())!.c), 1, "tenant row still there");

      eq((await listFor(biz.id, biz.schemaUuid)).length, 0, "orphan is skipped, not rendered");
      await rejectsWith(() => service.unlock(asBiz(biz.id), distId, s.studentId), "NotFoundError", "unlock the orphan");
    } finally {
      await s.cleanup();
    }
  });

  await assert("a blank close reason is rejected", async () => {
    const s = await scenario(1);
    const biz = s.businesses[0]!;
    try {
      const distId = (await distributionFor(s.enquiry.id, biz.id)).id;
      await rejectsWith(() => service.close(asBiz(biz.id), distId, "   ", s.studentId), "BadRequestError", "whitespace reason");
      eq((await distributionFor(s.enquiry.id, biz.id)).status, "distributed", "row untouched");
    } finally {
      await s.cleanup();
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  await masterKnex.destroy();
  process.exit(failed > 0 ? 1 : 0);
}

main();
