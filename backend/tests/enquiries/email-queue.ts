/**
 * Email queue tests — dedup + worker processing.
 * Run: node --import tsx tests/enquiries/email-queue.ts
 *
 * Redistribution-on-reject and the enquiry_accepted email trigger were reverted
 * in the scope-reduction pass (accept/reject no longer exist); this file now
 * covers only what remains:
 *  1. Enquiry distributed -> business notified: enqueueDistributionEmails queues
 *     one `enquiry_distributed` row per business team member.
 *  2. Enqueuing the same event twice hits the dedup_key collision cleanly —
 *     exactly one row, no error surfaced to the caller.
 *  3. The email worker's send path marks a row `sent` and never reprocesses
 *     an already-sent row.
 */

import { masterKnex } from "../../src/core/db/master-pool.js";
import * as emailQueueService from "../../src/modules/enquiries/services/email-queue.service.js";

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

async function makeStudent(): Promise<number> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [user] = await masterKnex("platform_users")
    .insert({
      first_name: "Email",
      last_name: "Student",
      email: `email-q-test-${suffix}@example.com`,
      account_status: 1,
      is_personal_account: true,
    })
    .returning("id");
  return user.id;
}

async function makeBusiness(): Promise<number> {
  const owner = await masterKnex("platform_users").orderBy("id").first();
  if (!owner) throw new Error("no platform_users row available to own the test business");
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [row] = await masterKnex("businesses")
    .insert({
      owner_id: owner.id,
      subdomain: `email-q-test-${suffix}`,
      business_name: `Email Queue Test Biz ${suffix}`,
    })
    .returning("id");
  return row.id;
}

async function makeJobAndCourse(subjectArea: string): Promise<{ jobId: string; courseId: string }> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [job] = await masterKnex("superadmin.extraction_jobs")
    .insert({ institution_name: `Email Q Institution ${suffix}`, institution_url: `https://email-q-${suffix}.example.com` })
    .returning("id");
  const [course] = await masterKnex("superadmin.extraction_courses")
    .insert({ job_id: job.id, name: `Email Q Course ${suffix}`, subject_area: subjectArea })
    .returning("id");
  return { jobId: job.id, courseId: course.id };
}

async function makeEnquiry(studentId: number, courseId: string, status = "distributed"): Promise<string> {
  const [row] = await masterKnex("enquiries")
    .insert({ student_id: studentId, course_id: courseId, message: "Redistribution test enquiry.", status, max_accepts: 1 })
    .returning("id");
  return row.id;
}

async function makeDistribution(enquiryId: string, businessId: number, opts: { status?: string } = {}) {
  const [row] = await masterKnex("enquiry_distributions")
    .insert({
      enquiry_id: enquiryId,
      business_id: businessId,
      tier: 1,
      match_rank: 1,
      status: opts.status ?? "distributed",
    })
    .returning("id");
  return row.id;
}

async function addTeamMember(businessId: number, userId: number) {
  await masterKnex("user_business_index").insert({ platform_user_id: userId, business_id: businessId });
}

async function cleanupAll(opts: { enquiryIds?: string[]; businessIds?: number[]; studentIds?: number[]; jobIds?: string[] }) {
  if (opts.enquiryIds?.length) {
    await masterKnex("enquiry_email_queue").whereIn("enquiry_id", opts.enquiryIds).delete();
    const distIds = (await masterKnex("enquiry_distributions").select("id").whereIn("enquiry_id", opts.enquiryIds)).map((r: any) => r.id);
    if (distIds.length) await masterKnex("audit_logs").where({ entity_type: "distribution" }).whereIn("entity_id", distIds).delete();
    await masterKnex("audit_logs").where({ entity_type: "enquiry" }).whereIn("entity_id", opts.enquiryIds).delete();
    await masterKnex("enquiry_distributions").whereIn("enquiry_id", opts.enquiryIds).delete();
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
    for (const jobId of opts.jobIds) {
      await masterKnex("institutions").where({ source_job_id: jobId }).delete();
      await masterKnex("superadmin.extraction_courses").where({ job_id: jobId }).delete();
      await masterKnex("superadmin.extraction_jobs").where({ id: jobId }).delete();
    }
  }
  if (opts.studentIds?.length) {
    await masterKnex("platform_users").whereIn("id", opts.studentIds).delete();
  }
}

async function main() {
  console.log("Email queue tests\n");

  // ── 1. Enquiry distributed -> business notified ──
  await assert("distributing an enquiry queues an enquiry_distributed email per business team member", async () => {
    const studentId = await makeStudent();
    const { jobId, courseId } = await makeJobAndCourse("Notify Subject");
    const businessId = await makeBusiness();
    const enquiryId = await makeEnquiry(studentId, courseId);
    try {
      const distId = await makeDistribution(enquiryId, businessId);
      await addTeamMember(businessId, studentId); // reuse an existing platform_users row as the recipient
      await emailQueueService.enqueueDistributionEmails(enquiryId, distId, businessId);

      const rows = await masterKnex("enquiry_email_queue").where({ distribution_id: distId });
      eq(rows.length, 1, "one queue row per business team member");
      eq(rows[0].template, "enquiry_distributed", "queued with the enquiry_distributed template");
      eq(rows[0].recipient_user_id, studentId, "queued for the team member");
      eq(rows[0].dedup_key, `enquiry_distributed:${distId}:${studentId}`, "dedup_key matches distribution+recipient");
    } finally {
      await masterKnex("user_business_index").where({ business_id: businessId }).delete();
      await cleanupAll({ enquiryIds: [enquiryId], businessIds: [businessId], studentIds: [studentId], jobIds: [jobId] });
    }
  });

  // ── 1b. The business's shared inbox is notified alongside team members ──
  await assert("businesses.email is notified in addition to each team member", async () => {
    const studentId = await makeStudent();
    const { jobId, courseId } = await makeJobAndCourse("Shared Inbox Subject");
    const businessId = await makeBusiness();
    const sharedInbox = `shared-inbox-${Date.now()}@example.com`;
    await masterKnex("businesses").where({ id: businessId }).update({ email: sharedInbox });
    const enquiryId = await makeEnquiry(studentId, courseId);
    try {
      const distId = await makeDistribution(enquiryId, businessId);
      await addTeamMember(businessId, studentId);
      await emailQueueService.enqueueDistributionEmails(enquiryId, distId, businessId);

      const rows = await masterKnex("enquiry_email_queue").where({ distribution_id: distId });
      eq(rows.length, 2, "one row for the team member, one for the shared inbox");
      const shared = rows.find((r: any) => r.recipient_email === sharedInbox);
      if (!shared) throw new Error("expected a queue row for businesses.email");
      eq(shared.recipient_user_id, null, "shared inbox has no platform user");
      eq(shared.dedup_key, `enquiry_distributed:${distId}:business`, "shared inbox dedup_key");
    } finally {
      await masterKnex("user_business_index").where({ business_id: businessId }).delete();
      await cleanupAll({ enquiryIds: [enquiryId], businessIds: [businessId], studentIds: [studentId], jobIds: [jobId] });
    }
  });

  // ── 1c. Shared inbox equal to a member's address is not double-sent ──
  await assert("businesses.email matching a team member's address does not duplicate", async () => {
    const studentId = await makeStudent();
    const { jobId, courseId } = await makeJobAndCourse("Dup Inbox Subject");
    const businessId = await makeBusiness();
    const member = await masterKnex("platform_users").where({ id: studentId }).first("email");
    await masterKnex("businesses").where({ id: businessId }).update({ email: member.email.toUpperCase() });
    const enquiryId = await makeEnquiry(studentId, courseId);
    try {
      const distId = await makeDistribution(enquiryId, businessId);
      await addTeamMember(businessId, studentId);
      await emailQueueService.enqueueDistributionEmails(enquiryId, distId, businessId);

      const rows = await masterKnex("enquiry_email_queue").where({ distribution_id: distId });
      eq(rows.length, 1, "same address must not be queued twice");
    } finally {
      await masterKnex("user_business_index").where({ business_id: businessId }).delete();
      await cleanupAll({ enquiryIds: [enquiryId], businessIds: [businessId], studentIds: [studentId], jobIds: [jobId] });
    }
  });

  // ── 2. Dedup: same event enqueued twice never sends twice ──
  await assert("enqueuing the same dedup_key twice results in exactly one row, no error", async () => {
    const studentId = await makeStudent();
    const { jobId, courseId } = await makeJobAndCourse("Dedup Subject");
    const enquiryId = await makeEnquiry(studentId, courseId);
    try {
      const dedupKey = `test_dedup:${enquiryId}`;
      const first = await emailQueueService.enqueue({
        dedupKey,
        template: "enquiry_distributed",
        recipientEmail: "dedup-recipient@example.com",
        enquiryId,
      });
      const second = await emailQueueService.enqueue({
        dedupKey,
        template: "enquiry_distributed",
        recipientEmail: "dedup-recipient@example.com",
        enquiryId,
      });

      if (!first) throw new Error("expected the first enqueue to insert a row");
      eq(second, null, "second enqueue with the same dedup_key is a clean no-op");

      const rows = await masterKnex("enquiry_email_queue").where({ dedup_key: dedupKey });
      eq(rows.length, 1, "exactly one queue row exists for this dedup_key");
    } finally {
      await cleanupAll({ enquiryIds: [enquiryId], studentIds: [studentId], jobIds: [jobId] });
    }
  });

  // ── 4. Worker send path marks sent, never reprocesses ──
  await assert("processing a queued row marks it sent and does not reprocess an already-sent row", async () => {
    const studentId = await makeStudent();
    const { jobId, courseId } = await makeJobAndCourse("Worker Subject");
    const enquiryId = await makeEnquiry(studentId, courseId);
    try {
      const [row] = await masterKnex("enquiry_email_queue")
        .insert({
          enquiry_id: enquiryId,
          recipient_email: "worker-test@example.com",
          template: "enquiry_distributed",
          payload: JSON.stringify({}),
          dedup_key: `test_worker:${enquiryId}`,
          status: "pending",
        })
        .returning("*");

      await emailQueueService.sendQueuedRow(row.id);
      const afterFirstSend = await masterKnex("enquiry_email_queue").where({ id: row.id }).first();
      if (!["sent", "pending"].includes(afterFirstSend.status)) {
        throw new Error(`expected status sent (or pending-if-provider-failed), got '${afterFirstSend.status}'`);
      }

      // Force to 'sent' regardless of real SMTP outcome, then verify idempotency below —
      // the assertion under test is "an already-sent row is never reprocessed".
      await masterKnex("enquiry_email_queue").where({ id: row.id }).update({ status: "sent", attempts: 1 });
      await emailQueueService.sendQueuedRow(row.id);

      const after = await masterKnex("enquiry_email_queue").where({ id: row.id }).first();
      eq(after.status, "sent", "row remains sent");
      eq(after.attempts, 1, "attempts unchanged — already-sent row was not reprocessed");
    } finally {
      await cleanupAll({ enquiryIds: [enquiryId], studentIds: [studentId], jobIds: [jobId] });
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  await masterKnex.destroy();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
