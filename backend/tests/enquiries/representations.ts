/**
 * Representations + match-directory sync test — exercises representations.service
 * and match-directory-sync.service against the real dev DB.
 * Run: node --import tsx tests/enquiries/representations.ts
 *
 * Covers:
 *  1. Creating a representation succeeds and syncs a matching enquiry_match_directory row.
 *  2. Duplicate active representation (same business/job/course) is rejected with
 *     DuplicateRepresentationError, not a raw DB constraint error.
 *  3. Deactivating a representation resyncs the directory: the row for a business's only
 *     representation is removed (see rationale below), matching the PRD's description of
 *     enquiry_match_directory as a routing index for *active* eligibility only — a business
 *     with no active representations must not appear as a matchable target.
 */

import { masterKnex } from "../../src/core/db/master-pool.js";
import * as representationsService from "../../src/modules/enquiries/services/representations.service.js";
import { DuplicateRepresentationError } from "../../src/modules/enquiries/services/representations.service.js";
import * as matchDirectorySync from "../../src/modules/enquiries/services/match-directory-sync.service.js";

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

async function makeTestBusiness(opts: { verificationStatus?: "verified" | "unverified" } = {}): Promise<number> {
  const owner = await masterKnex("platform_users").orderBy("id").first();
  if (!owner) throw new Error("no platform_users row available to own the test business");
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [row] = await masterKnex("businesses")
    .insert({
      owner_id: owner.id,
      subdomain: `repr-test-${suffix}`,
      business_name: `Representation Test Biz ${suffix}`,
      ...(opts.verificationStatus ? { verification_status: opts.verificationStatus } : {}),
    })
    .returning("id");
  return row.id;
}

async function makeTestJobAndCourse(): Promise<{ jobId: string; courseId: string }> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [job] = await masterKnex("superadmin.extraction_jobs")
    .insert({
      institution_name: `Test Institution ${suffix}`,
      institution_url: `https://test-institution-${suffix}.example.com`,
    })
    .returning("id");
  const [course] = await masterKnex("superadmin.extraction_courses")
    .insert({
      job_id: job.id,
      name: `Test Course ${suffix}`,
      subject_area: "Computer Science",
      country_code: "AU",
    })
    .returning("id");
  return { jobId: job.id, courseId: course.id };
}

async function cleanup(businessId: number, jobId: string) {
  const repIds: string[] = (await masterKnex("representations").select("id").where({ business_id: businessId })).map(
    (r: any) => r.id,
  );
  if (repIds.length > 0) {
    await masterKnex("audit_logs").where({ entity_type: "representation" }).whereIn("entity_id", repIds).delete();
  }
  await masterKnex("enquiry_match_directory").where({ business_id: businessId }).delete();
  await masterKnex("representations").where({ business_id: businessId }).delete();
  await masterKnex("businesses").where({ id: businessId }).delete();
  await masterKnex("superadmin.extraction_jobs").where({ id: jobId }).delete(); // cascades to course
}

async function main() {
  console.log("Representations + match-directory sync tests\n");

  // ── 1. Create succeeds, syncs directory row ──
  await assert("creating a representation syncs a matching enquiry_match_directory row", async () => {
    const businessId = await makeTestBusiness();
    const { jobId, courseId } = await makeTestJobAndCourse();
    try {
      const rep = await representationsService.createRepresentation({
        businessId,
        extractionJobId: jobId,
        extractionCourseId: courseId,
      });
      eq(rep.status, "active", "representation status");

      const dirRows = await masterKnex("enquiry_match_directory").where({ business_id: businessId });
      eq(dirRows.length, 1, "directory row count");
      eq(dirRows[0].subject_area, "Computer Science", "directory subject_area");
      eq(dirRows[0].country_code, "AU", "directory country_code");
      eq(dirRows[0].verification_status, "unverified", "directory verification_status default");
      eq(dirRows[0].is_suspended, false, "directory is_suspended");

      // Phase 9 gap-fill: creation must write one representation.created audit row.
      const auditRows = await masterKnex("audit_logs").where({ action: "representation.created", entity_id: rep.id });
      eq(auditRows.length, 1, "one representation.created audit row");
      eq(auditRows[0].entity_type, "representation", "representation.created entity_type");
      eq(auditRows[0].details.business_id, businessId, "representation.created details.business_id");
    } finally {
      await cleanup(businessId, jobId);
    }
  });

  // ── 2. Duplicate active representation rejected cleanly ──
  await assert("duplicate active representation is rejected with DuplicateRepresentationError", async () => {
    const businessId = await makeTestBusiness();
    const { jobId, courseId } = await makeTestJobAndCourse();
    try {
      await representationsService.createRepresentation({
        businessId,
        extractionJobId: jobId,
        extractionCourseId: courseId,
      });

      let threw = false;
      try {
        await representationsService.createRepresentation({
          businessId,
          extractionJobId: jobId,
          extractionCourseId: courseId,
        });
      } catch (err) {
        threw = err instanceof DuplicateRepresentationError;
        if (!threw) throw err; // leak: not the clean error we expect
      }
      if (!threw) throw new Error("expected DuplicateRepresentationError to be thrown");

      const reps = await masterKnex("representations").where({ business_id: businessId });
      eq(reps.length, 1, "no duplicate row inserted");
    } finally {
      await cleanup(businessId, jobId);
    }
  });

  // ── 3. Deactivate resyncs directory (row removed) ──
  await assert("deactivating a business's only representation removes its match-directory row", async () => {
    const businessId = await makeTestBusiness();
    const { jobId, courseId } = await makeTestJobAndCourse();
    try {
      const rep = await representationsService.createRepresentation({
        businessId,
        extractionJobId: jobId,
        extractionCourseId: courseId,
      });

      let dirRows = await masterKnex("enquiry_match_directory").where({ business_id: businessId });
      eq(dirRows.length, 1, "directory row exists before deactivation");

      const updated = await representationsService.deactivateRepresentation(rep.id);
      eq(updated?.status, "inactive", "representation status after deactivation");

      dirRows = await masterKnex("enquiry_match_directory").where({ business_id: businessId });
      eq(dirRows.length, 0, "directory row removed after deactivation");

      // Phase 9 gap-fill: deactivation must write one representation.suspended audit row.
      const auditRows = await masterKnex("audit_logs").where({ action: "representation.suspended", entity_id: rep.id });
      eq(auditRows.length, 1, "one representation.suspended audit row");
      eq(auditRows[0].details.old_status, "active", "representation.suspended details.old_status");
      eq(auditRows[0].details.new_status, "inactive", "representation.suspended details.new_status");
    } finally {
      await cleanup(businessId, jobId);
    }
  });

  // ── 4. verification_status is read from businesses, not hardcoded ──
  await assert("a verified business syncs a verified match-directory row", async () => {
    const businessId = await makeTestBusiness({ verificationStatus: "verified" });
    const { jobId, courseId } = await makeTestJobAndCourse();
    try {
      await representationsService.createRepresentation({ businessId, extractionJobId: jobId, extractionCourseId: courseId });
      const dirRows = await masterKnex("enquiry_match_directory").where({ business_id: businessId });
      eq(dirRows.length, 1, "directory row count");
      eq(dirRows[0].verification_status, "verified", "directory verification_status reflects business.verification_status");
    } finally {
      await cleanup(businessId, jobId);
    }
  });

  await assert("an unverified (default) business syncs an unverified match-directory row", async () => {
    const businessId = await makeTestBusiness();
    const { jobId, courseId } = await makeTestJobAndCourse();
    try {
      await representationsService.createRepresentation({ businessId, extractionJobId: jobId, extractionCourseId: courseId });
      const dirRows = await masterKnex("enquiry_match_directory").where({ business_id: businessId });
      eq(dirRows[0].verification_status, "unverified", "directory verification_status default");
    } finally {
      await cleanup(businessId, jobId);
    }
  });

  // ── Sole-representer rule drives is_institution_contact ──
  await assert("the only active representer of an institution is flagged as its contact", async () => {
    const businessId = await makeTestBusiness();
    const { jobId, courseId } = await makeTestJobAndCourse();
    try {
      await representationsService.createRepresentation({ businessId, extractionJobId: jobId, extractionCourseId: courseId });
      const dirRows = await masterKnex("enquiry_match_directory").where({ business_id: businessId });
      eq(dirRows[0].is_institution_contact, true, "sole representer is the institution contact");
    } finally {
      await cleanup(businessId, jobId);
    }
  });

  await assert("a second representer clears the institution-contact flag on resync", async () => {
    const businessA = await makeTestBusiness();
    const businessB = await makeTestBusiness();
    const { jobId, courseId } = await makeTestJobAndCourse();
    try {
      await representationsService.createRepresentation({ businessId: businessA, extractionJobId: jobId, extractionCourseId: courseId });
      // B now also represents the institution, so neither is its sole contact.
      await representationsService.createRepresentation({ businessId: businessB, extractionJobId: jobId, extractionCourseId: courseId });

      const bRows = await masterKnex("enquiry_match_directory").where({ business_id: businessB });
      eq(bRows[0].is_institution_contact, false, "second representer is not the sole contact");

      // A's row is stale until its own sync runs — resync it and confirm it flips.
      await matchDirectorySync.syncForBusiness(businessA);
      const aRows = await masterKnex("enquiry_match_directory").where({ business_id: businessA });
      eq(aRows[0].is_institution_contact, false, "first representer loses the flag once a second exists");
    } finally {
      await cleanup(businessA, jobId);
      await masterKnex("representations").where({ business_id: businessB }).delete();
      await masterKnex("enquiry_match_directory").where({ business_id: businessB }).delete();
      await masterKnex("businesses").where({ id: businessB }).delete();
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  await masterKnex.destroy();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await masterKnex.destroy();
  process.exit(1);
});
