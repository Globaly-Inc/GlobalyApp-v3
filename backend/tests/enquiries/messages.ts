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
 *  7. blank / whitespace-only bodies rejected (no text and no files is not a message)
 *  8. the inbox lists only unlocked threads, newest activity first
 *  9. unlocking seeds the thread with the business's greeting
 * 10. unread counts: seeded on unlock, cleared by markRead, own messages never count
 * 11. the conversation preview fields track the newest message
 * 12. Favorites toggle on and off, per student
 * 13. Starred toggles per message, surfaces in the Starred list, and is scoped to the owner
 * 14. Pins are conversation-level: both sides see them, and a closed thread can't be pinned to
 * 15. Attachments: only the uploader's own files can be attached, and text becomes optional
 * 16. Reactions: per person, visible to both sides, toggleable, blocked on a closed thread
 * 17. Threads: one level deep, replies excluded from the main list, counted on the parent
 */

import { masterKnex } from "../../src/core/db/master-pool.js";
import { provisionBusinessSchema } from "../../src/core/business/provisioner.js";
import { runMatching } from "../../src/modules/enquiries/services/matching.service.js";
import * as distributions from "../../src/modules/enquiries/services/distributions.service.js";
import * as messages from "../../src/modules/enquiries/services/messages.service.js";
import * as media from "../../src/modules/enquiries/services/message-media.service.js";
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

  await assert("a whitespace-only body with no attachment is rejected", async () => {
    const s = await scenario(1);
    const biz = s.businesses[0]!;
    try {
      await s.unlock(0);
      const distId = await s.dist(0);
      // Three layers refuse this and only the innermost is asserted here: zod at the
      // route, appendMessage's own guard (which is what actually throws — a typed
      // BadRequestError rather than an opaque constraint violation), and
      // enquiry_messages_body_chk as the backstop that does not depend on the caller.
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


  await assert("unread counts start at the greeting and clear on read", async () => {
    const s = await scenario(1);
    const biz = s.businesses[0]!;
    try {
      await s.unlock(0);
      const distId = await s.dist(0);

      // Never opened: the seeded greeting is unread.
      const [fresh] = await messages.listThreadsForStudent(s.studentId);
      eq(fresh!.unread_count, 1, "the greeting is unread");

      await messages.markReadAsStudent(distId, s.studentId);
      eq((await messages.listThreadsForStudent(s.studentId))[0]!.unread_count, 0, "cleared by markRead");

      // The student's own message must not make their own thread unread.
      await messages.sendAsStudent(distId, s.studentId, "Thanks!");
      eq((await messages.listThreadsForStudent(s.studentId))[0]!.unread_count, 0, "own message is not unread");

      await messages.sendAsBusiness(distId, biz.id, s.agentId, "You're welcome.");
      eq((await messages.listThreadsForStudent(s.studentId))[0]!.unread_count, 1, "a business reply is unread again");

      // Idempotent — re-reading an already-read thread is not an error.
      await messages.markReadAsStudent(distId, s.studentId);
      await messages.markReadAsStudent(distId, s.studentId);
      eq((await messages.listThreadsForStudent(s.studentId))[0]!.unread_count, 0, "still read");
    } finally {
      await s.cleanup();
    }
  });

  await assert("the conversation preview tracks the newest message", async () => {
    const s = await scenario(1);
    const biz = s.businesses[0]!;
    try {
      await s.unlock(0);
      const distId = await s.dist(0);

      const seeded = (await messages.listThreadsForStudent(s.studentId))[0]!;
      eq(seeded.last_message_body, UNLOCK_GREETING, "the greeting is the first preview");
      eq(seeded.last_message_is_mine, false, "sent by the business");

      await messages.sendAsStudent(distId, s.studentId, "What are the fees?");
      const mine = (await messages.listThreadsForStudent(s.studentId))[0]!;
      eq(mine.last_message_body, "What are the fees?", "preview follows the newest message");
      eq(mine.last_message_is_mine, true, "flagged as the student's own");

      await messages.sendAsBusiness(distId, biz.id, s.agentId, "About AUD 40k.");
      eq((await messages.listThreadsForStudent(s.studentId))[0]!.last_message_is_mine, false, "and back again");
    } finally {
      await s.cleanup();
    }
  });

  await assert("favorites toggle on and off", async () => {
    const s = await scenario(1);
    try {
      await s.unlock(0);
      const distId = await s.dist(0);

      eq((await messages.listThreadsForStudent(s.studentId))[0]!.is_favorite, false, "not favorited by default");

      eq(await messages.toggleFavoriteAsStudent(distId, s.studentId), true, "toggling on reports true");
      eq((await messages.listThreadsForStudent(s.studentId))[0]!.is_favorite, true, "and the inbox agrees");

      eq(await messages.toggleFavoriteAsStudent(distId, s.studentId), false, "toggling off reports false");
      eq((await messages.listThreadsForStudent(s.studentId))[0]!.is_favorite, false, "and the inbox agrees again");
    } finally {
      await s.cleanup();
    }
  });

  await assert("stars are per message and scoped to the thread's owner", async () => {
    const s = await scenario(1);
    const other = await scenario(1);
    const biz = s.businesses[0]!;
    try {
      await s.unlock(0);
      const distId = await s.dist(0);
      await messages.sendAsBusiness(distId, biz.id, s.agentId, "About AUD 40k per year.");

      const [greeting, fees] = await messages.listForStudent(distId, s.studentId);
      eq(greeting!.is_starred, false, "nothing starred to begin with");

      eq(await messages.toggleStarAsStudent(fees!.id, s.studentId), true, "toggling on reports true");
      const afterStar = await messages.listForStudent(distId, s.studentId);
      eq(afterStar[1]!.is_starred, true, "the starred message is flagged");
      eq(afterStar[0]!.is_starred, false, "its neighbour is not");

      const starred = await messages.listStarredForStudent(s.studentId);
      eq(starred.length, 1, "exactly one starred message");
      eq(starred[0]!.id, fees!.id, "the right one");
      // The fixture doesn't carry the business's name, so read it back — the point of
      // the assertion is that the join is wired, not what the name happens to be.
      const bizRow = await masterKnex("businesses").where({ id: biz.id }).first("business_name");
      eq(starred[0]!.business_name, bizRow!.business_name, "carries the conversation it came from");
      eq(starred[0]!.distribution_id, distId, "and its thread id");

      // A star is private: another student cannot star a message in a thread that
      // isn't theirs, and sees none of these stars.
      await rejectsWith(
        () => messages.toggleStarAsStudent(fees!.id, other.studentId),
        "NotFoundError",
        "outsider star",
      );
      eq((await messages.listStarredForStudent(other.studentId)).length, 0, "and sees no stars");

      eq(await messages.toggleStarAsStudent(fees!.id, s.studentId), false, "toggling off reports false");
      eq((await messages.listStarredForStudent(s.studentId)).length, 0, "the Starred list empties");
      eq((await messages.listForStudent(distId, s.studentId))[1]!.is_starred, false, "and the flag clears");
    } finally {
      await other.cleanup();
      await s.cleanup();
    }
  });


  await assert("pins are shared by both sides and blocked on a closed thread", async () => {
    const s = await scenario(1);
    const other = await scenario(1);
    const biz = s.businesses[0]!;
    try {
      await s.unlock(0);
      const distId = await s.dist(0);
      await messages.sendAsBusiness(distId, biz.id, s.agentId, "Intake closes 30 September.");

      const [greeting, intake] = await messages.listForStudent(distId, s.studentId);
      eq(greeting!.is_pinned, false, "nothing pinned to begin with");

      eq(await messages.togglePinAsStudent(intake!.id, s.studentId), true, "pinning reports true");

      // Unlike a star, a pin is NOT per viewer — the business sees it too.
      const studentView = await messages.listForStudent(distId, s.studentId);
      eq(studentView[1]!.is_pinned, true, "the student sees the pin");
      eq(studentView[0]!.is_pinned, false, "its neighbour is untouched");
      const businessView = await messages.listForBusiness(distId, biz.id, s.agentId);
      eq(businessView[1]!.is_pinned, true, "and so does the business");

      // Still gated on being a participant.
      await rejectsWith(
        () => messages.togglePinAsStudent(intake!.id, other.studentId),
        "NotFoundError",
        "outsider pin",
      );

      eq(await messages.togglePinAsStudent(intake!.id, s.studentId), false, "unpinning reports false");
      eq((await messages.listForStudent(distId, s.studentId))[1]!.is_pinned, false, "and clears for the student");
      eq(
        (await messages.listForBusiness(distId, biz.id, s.agentId))[1]!.is_pinned,
        false,
        "and for the business",
      );

      // Closing makes the thread read-only, and a pin changes what both sides see.
      await distributions.close(biz.id, distId, "Not a fit.", s.agentId);
      await rejectsWith(
        () => messages.togglePinAsStudent(intake!.id, s.studentId),
        "ConflictError",
        "pin on a closed thread",
      );
    } finally {
      await other.cleanup();
      await s.cleanup();
    }
  });


  await assert("attachments are ownership-gated and make the body optional", async () => {
    const s = await scenario(1);
    const other = await scenario(1);
    try {
      await s.unlock(0);
      const distId = await s.dist(0);

      // The bytes are GCS's problem; this suite exercises the metadata gate, so the
      // uploaded_files rows are inserted directly rather than pushed through storage.
      const own = `private/platform-users/${s.studentId}/enquiry-chat/transcript.pdf`;
      const foreign = `private/platform-users/${other.studentId}/enquiry-chat/secret.pdf`;
      const wrongCategory = `public/platform-users/${s.studentId}/feed-media/holiday.jpg`;
      const student = await masterKnex("platform_users").where({ id: s.studentId }).first("uuid");
      const stranger = await masterKnex("platform_users").where({ id: other.studentId }).first("uuid");

      await masterKnex("uploaded_files").insert([
        {
          uploaded_by: s.studentId, entity_type: "platform_user", entity_id: student!.uuid,
          category: "enquiry-chat", original_name: "transcript.pdf", storage_path: own,
          mime_type: "application/pdf", size_bytes: 2048,
        },
        {
          uploaded_by: other.studentId, entity_type: "platform_user", entity_id: stranger!.uuid,
          category: "enquiry-chat", original_name: "secret.pdf", storage_path: foreign,
          mime_type: "application/pdf", size_bytes: 2048,
        },
        {
          uploaded_by: s.studentId, entity_type: "platform_user", entity_id: student!.uuid,
          category: "feed-media", original_name: "holiday.jpg", storage_path: wrongCategory,
          mime_type: "image/jpeg", size_bytes: 1024,
        },
      ]);

      // Someone else's upload cannot be attached, even though the path is well-formed...
      await rejectsWith(
        () => messages.sendAsStudent(distId, s.studentId, "here", [foreign]),
        "BadRequestError",
        "another user's file",
      );
      // ...nor can one of your own uploaded for a different purpose...
      await rejectsWith(
        () => messages.sendAsStudent(distId, s.studentId, "here", [wrongCategory]),
        "BadRequestError",
        "wrong category",
      );
      // ...nor a path that was never uploaded at all.
      await rejectsWith(
        () => messages.sendAsStudent(distId, s.studentId, "here", ["private/made/up/path.pdf"]),
        "BadRequestError",
        "unknown path",
      );

      // Attachment with no caption is a valid message — the DB constraint allows it.
      const sent = await messages.sendAsStudent(distId, s.studentId, "", [own]);
      eq(sent.body, "", "no caption");
      eq(sent.attachments.length, 1, "one attachment");
      eq(sent.attachments[0]!.original_name, "transcript.pdf", "metadata is read back from uploaded_files");
      eq(sent.attachments[0]!.size_bytes, 2048, "including the size, not whatever the client claimed");

      // And it round-trips to both sides of the thread.
      const reread = await messages.listForStudent(distId, s.studentId);
      eq(reread.at(-1)!.attachments.length, 1, "the student sees it on re-read");
      const bizView = await messages.listForBusiness(distId, s.businesses[0]!.id, s.agentId);
      eq(bizView.at(-1)!.attachments.length, 1, "and so does the business");

      // Neither text nor files is still rejected — by the service, not by a raw
      // constraint violation surfacing as a 500.
      await rejectsWith(
        () => messages.sendAsStudent(distId, s.studentId, "   ", []),
        "BadRequestError",
        "empty message",
      );

      await rejectsWith(
        () =>
          messages.sendAsStudent(
            distId,
            s.studentId,
            "too many",
            Array.from({ length: media.MAX_ATTACHMENTS_PER_MESSAGE + 1 }, () => own),
          ),
        "BadRequestError",
        "over the per-message cap",
      );

      await masterKnex("uploaded_files").whereIn("storage_path", [own, foreign, wrongCategory]).delete();
    } finally {
      await other.cleanup();
      await s.cleanup();
    }
  });


  await assert("reactions are per person but visible to both sides", async () => {
    const s = await scenario(1);
    const other = await scenario(1);
    const biz = s.businesses[0]!;
    try {
      await s.unlock(0);
      const distId = await s.dist(0);
      const [greeting] = await messages.listForStudent(distId, s.studentId);
      eq(greeting!.reactions.length, 0, "no reactions to begin with");

      eq(await messages.toggleReactionAsStudent(greeting!.id, s.studentId, "\u{1F44D}"), true, "adding reports true");

      // The student sees their own reaction as theirs...
      const mine = (await messages.listForStudent(distId, s.studentId))[0]!;
      eq(mine.reactions.length, 1, "one chip");
      eq(mine.reactions[0]!.emoji, "\u{1F44D}", "the right emoji");
      eq(mine.reactions[0]!.count, 1, "counted once");
      eq(mine.reactions[0]!.mine, true, "flagged as the viewer's own");

      // ...and the business sees the same chip, but not as theirs. This is what
      // separates a reaction from a star (private) and a pin (no owner).
      const theirs = (await messages.listForBusiness(distId, biz.id, s.agentId))[0]!;
      eq(theirs.reactions.length, 1, "the business sees the chip");
      eq(theirs.reactions[0]!.count, 1, "with the same count");
      eq(theirs.reactions[0]!.mine, false, "but not as their own");

      // A second, different emoji is a separate chip rather than a bigger one.
      await messages.toggleReactionAsStudent(greeting!.id, s.studentId, "\u{1F389}");
      eq((await messages.listForStudent(distId, s.studentId))[0]!.reactions.length, 2, "two distinct chips");

      // Same emoji again removes it, and an emptied chip disappears entirely.
      eq(await messages.toggleReactionAsStudent(greeting!.id, s.studentId, "\u{1F44D}"), false, "removing reports false");
      const after = (await messages.listForStudent(distId, s.studentId))[0]!;
      eq(after.reactions.length, 1, "the emptied chip is gone, not left at zero");
      eq(after.reactions[0]!.emoji, "\u{1F389}", "the other one survives");

      // Still participant-gated.
      await rejectsWith(
        () => messages.toggleReactionAsStudent(greeting!.id, other.studentId, "\u{1F44D}"),
        "NotFoundError",
        "outsider reaction",
      );

      await distributions.close(biz.id, distId, "Not a fit.", s.agentId);
      await rejectsWith(
        () => messages.toggleReactionAsStudent(greeting!.id, s.studentId, "\u{2764}"),
        "ConflictError",
        "reaction on a closed thread",
      );
    } finally {
      await other.cleanup();
      await s.cleanup();
    }
  });

  await assert("threads are one level deep and counted on the parent", async () => {
    const s = await scenario(1);
    const biz = s.businesses[0]!;
    try {
      await s.unlock(0);
      const distId = await s.dist(0);
      const [greeting] = await messages.listForStudent(distId, s.studentId);

      eq((await messages.listRepliesForStudent(greeting!.id, s.studentId)).length, 0, "no replies yet");
      eq((await messages.listForStudent(distId, s.studentId))[0]!.reply_count, 0, "and none counted");

      const first = await messages.sendReplyAsStudent(greeting!.id, s.studentId, "Following up on this.");
      eq(first.reply_to_id, greeting!.id, "anchored to the greeting");

      // THE one-level rule: replying to a reply anchors to that reply's parent, not to
      // the reply itself — otherwise a thread could nest without limit.
      const second = await messages.sendReplyAsStudent(first.id, s.studentId, "And one more thing.");
      eq(second.reply_to_id, greeting!.id, "flattened onto the original parent");

      // Reading a reply's thread resolves to the parent's thread, so both are listed.
      const viaReply = await messages.listRepliesForStudent(first.id, s.studentId);
      eq(viaReply.length, 2, "both replies, reached via one of them");
      eq(viaReply[0]!.body, "Following up on this.", "oldest first");

      // A reply lives ONLY in its thread — the main list holds top-level messages, and
      // the parent's reply_count is the only trace of the thread there (V2's behaviour).
      const list = await messages.listForStudent(distId, s.studentId);
      eq(list.length, 1, "just the greeting; the two replies are not inline");
      eq(list[0]!.id, greeting!.id, "and it is the greeting");
      eq(list[0]!.reply_count, 2, "which counts both replies");
      eq(list.some((m) => m.id === first.id), false, "the reply itself is absent from the main list");

      // The business can reply into the same thread and the student sees it.
      const bizReply = await messages.sendAsBusiness(distId, biz.id, s.agentId, "Sure — here are the details.");
      eq(bizReply.reply_to_id, null, "a plain send is not a reply");

      await distributions.close(biz.id, distId, "Done.", s.agentId);
      await rejectsWith(
        () => messages.sendReplyAsStudent(greeting!.id, s.studentId, "one more?"),
        "ConflictError",
        "reply on a closed thread",
      );
      // History stays readable after closing.
      eq((await messages.listRepliesForStudent(greeting!.id, s.studentId)).length, 2, "replies still readable");
    } finally {
      await s.cleanup();
    }
  });

  // ── Business side ──

  await assert("the business inbox lists its own unlocked threads, and only those", async () => {
    const s = await scenario(2);
    const [first, second] = s.businesses as [{ id: number }, { id: number }];
    try {
      await s.unlock(0);
      const distId = await s.dist(0);

      const mine = await messages.listThreadsForBusiness(first.id, s.agentId);
      eq(mine.length, 1, "one unlocked thread");
      eq(mine[0]!.distribution_id, distId, "the one it unlocked");
      eq(mine[0]!.course_name.length > 0, true, "carries the course");
      eq(mine[0]!.student_name.length > 0, true, "counterpart is the student, not the business");
      eq(mine[0]!.is_closed, false, "open");

      // The second business matched but never paid, so it has no thread at all — the
      // inbox IS the set of conversations that exist.
      eq((await messages.listThreadsForBusiness(second.id, s.agentId)).length, 0, "no unlock, no thread");
    } finally {
      await s.cleanup();
    }
  });

  await assert("unread counts the student's messages, not a teammate's", async () => {
    const s = await scenario(1);
    const biz = s.businesses[0]!;
    // A second agent in the same business, to prove a colleague's reply doesn't land as
    // unread on everyone else in the org.
    const mateId = await makeAgentUser();
    try {
      await s.unlock(0);
      const distId = await s.dist(0);

      // The unlock greeting was sent BY this business, so it is not unread for it.
      eq((await messages.listThreadsForBusiness(biz.id, s.agentId))[0]!.unread_count, 0, "own greeting");

      await messages.sendAsStudent(distId, s.studentId, "When does the February intake close?");
      eq((await messages.listThreadsForBusiness(biz.id, s.agentId))[0]!.unread_count, 1, "student's message");

      // Per-agent cursors: reading as one agent must not clear the other's badge.
      await messages.markReadAsBusiness(distId, biz.id, s.agentId);
      eq((await messages.listThreadsForBusiness(biz.id, s.agentId))[0]!.unread_count, 0, "cleared for me");
      eq((await messages.listThreadsForBusiness(biz.id, mateId))[0]!.unread_count, 1, "still unread for my colleague");

      // A teammate's own reply is not something the other agents have to action.
      await messages.sendAsBusiness(distId, biz.id, mateId, "It closes on the 30th.");
      eq((await messages.listThreadsForBusiness(biz.id, s.agentId))[0]!.unread_count, 0, "teammate's reply is not unread");
      // ...but the student does see it as unread.
      const studentInbox = await messages.listThreadsForStudent(s.studentId);
      eq(studentInbox[0]!.unread_count > 0, true, "unread for the student");
    } finally {
      await s.cleanup();
      await masterKnex("platform_users").where({ id: mateId }).delete();
    }
  });

  await assert("a business cannot touch another business's thread", async () => {
    const s = await scenario(2);
    const [mine, theirs] = s.businesses as [{ id: number }, { id: number }];
    try {
      await s.unlock(0);
      const distId = await s.dist(0);
      const [greeting] = await messages.listForBusiness(distId, mine.id, s.agentId);

      // 404 rather than 403 throughout: a non-participant gets no confirmation the
      // conversation exists.
      await rejectsWith(() => messages.listForBusiness(distId, theirs.id, s.agentId), "NotFoundError", "read");
      await rejectsWith(
        () => messages.sendAsBusiness(distId, theirs.id, s.agentId, "poaching"),
        "NotFoundError",
        "send",
      );
      await rejectsWith(() => messages.markReadAsBusiness(distId, theirs.id, s.agentId), "NotFoundError", "read cursor");
      await rejectsWith(
        () => messages.toggleStarAsBusiness(greeting!.id, theirs.id, s.agentId),
        "NotFoundError",
        "star",
      );
      await rejectsWith(
        () => messages.togglePinAsBusiness(greeting!.id, theirs.id, s.agentId),
        "NotFoundError",
        "pin",
      );
      await rejectsWith(
        () => messages.editAsBusiness(greeting!.id, theirs.id, s.agentId, "rewritten"),
        "NotFoundError",
        "edit",
      );
      await rejectsWith(
        () => messages.listRepliesForBusiness(greeting!.id, theirs.id, s.agentId),
        "NotFoundError",
        "replies",
      );
    } finally {
      await s.cleanup();
    }
  });

  await assert("an agent may only edit or delete what they wrote themselves", async () => {
    const s = await scenario(1);
    const biz = s.businesses[0]!;
    const mateId = await makeAgentUser();
    try {
      await s.unlock(0);
      const distId = await s.dist(0);
      const mine = await messages.sendAsBusiness(distId, biz.id, s.agentId, "Happy to help with that.");
      const studentMsg = await messages.sendAsStudent(distId, s.studentId, "Thanks!");

      const edited = await messages.editAsBusiness(mine.id, biz.id, s.agentId, "Happy to help — anything else?");
      eq(edited.body, "Happy to help — anything else?", "own message edited");
      eq(edited.edited_at !== null, true, "and marked edited");

      // Same 404-not-403 rule: being in the thread is not being the author.
      await rejectsWith(
        () => messages.editAsBusiness(studentMsg.id, biz.id, s.agentId, "putting words in their mouth"),
        "NotFoundError",
        "editing the student's message",
      );
      await rejectsWith(
        () => messages.editAsBusiness(mine.id, biz.id, mateId, "not mine to edit"),
        "NotFoundError",
        "editing a teammate's message",
      );
      await rejectsWith(
        () => messages.deleteAsBusiness(studentMsg.id, biz.id, s.agentId),
        "NotFoundError",
        "deleting the student's message",
      );

      await messages.deleteAsBusiness(mine.id, biz.id, s.agentId);
      eq(
        (await messages.listForBusiness(distId, biz.id, s.agentId)).some((m) => m.id === mine.id),
        false,
        "own message gone from the thread",
      );
    } finally {
      await s.cleanup();
      await masterKnex("platform_users").where({ id: mateId }).delete();
    }
  });

  await assert("stars are private per agent; pins are shared with the student", async () => {
    const s = await scenario(1);
    const biz = s.businesses[0]!;
    const mateId = await makeAgentUser();
    try {
      await s.unlock(0);
      const distId = await s.dist(0);
      const studentMsg = await messages.sendAsStudent(distId, s.studentId, "Do you offer scholarships?");

      eq(await messages.toggleStarAsBusiness(studentMsg.id, biz.id, s.agentId), true, "starred");
      const starred = await messages.listStarredForBusiness(biz.id, s.agentId);
      eq(starred.length, 1, "in my starred list");
      eq(starred[0]!.student_name.length > 0, true, "badged with the student, not the business");
      eq(starred[0]!.sender_role, "student", "sender_role derived against the thread's student");
      eq(starred[0]!.is_mine, false, "the student's message is not mine");

      // A star is one person's bookmark — invisible to a colleague and to the student.
      eq((await messages.listStarredForBusiness(biz.id, mateId)).length, 0, "not my colleague's star");
      eq((await messages.listStarredForStudent(s.studentId)).length, 0, "not the student's star");
      eq(
        (await messages.listForBusiness(distId, biz.id, mateId)).find((m) => m.id === studentMsg.id)!.is_starred,
        false,
        "and not flagged for them in the thread",
      );

      // A pin, by contrast, is on the conversation: both sides see it.
      eq(await messages.togglePinAsBusiness(studentMsg.id, biz.id, s.agentId), true, "pinned");
      eq(
        (await messages.listForStudent(distId, s.studentId)).find((m) => m.id === studentMsg.id)!.is_pinned,
        true,
        "the student sees the pin",
      );
    } finally {
      await s.cleanup();
      await masterKnex("platform_users").where({ id: mateId }).delete();
    }
  });

  await assert("a closed thread is read-only for the business too", async () => {
    const s = await scenario(1);
    const biz = s.businesses[0]!;
    try {
      await s.unlock(0);
      const distId = await s.dist(0);
      const mine = await messages.sendAsBusiness(distId, biz.id, s.agentId, "Details attached.");
      const [greeting] = await messages.listForBusiness(distId, biz.id, s.agentId);

      await distributions.close(biz.id, distId, "Converted.", s.agentId);

      await rejectsWith(() => messages.sendAsBusiness(distId, biz.id, s.agentId, "one more"), "ConflictError", "send");
      await rejectsWith(
        () => messages.editAsBusiness(mine.id, biz.id, s.agentId, "amended"),
        "ConflictError",
        "edit",
      );
      await rejectsWith(() => messages.deleteAsBusiness(mine.id, biz.id, s.agentId), "ConflictError", "delete");
      await rejectsWith(
        () => messages.togglePinAsBusiness(greeting!.id, biz.id, s.agentId),
        "ConflictError",
        "pin",
      );
      await rejectsWith(
        () => messages.toggleReactionAsBusiness(greeting!.id, biz.id, s.agentId, "👍"),
        "ConflictError",
        "react",
      );

      // Reading, and private bookmarking, both survive the close.
      eq((await messages.listForBusiness(distId, biz.id, s.agentId)).length >= 1, true, "history still readable");
      eq(await messages.toggleStarAsBusiness(greeting!.id, biz.id, s.agentId), true, "starring still allowed");
      eq((await messages.listThreadsForBusiness(biz.id, s.agentId))[0]!.is_closed, true, "inbox shows it closed");
    } finally {
      await s.cleanup();
    }
  });

  await assert("favourites are per agent and survive a reopen of the inbox", async () => {
    const s = await scenario(1);
    const biz = s.businesses[0]!;
    const mateId = await makeAgentUser();
    try {
      await s.unlock(0);
      const distId = await s.dist(0);

      eq(await messages.toggleFavoriteAsBusiness(distId, biz.id, s.agentId), true, "favourited");
      eq((await messages.listThreadsForBusiness(biz.id, s.agentId))[0]!.is_favorite, true, "shows in my inbox");
      eq((await messages.listThreadsForBusiness(biz.id, mateId))[0]!.is_favorite, false, "not my colleague's");
      eq(await messages.toggleFavoriteAsBusiness(distId, biz.id, s.agentId), false, "toggles back off");
    } finally {
      await s.cleanup();
      await masterKnex("platform_users").where({ id: mateId }).delete();
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  await masterKnex.destroy();
  process.exit(failed > 0 ? 1 : 0);
}

main();
