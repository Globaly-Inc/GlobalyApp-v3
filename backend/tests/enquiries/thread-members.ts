/**
 * Enquiry thread membership — the Space model applied to the conversation a business unlocks.
 * Run: node --import tsx tests/enquiries/thread-members.ts
 *
 * These are the security claims the feature makes, so they are the ones worth proving:
 *  1. Unlocking seeds the roster: the business owner as admin, the paying agent as a member.
 *  2. A colleague in the same org who is NOT on the thread cannot read it — 404, not 403.
 *  3. An admin can add someone, and that person can then read it.
 *  4. A plain member cannot add anyone.
 *  5. Someone outside the org cannot be added, even by the admin.
 *  6. The owner and the unlocker cannot be removed — they are the thread's structural members.
 *  7. The last admin cannot be demoted, or the thread would be unmanageable.
 *  8. A removed member loses access immediately.
 *  9. Membership, not enquiries:respond, is what the chat guard requires.
 * 10. An open thread cannot be left without a member, or without an admin — and closing it lifts
 *     both rules. A student cannot leave at all until the business closes the enquiry.
 */

import { masterKnex } from "../../src/core/db/master-pool.js";
import { createSchemaKnex } from "../../src/core/db/knex.js";
import { provisionBusinessSchema } from "../../src/core/business/provisioner.js";
import { requireEnquiryPermission } from "../../src/modules/enquiries/shared/recipient.js";
import { runMatching } from "../../src/modules/enquiries/services/matching.service.js";
import * as distributions from "../../src/modules/enquiries/services/distributions.service.js";
import * as creditService from "../../src/modules/ai-counsellor/services/credit.service.js";
import * as messages from "../../src/modules/enquiries/services/messages.service.js";
import * as threadMembers from "../../src/modules/enquiries/services/thread-members.service.js";

let passed = 0;
let failed = 0;

async function assert(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  ✗ ${name}\n    ${err.stack ?? err.message}`);
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
    if (err?.name === errorName) return;
    throw new Error(`${label}: expected ${errorName}, got ${err?.name}: ${err?.message}`);
  }
  throw new Error(`${label}: expected ${errorName}, but it resolved`);
}

const asBiz = (id: number) => ({ kind: "business" as const, id });

async function makeUser(tag: string): Promise<number> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [user] = await masterKnex("platform_users")
    .insert({
      first_name: tag,
      last_name: "Member",
      email: `tm-${tag.toLowerCase()}-${suffix}@example.com`,
      account_status: 1,
    })
    .returning("id");
  return user.id;
}

async function getCountryId(iso2: string): Promise<number> {
  const row = await masterKnex("countries").where({ iso2 }).first("id");
  if (row) return row.id;
  const [inserted] = await masterKnex("countries")
    .insert({ name: `Test-${iso2}-${Date.now()}`, iso2, iso3: `${iso2}X`, is_active: true })
    .returning("id");
  return inserted.id;
}

/**
 * One unlocked thread, with three org users: the owner (admin), the agent who unlocks (member)
 * and a colleague who is in the business but not on the thread.
 */
async function scenario() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const countryId = await getCountryId("AU");

  const ownerId = await makeUser("Owner");
  const agentId = await makeUser("Agent");
  const colleagueId = await makeUser("Colleague");
  const outsiderId = await makeUser("Outsider");
  const studentId = await makeUser("Student");
  await masterKnex("platform_user_profiles").insert({
    user_id: studentId,
    country_of_residence_id: countryId,
    latitude: -33.8688,
    longitude: 151.2093,
  });

  const [job] = await masterKnex("superadmin.extraction_jobs")
    .insert({ institution_name: `TM Institution ${suffix}`, institution_url: `https://tm-${suffix}.example.com` })
    .returning("id");
  const [course] = await masterKnex("superadmin.extraction_courses")
    .insert({ job_id: job.id, name: `TM Course ${suffix}`, subject_area: `TM ${suffix}` })
    .returning("id");
  const [institution] = await masterKnex("institutions")
    .insert({
      institution_name: `TM Institution ${suffix}`,
      subdomain: `tm-inst-${suffix}`,
      email: `tm-inst-${suffix}@example.com`,
      source_job_id: job.id,
      status: "pending",
      claim_status: "unclaimed",
    })
    .returning("id");

  const [business] = await masterKnex("businesses")
    .insert({
      owner_id: ownerId,
      subdomain: `tm-biz-${suffix}`,
      business_name: `TM Biz ${suffix}`,
      account_status: 1,
      country_id: countryId,
      status: "verified",
      latitude: -33.87,
      longitude: 151.21,
      enquiry_enabled: true,
    })
    .returning(["id", "schema_name"]);
  await provisionBusinessSchema(business.schema_name);
  await masterKnex("business_representations").insert({
    originator_id: business.id,
    originator_type: "business",
    target_id: institution.id,
    target_type: "institution",
    status: "active",
  });
  // Candidate pool: who the admin is allowed to add. The outsider is deliberately absent.
  for (const id of [ownerId, agentId, colleagueId]) {
    await masterKnex("user_business_index").insert({
      platform_user_id: id,
      business_id: business.id,
      role: id === ownerId ? "owner" : "member",
      is_owner: id === ownerId,
    });
  }

  const [enquiry] = await masterKnex("enquiries")
    .insert({
      student_id: studentId,
      course_id: course.id,
      extraction_job_id: job.id,
      institution_id: institution.id,
      message: "Please tell me more about this course and the intakes available.",
      student_latitude: -33.8688,
      student_longitude: 151.2093,
      status: "pending",
    })
    .returning("*");
  await runMatching(enquiry.id);

  const dist = await masterKnex("enquiry_distributions")
    .where({ enquiry_id: enquiry.id, business_id: business.id })
    .first();
  if (!dist) throw new Error("matching did not distribute to the test business");

  // Credits, so unlock does not 402. Through the service, not a hand-written upsert — the wallet
  // is three balance columns, not one, and the ledger row matters to the unlock path.
  await creditService.grantCredits(ownerId, 5000, "free", "admin_grant", "thread-members test seed");

  await distributions.unlock(asBiz(business.id), dist.id, agentId);

  return {
    ownerId,
    agentId,
    colleagueId,
    outsiderId,
    studentId,
    businessId: business.id,
    schemaName: business.schema_name as string,
    distId: dist.id as string,
    recipient: asBiz(business.id),
    cleanup: async () => {
      await masterKnex("enquiry_thread_members").where({ distribution_id: dist.id }).delete();
      await masterKnex("enquiry_messages").where({ distribution_id: dist.id }).delete();
      await masterKnex("audit_logs").whereIn("entity_id", [dist.id, enquiry.id]).delete();
      await masterKnex("enquiry_email_queue").where({ enquiry_id: enquiry.id }).delete();
      await masterKnex("enquiry_distributions").where({ enquiry_id: enquiry.id }).delete();
      await masterKnex("enquiries").where({ id: enquiry.id }).delete();
      await masterKnex("user_business_index").where({ business_id: business.id }).delete();
      await masterKnex("business_representations").where({ originator_id: business.id }).delete();
      await masterKnex("businesses").where({ id: business.id }).delete();
      await masterKnex("institutions").where({ id: institution.id }).delete();
      await masterKnex("superadmin.extraction_courses").where({ job_id: job.id }).delete();
      await masterKnex("superadmin.extraction_jobs").where({ id: job.id }).delete();
      await masterKnex("platform_user_profiles").where({ user_id: studentId }).delete();
      // Transactions first: they FK the wallet.
      await masterKnex("credit_transactions")
        .whereIn("wallet_id", masterKnex("credit_wallets").where({ platform_user_id: ownerId }).select("id"))
        .delete();
      await masterKnex("credit_wallets").where({ platform_user_id: ownerId }).delete();
      await masterKnex("platform_users")
        .whereIn("id", [ownerId, agentId, colleagueId, outsiderId, studentId])
        .delete();
    },
  };
}

async function main() {
  console.log("Enquiry thread membership tests (DB integration)\n");

  await assert("unlocking seeds the owner as admin and the unlocker as a member", async () => {
    const s = await scenario();
    try {
      const { members, my_role, can_manage } = await threadMembers.listMembers(s.distId, s.recipient, s.ownerId);
      eq(members.length, 2, "two seeded members");
      eq(members.find((m) => m.platform_user_id === s.ownerId)?.role, "admin", "owner is admin");
      eq(members.find((m) => m.platform_user_id === s.agentId)?.role, "member", "unlocker is a member");
      eq(members.every((m) => m.source === "auto"), true, "both seeded automatically");
      eq(my_role, "admin", "owner's own role echoed back");
      eq(can_manage, true, "owner may manage");
    } finally {
      await s.cleanup();
    }
  });

  // The whole point of the change: org permission is no longer enough.
  await assert("a colleague in the same business who is not on the thread cannot read it", async () => {
    const s = await scenario();
    try {
      await rejectsWith(
        () => messages.listForBusiness(s.distId, s.recipient, s.colleagueId),
        "NotFoundError",
        "non-member read",
      );
      // 404 rather than 403 — a non-member must not learn the thread exists.
      await rejectsWith(
        () => threadMembers.listMembers(s.distId, s.recipient, s.colleagueId),
        "NotFoundError",
        "non-member roster read",
      );
    } finally {
      await s.cleanup();
    }
  });

  await assert("the admin can add a colleague, who can then read the thread", async () => {
    const s = await scenario();
    try {
      const { added } = await threadMembers.addMembers(s.distId, s.recipient, s.ownerId, [s.colleagueId]);
      eq(added, 1, "one added");
      const thread = await messages.listForBusiness(s.distId, s.recipient, s.colleagueId);
      eq(thread.length >= 1, true, "new member reads the thread");
      const { members } = await threadMembers.listMembers(s.distId, s.recipient, s.colleagueId);
      eq(members.find((m) => m.platform_user_id === s.colleagueId)?.source, "manual", "invited members are manual");
    } finally {
      await s.cleanup();
    }
  });

  await assert("a plain member cannot add anyone", async () => {
    const s = await scenario();
    try {
      await rejectsWith(
        () => threadMembers.addMembers(s.distId, s.recipient, s.agentId, [s.colleagueId]),
        "ForbiddenError",
        "member add",
      );
    } finally {
      await s.cleanup();
    }
  });

  // Without this an admin could add any platform user by id — a student included.
  await assert("someone outside the business cannot be added, even by the admin", async () => {
    const s = await scenario();
    try {
      await rejectsWith(
        () => threadMembers.addMembers(s.distId, s.recipient, s.ownerId, [s.outsiderId]),
        "BadRequestError",
        "outsider add",
      );
    } finally {
      await s.cleanup();
    }
  });

  await assert("the owner and the unlocker cannot be removed", async () => {
    const s = await scenario();
    try {
      await rejectsWith(
        () => threadMembers.removeMember(s.distId, s.recipient, s.ownerId, s.agentId),
        "ConflictError",
        "removing the unlocker",
      );
      await rejectsWith(
        () => threadMembers.removeMember(s.distId, s.recipient, s.ownerId, s.ownerId),
        "ConflictError",
        "removing the owner",
      );
    } finally {
      await s.cleanup();
    }
  });

  await assert("the last admin cannot be demoted", async () => {
    const s = await scenario();
    try {
      await rejectsWith(
        () => threadMembers.setRole(s.distId, s.recipient, s.ownerId, s.ownerId, "member"),
        "ConflictError",
        "demoting the only admin",
      );
      // With a second admin in place it is allowed — the guard is about the last one, not about
      // demotion itself.
      await threadMembers.addMembers(s.distId, s.recipient, s.ownerId, [s.colleagueId]);
      await threadMembers.setRole(s.distId, s.recipient, s.ownerId, s.colleagueId, "admin");
      await threadMembers.setRole(s.distId, s.recipient, s.ownerId, s.ownerId, "member");
      const { members } = await threadMembers.listMembers(s.distId, s.recipient, s.colleagueId);
      eq(members.find((m) => m.platform_user_id === s.ownerId)?.role, "member", "demoted once a second admin exists");
    } finally {
      await s.cleanup();
    }
  });

  await assert("a removed member loses access immediately", async () => {
    const s = await scenario();
    try {
      await threadMembers.addMembers(s.distId, s.recipient, s.ownerId, [s.colleagueId]);
      eq((await messages.listForBusiness(s.distId, s.recipient, s.colleagueId)).length >= 1, true, "had access");
      await threadMembers.removeMember(s.distId, s.recipient, s.ownerId, s.colleagueId);
      await rejectsWith(
        () => messages.listForBusiness(s.distId, s.recipient, s.colleagueId),
        "NotFoundError",
        "read after removal",
      );
    } finally {
      await s.cleanup();
    }
  });

  /**
   * The chat routes carry requireEnquiryPermission() with NO permission, because membership is
   * the authorization (see chatGuard in distributions.routes.ts). The seeded "member" role holds
   * only business:read and enquiries:view, so it is exactly the case that used to 403 into an
   * empty inbox: on the thread, but not allowed through the door.
   *
   * Asserted against the real guard and a real tenant schema — the thing that changed lives in a
   * Fastify preHandler, so no service-level test can see it.
   */
  await assert("an agent whose role lacks enquiries:respond still passes the chat guard", async () => {
    const s = await scenario();
    const db = createSchemaKnex(s.schemaName);
    try {
      const memberRole = await db("roles").where({ name: "member" }).first("id");
      await db("agents").insert({
        platform_user_id: s.colleagueId,
        role_id: memberRole.id,
        email: `guard-${s.colleagueId}@example.com`,
      });

      const req = (sub: number) => ({ auth: { sub, orgId: s.businessId, orgType: "business" }, db }) as any;
      // Records the first status() it is given; undefined means the guard let the request through.
      const spyReply = () => {
        const r: any = { code: undefined, body: undefined };
        r.status = (c: number) => { r.code = c; return r; };
        r.send = (b: unknown) => { r.body = b; return r; };
        return r;
      };

      const open = spyReply();
      await requireEnquiryPermission()(req(s.colleagueId), open);
      eq(open.code, undefined, "permissionless agent passes the chat guard");

      // Proves the case is real rather than vacuous: the old guard rejected this same agent.
      const gated = spyReply();
      await requireEnquiryPermission("enquiries:respond")(req(s.colleagueId), gated);
      eq(gated.code, 403, "the old enquiries:respond guard rejected them");

      // The guard still has one job: someone with no agents row is not in this business at all.
      const outsider = spyReply();
      await requireEnquiryPermission()(req(s.outsiderId), outsider);
      eq(outsider.code, 403, "a non-agent is still refused");
    } finally {
      await db("agents").where({ platform_user_id: s.colleagueId }).delete();
      await db.destroy();
      await s.cleanup();
    }
  });

  // ── Leaving ──
  //
  // scenario() leaves a thread of two: the owner (admin, auto) and the agent who unlocked it
  // (member, auto). That is enough to exercise every branch of leaveBlockers.

  await assert("a plain member can leave an open thread, and the roster says so", async () => {
    const s = await scenario();
    try {
      const before = await threadMembers.listMembers(s.distId, s.recipient, s.agentId);
      eq(before.can_leave, true, "agent is neither the last member nor the last admin");
      eq(before.leave_blocked_reason, null, "nothing to explain");

      await threadMembers.leave(s.distId, s.recipient, s.agentId);
      await rejectsWith(
        () => messages.listForBusiness(s.distId, s.recipient, s.agentId),
        "NotFoundError",
        "read after leaving",
      );
      const after = await threadMembers.listMembers(s.distId, s.recipient, s.ownerId);
      eq(after.members.length, 1, "only the owner is left");
    } finally {
      await s.cleanup();
    }
  });

  await assert("the last admin cannot leave an open thread", async () => {
    const s = await scenario();
    try {
      const view = await threadMembers.listMembers(s.distId, s.recipient, s.ownerId);
      eq(view.can_leave, false, "owner is the only admin");
      eq(view.leave_blocked_reason?.includes("make another member an admin"), true, "names the fix");
      // Two members, so adding someone is NOT one of the things they are asked to do.
      eq(view.leave_blocked_reason?.includes("add someone else"), false, "only the admin rule bites");
      await rejectsWith(
        () => threadMembers.leave(s.distId, s.recipient, s.ownerId),
        "ConflictError",
        "last admin leaving",
      );
    } finally {
      await s.cleanup();
    }
  });

  await assert("the only member of an open thread is asked to do both things", async () => {
    const s = await scenario();
    try {
      await threadMembers.leave(s.distId, s.recipient, s.agentId);
      const view = await threadMembers.listMembers(s.distId, s.recipient, s.ownerId);
      eq(view.can_leave, false, "alone on an open thread");
      eq(view.leave_blocked_reason?.includes("add someone else"), true, "asks for another member");
      eq(view.leave_blocked_reason?.includes("make another member an admin"), true, "and for another admin");
      await rejectsWith(
        () => threadMembers.leave(s.distId, s.recipient, s.ownerId),
        "ConflictError",
        "sole member leaving",
      );
    } finally {
      await s.cleanup();
    }
  });

  await assert("closing the enquiry lets the last member out", async () => {
    const s = await scenario();
    try {
      await threadMembers.leave(s.distId, s.recipient, s.agentId);
      await distributions.close(s.recipient, s.distId, "Student enrolled elsewhere", s.ownerId);

      const view = await threadMembers.listMembers(s.distId, s.recipient, s.ownerId);
      eq(view.can_leave, true, "a closed lead needs nobody minding it");
      eq(view.leave_blocked_reason, null, "nothing left to explain");

      await threadMembers.leave(s.distId, s.recipient, s.ownerId);
      await rejectsWith(
        () => threadMembers.listMembers(s.distId, s.recipient, s.ownerId),
        "NotFoundError",
        "read after the thread emptied",
      );
    } finally {
      await s.cleanup();
    }
  });

  await assert("a student can only leave once the business has closed the enquiry", async () => {
    const s = await scenario();
    try {
      await rejectsWith(
        () => threadMembers.leaveAsStudent(s.distId, s.studentId),
        "ConflictError",
        "leaving an open enquiry",
      );
      eq((await messages.listThreadsForStudent(s.studentId)).length, 1, "still in their inbox");

      await distributions.close(s.recipient, s.distId, "Answered", s.ownerId);
      await threadMembers.leaveAsStudent(s.distId, s.studentId);

      eq((await messages.listThreadsForStudent(s.studentId)).length, 0, "gone from their inbox");
      await rejectsWith(
        () => messages.listForStudent(s.distId, s.studentId),
        "NotFoundError",
        "student read after leaving",
      );
      // The business keeps the lead it paid for — leaving is one-sided.
      eq((await messages.listForBusiness(s.distId, s.recipient, s.ownerId)).length >= 1, true, "business unaffected");
    } finally {
      await s.cleanup();
    }
  });

  await assert("the admin renames the thread, and both sides see the new name", async () => {
    const s = await scenario();
    try {
      await threadMembers.renameThread(s.distId, s.recipient, s.ownerId, "  Sharma — Feb intake  ");

      // Trimmed, and the SAME string on both sides — that is the whole point of a shared title.
      const [forBusiness] = await messages.listThreadsForBusiness(s.recipient, s.ownerId);
      eq(forBusiness.title, "Sharma — Feb intake", "business sees it");
      const [forStudent] = await messages.listThreadsForStudent(s.studentId);
      eq(forStudent.title, "Sharma — Feb intake", "student sees the same one");

      // A colleague who is only a member cannot rename it.
      await threadMembers.addMembers(s.distId, s.recipient, s.ownerId, [s.colleagueId]);
      await rejectsWith(
        () => threadMembers.renameThread(s.distId, s.recipient, s.colleagueId, "Mine now"),
        "ForbiddenError",
        "non-admin rename",
      );

      // Clearing sends both sides back to their own default label.
      await threadMembers.renameThread(s.distId, s.recipient, s.ownerId, "   ");
      eq((await messages.listThreadsForStudent(s.studentId))[0].title, null, "blank clears it");
    } finally {
      await s.cleanup();
    }
  });

  /**
   * The happy path needs a real upload, so this covers the two refusals instead — which are the
   * parts with a decision in them. Pointing the thread at a path you did not upload is the one that
   * matters: every member and the student would be served a signed URL for whatever it named.
   */
  await assert("only an admin sets the photo, and only to a file they uploaded", async () => {
    const s = await scenario();
    try {
      await rejectsWith(
        () => threadMembers.setPhoto(s.distId, s.recipient, s.agentId, "private/platform-users/1/enquiry-chat/x.png"),
        "ForbiddenError",
        "non-admin photo change",
      );
      await rejectsWith(
        () => threadMembers.setPhoto(s.distId, s.recipient, s.ownerId, "private/somebody-elses/file.png"),
        "BadRequestError",
        "a path this admin never uploaded",
      );
      // Clearing needs no file, so it is allowed straight through.
      await threadMembers.setPhoto(s.distId, s.recipient, s.ownerId, null);
      eq((await messages.listThreadsForStudent(s.studentId))[0].thread_photo, null, "cleared");
    } finally {
      await s.cleanup();
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  await masterKnex.destroy();
  process.exit(failed > 0 ? 1 : 0);
}

main();
