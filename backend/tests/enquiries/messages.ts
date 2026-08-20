/**
 * Enquiry chat tests — the student↔business thread that unlocking pays for.
 * Run: node --import tsx tests/enquiries/messages.ts
 *
 * Exercises messages.service directly, same rationale as the sibling suites: the routes
 * are thin wrappers that parse params and pass req.auth.sub / req.businessId straight
 * through.
 *
 * The fixture harness is duplicated from distributions.ts rather than imported —
 * that file calls main() at module scope, so importing it would run its suite too.
 *
 * Covers:
 *  1. locked thread is unreadable and unwritable from BOTH sides
 *  2. after unlock both parties send, both see the whole thread in order
 *  3. is_mine flips per viewer for the same message; sender_role is derived correctly
 *  4. a second business on the same enquiry cannot see the first's thread
 *  5. a different student cannot see the thread
 *  6. closed: history readable, sending rejected
 *  7. blank / whitespace-only bodies rejected
 *  8. the inbox lists only unlocked threads, newest activity first
 *  9. unlocking seeds the thread with the business's greeting
 */

import { masterKnex } from "../../src/core/db/master-pool.js";
import { provisionBusinessSchema } from "../../src/core/business/provisioner.js";
import { runMatching } from "../../src/modules/enquiries/services/matching.service.js";
import * as distributions from "../../src/modules/enquiries/services/distributions.service.js";
import * as messages from "../../src/modules/enquiries/services/messages.service.js";
import { UNLOCK_GREETING } from "../../src/modules/enquiries/services/messages.service.js";

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

async function rejectsWith(fn: () => Promise<unknown>, errorName: string, label = "") {
  try {
    await fn();
  } catch (err: any) {
    eq(err.constructor.name, errorName, `${label} error type`);
    return err;
  }
  throw new Error(`${label}: expected ${errorName}, but it resolved`);
}

async function getCountryId(iso2: string): Promise<number> {
  const row = await masterKnex("countries").where({ iso2 }).first("id");
  if (row) return row.id;
  const [inserted] = await masterKnex("countries")
    .insert({ name: `Test-${iso2}-${Date.now()}`, iso2, iso3: `${iso2}X`, is_active: true })
    .returning("id");
  return inserted.id;
}

async function makeStudent(countryId: number, label: string): Promise<number> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [user] = await masterKnex("platform_users")
    .insert({
      first_name: label,
      last_name: "Student",
      email: `msg-test-${suffix}@example.com`,
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

/** An agent who will send on the business's behalf — chat senders are platform users. */
async function makeAgentUser(): Promise<number> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [user] = await masterKnex("platform_users")
    .insert({
      first_name: "Agent",
      last_name: "Smith",
      email: `msg-agent-${suffix}@example.com`,
      account_status: 1,
      is_business_account: true,
    })
    .returning("id");
  return user.id;
}

async function makeJobAndCourse(subject: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [job] = await masterKnex("superadmin.extraction_jobs")
    .insert({ institution_name: `Msg Institution ${suffix}`, institution_url: `https://msg-${suffix}.example.com` })
    .returning("id");
  const [course] = await masterKnex("superadmin.extraction_courses")
    .insert({ job_id: job.id, name: `Msg Course ${suffix}`, subject_area: subject })
    .returning("id");
  await masterKnex("superadmin.extraction_institution_overview").insert({
    job_id: job.id,
    name: `Msg Institution ${suffix}`,
  });
  return { jobId: job.id, courseId: course.id };
}

async function makeRecipient(jobId: string, courseId: string, subject: string, offsetDeg = 0) {
  const owner = await masterKnex("platform_users").orderBy("id").first();
  if (!owner) throw new Error("no platform_users row available to own the test business");
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [row] = await masterKnex("businesses")
    .insert({
      owner_id: owner.id,
      subdomain: `msg-test-${suffix}`,
      business_name: `Msg Test Biz ${suffix}`,
      account_status: 1,
    })
    .returning(["id", "schema_name"]);
  await provisionBusinessSchema(row.schema_name);
  await masterKnex("representations").insert({
    business_id: row.id,
    extraction_job_id: jobId,
    extraction_course_id: courseId,
    status: "active",
  });
  await masterKnex("enquiry_match_directory").insert({
    business_id: row.id,
    subject_area: subject,
    country_code: "AU",
    verification_status: "verified",
    latitude: -33.87 - offsetDeg,
    longitude: 151.21,
    is_institution_contact: false,
    is_suspended: false,
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

async function scenario(businessCount: number) {
  const countryId = await getCountryId("AU");
  const studentId = await makeStudent(countryId, "Msg");
  const agentId = await makeAgentUser();
  const subject = `Msg Subject ${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const { jobId, courseId } = await makeJobAndCourse(subject);

  const businesses: Array<{ id: number; schemaUuid: string }> = [];
  for (let i = 0; i < businessCount; i++) {
    businesses.push(await makeRecipient(jobId, courseId, subject, i * 0.01));
  }

  const [enquiry] = await masterKnex("enquiries")
    .insert({
      student_id: studentId,
      course_id: courseId,
      extraction_job_id: jobId,
      message: "I would like more information about this course and its intakes.",
      student_latitude: -33.8688,
      student_longitude: 151.2093,
      status: "pending",
    })
    .returning("*");

  await runMatching(enquiry.id);

  return {
    studentId,
    agentId,
    enquiry,
    businesses,
    /** distribution id for the Nth business */
    dist: async (n: number) => (await distributionFor(enquiry.id, businesses[n]!.id)).id,
    unlock: async (n: number) =>
      distributions.unlock(businesses[n]!.id, (await distributionFor(enquiry.id, businesses[n]!.id)).id, agentId),
    cleanup: async () => {
      const distIds = (
        await masterKnex("enquiry_distributions").where({ enquiry_id: enquiry.id }).select("id")
      ).map((r) => r.id);
      if (distIds.length) {
        await masterKnex("enquiry_messages").whereIn("distribution_id", distIds).delete();
        await masterKnex("audit_logs").whereIn("entity_id", distIds).delete();
      }
      await masterKnex("audit_logs").where({ entity_id: enquiry.id }).delete();
      await masterKnex("enquiry_email_queue").where({ enquiry_id: enquiry.id }).delete();
      await masterKnex("enquiry_distributions").where({ enquiry_id: enquiry.id }).delete();
      await masterKnex("enquiries").where({ id: enquiry.id }).delete();
      const ids = businesses.map((b) => b.id);
      await masterKnex("enquiry_match_directory").whereIn("business_id", ids).delete();
      await masterKnex("representations").whereIn("business_id", ids).delete();
      await masterKnex("user_business_index").whereIn("business_id", ids).delete();
      await masterKnex("businesses").whereIn("id", ids).delete();
      await masterKnex("superadmin.extraction_institution_overview").where({ job_id: jobId }).delete();
      await masterKnex("superadmin.extraction_courses").where({ job_id: jobId }).delete();
      await masterKnex("superadmin.extraction_jobs").where({ id: jobId }).delete();
      await masterKnex("platform_user_profiles").where({ user_id: studentId }).delete();
      await masterKnex("platform_users").whereIn("id", [studentId, agentId]).delete();
    },
  };
}

async function main() {
  console.log("Enquiry chat tests (DB integration)\n");

  await assert("a locked thread is unreadable and unwritable from both sides", async () => {
    const s = await scenario(1);
    const biz = s.businesses[0]!;
    try {
      const distId = await s.dist(0);
      // The paywall is the point: no channel to the student before paying.
      await rejectsWith(() => messages.listForStudent(distId, s.studentId), "ConflictError", "student read");
      await rejectsWith(
        () => messages.sendAsStudent(distId, s.studentId, "hello?"),
        "ConflictError",
        "student send",
      );
      await rejectsWith(
        () => messages.listForBusiness(distId, biz.id, s.agentId),
        "ConflictError",
        "business read",
      );
      await rejectsWith(
        () => messages.sendAsBusiness(distId, biz.id, s.agentId, "hi there"),
        "ConflictError",
        "business send",
      );
      eq(Number((await masterKnex("enquiry_messages").count("id as c").first())!.c) >= 0, true, "table reachable");
    } finally {
      await s.cleanup();
    }
  });

  await assert("after unlock both sides send and both see the full thread in order", async () => {
    const s = await scenario(1);
    const biz = s.businesses[0]!;
    try {
      await s.unlock(0);
      const distId = await s.dist(0);

      // Unlocking already posted the greeting, so the thread is never empty.
      eq((await messages.listForStudent(distId, s.studentId)).length, 1, "opens with the greeting");

      await messages.sendAsBusiness(distId, biz.id, s.agentId, "Hi! Happy to help with this course.");
      await messages.sendAsStudent(distId, s.studentId, "Great — what are the fees?");
      await messages.sendAsBusiness(distId, biz.id, s.agentId, "About AUD 40k per year.");

      const studentView = await messages.listForStudent(distId, s.studentId);
      eq(studentView.length, 4, "student sees the greeting plus all three");
      eq(studentView.map((m) => m.body)[2], "Great — what are the fees?", "chronological order");

      const businessView = await messages.listForBusiness(distId, biz.id, s.agentId);
      eq(businessView.length, 4, "business sees the same four");
      eq(
        businessView.map((m) => m.id).join(","),
        studentView.map((m) => m.id).join(","),
        "identical thread, same order",
      );
    } finally {
      await s.cleanup();
    }
  });

  await assert("is_mine flips per viewer; sender_role is derived from the enquiry owner", async () => {
    const s = await scenario(1);
    const biz = s.businesses[0]!;
    try {
      await s.unlock(0);
      const distId = await s.dist(0);
      await messages.sendAsStudent(distId, s.studentId, "From the student.");
      await messages.sendAsBusiness(distId, biz.id, s.agentId, "From the business.");

      // Index 0 is the unlock greeting; the two sent above follow it.
      const studentView = await messages.listForStudent(distId, s.studentId);
      eq(studentView[1]!.is_mine, true, "student's own message is mine to them");
      eq(studentView[2]!.is_mine, false, "business message is not mine to them");
      eq(studentView[1]!.sender_role, "student", "role of the first");
      eq(studentView[2]!.sender_role, "business", "role of the second");

      const businessView = await messages.listForBusiness(distId, biz.id, s.agentId);
      eq(businessView[1]!.is_mine, false, "same message, not mine to the business");
      eq(businessView[2]!.is_mine, true, "its own message is mine to the business");
      // Roles describe the sender, so they do NOT depend on who is looking.
      eq(businessView[1]!.sender_role, "student", "role is viewer-independent");
      eq(businessView[2]!.sender_role, "business", "role is viewer-independent");
    } finally {
      await s.cleanup();
    }
  });

  await assert("a second business on the same enquiry cannot see the first's thread", async () => {
    const s = await scenario(2);
    const [a, b] = s.businesses as [{ id: number }, { id: number }];
    try {
      await s.unlock(0);
      await s.unlock(1);
      const distA = await s.dist(0);
      await messages.sendAsBusiness(distA, a.id, s.agentId, "Private to A and the student.");

      // 404 not 403 — B must not learn that A's thread exists.
      await rejectsWith(
        () => messages.listForBusiness(distA, b.id, s.agentId),
        "NotFoundError",
        "cross-business read",
      );
      await rejectsWith(
        () => messages.sendAsBusiness(distA, b.id, s.agentId, "butting in"),
        "NotFoundError",
        "cross-business send",
      );

      eq(
        (await messages.listForBusiness(await s.dist(1), b.id, s.agentId)).length,
        1,
        "B sees only its own greeting",
      );
    } finally {
      await s.cleanup();
    }
  });

  await assert("a different student cannot see the thread", async () => {
    const s = await scenario(1);
    const biz = s.businesses[0]!;
    const outsiderId = await makeStudent(await getCountryId("AU"), "Outsider");
    try {
      await s.unlock(0);
      const distId = await s.dist(0);
      await messages.sendAsBusiness(distId, biz.id, s.agentId, "For the real student only.");

      await rejectsWith(() => messages.listForStudent(distId, outsiderId), "NotFoundError", "outsider read");
      await rejectsWith(
        () => messages.sendAsStudent(distId, outsiderId, "hello"),
        "NotFoundError",
        "outsider send",
      );
    } finally {
      await masterKnex("platform_user_profiles").where({ user_id: outsiderId }).delete();
      await masterKnex("platform_users").where({ id: outsiderId }).delete();
      await s.cleanup();
    }
  });

  await assert("closed: history stays readable, sending is rejected for both sides", async () => {
    const s = await scenario(1);
    const biz = s.businesses[0]!;
    try {
      await s.unlock(0);
      const distId = await s.dist(0);
      await messages.sendAsBusiness(distId, biz.id, s.agentId, "Before closing.");

      await distributions.close(biz.id, distId, "Student went elsewhere.", s.agentId);

      eq((await messages.listForStudent(distId, s.studentId)).length, 2, "student still reads history");
      eq((await messages.listForBusiness(distId, biz.id, s.agentId)).length, 2, "business still reads history");

      await rejectsWith(
        () => messages.sendAsStudent(distId, s.studentId, "one more thing"),
        "ConflictError",
        "student send after close",
      );
      await rejectsWith(
        () => messages.sendAsBusiness(distId, biz.id, s.agentId, "one more thing"),
        "ConflictError",
        "business send after close",
      );
    } finally {
      await s.cleanup();
    }
  });

  await assert("a whitespace-only body is rejected by the DB constraint", async () => {
    const s = await scenario(1);
    const biz = s.businesses[0]!;
    try {
      await s.unlock(0);
      const distId = await s.dist(0);
      // The service trims, so a whitespace body reaches the insert as '' and the
      // enquiry_messages_body_chk constraint refuses it. Zod also blocks this at the
      // route, but the DB is the backstop that does not depend on the caller.
      let threw = false;
      try {
        await messages.sendAsBusiness(distId, biz.id, s.agentId, "   ");
      } catch {
        threw = true;
      }
      eq(threw, true, "whitespace body rejected");
      eq((await messages.listForBusiness(distId, biz.id, s.agentId)).length, 1, "only the greeting is stored");
    } finally {
      await s.cleanup();
    }
  });

  await assert("the inbox lists only unlocked threads, newest activity first", async () => {
    const s = await scenario(2);
    const [a, b] = s.businesses as [{ id: number }, { id: number }];
    try {
      // A locked distribution is not a conversation — the inbox IS the set that exists.
      eq((await messages.listThreadsForStudent(s.studentId)).length, 0, "locked rows are not threads");

      await s.unlock(0);
      await s.unlock(1);
      const [distA, distB] = [await s.dist(0), await s.dist(1)];

      const fresh = await messages.listThreadsForStudent(s.studentId);
      eq(fresh.length, 2, "one thread per unlocking business");
      eq(
        fresh.every((t) => t.last_message_at !== null),
        true,
        "the unlock greeting already counts as activity",
      );

      // Activity, not unlock time, decides the order once someone speaks.
      await messages.sendAsBusiness(distA, a.id, s.agentId, "First contact.");
      const ordered = await messages.listThreadsForStudent(s.studentId);
      eq(ordered[0]!.distribution_id, distA, "most recent activity first");
      eq(ordered[0]!.last_message_at !== null, true, "carries the last message time");
      eq(ordered[0]!.is_closed, false, "still open");

      await distributions.close(b.id, distB, "Not a fit.", s.agentId);
      const afterClose = await messages.listThreadsForStudent(s.studentId);
      eq(afterClose.length, 2, "a closed thread stays in the inbox");
      eq(afterClose.find((t) => t.distribution_id === distB)!.is_closed, true, "flagged closed");
    } finally {
      await s.cleanup();
    }
  });

  await assert("unlocking seeds the thread with the business's greeting", async () => {
    const s = await scenario(1);
    const biz = s.businesses[0]!;
    try {
      await s.unlock(0);
      const distId = await s.dist(0);

      const [greeting, ...rest] = await messages.listForStudent(distId, s.studentId);
      eq(rest.length, 0, "exactly one message");
      eq(greeting!.body, UNLOCK_GREETING, "the greeting text");
      // Sent as the agent who unlocked, not a synthetic system user — so it renders
      // like any other business message on both sides.
      eq(greeting!.sender_id, s.agentId, "sent by the unlocking agent");
      eq(greeting!.sender_role, "business", "on the business side of the thread");
      eq(greeting!.is_mine, false, "not the student's own message");
      eq((await messages.listForBusiness(distId, biz.id, s.agentId))[0]!.is_mine, true, "is the agent's own");

      // Idempotent unlock must not post it twice.
      await s.unlock(0);
      eq((await messages.listForStudent(distId, s.studentId)).length, 1, "re-unlock adds nothing");
    } finally {
      await s.cleanup();
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  await masterKnex.destroy();
  process.exit(failed > 0 ? 1 : 0);
}

main();
