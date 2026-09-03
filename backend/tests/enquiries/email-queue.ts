/**
 * Email queue tests — dedup + worker processing.
 * Run: node --import tsx tests/enquiries/email-queue.ts
 *
 * Redistribution-on-reject and the enquiry_accepted email trigger were reverted
 * in the scope-reduction pass (accept/reject no longer exist); this file covers:
 *  0. Rendering — the only cases that run without a database.
 *  1. Recipient resolution: an enquiry mails `businesses.email` and NOTHING else,
 *     whatever the team size, falling back to the owner when it is unset.
 *  2. Enqueuing the same event twice hits the dedup_key collision cleanly —
 *     exactly one row, no error surfaced to the caller.
 *  3. The email worker's send path marks a row `sent` and never reprocesses
 *     an already-sent row.
 *  4. The 5-minute summary: batching, the window, the single-item case, and the
 *     SKIP LOCKED claim that stops two sweeps sending the same digest twice.
 */

import { masterKnex } from "../../src/core/db/master-pool.js";
import { mailerService } from "../../src/shared/mail/mailerService.js";
import { enquiryDigestEmail, enquiryDistributedEmail } from "../../src/shared/mail/templates.js";
import * as emailQueueService from "../../src/modules/enquiries/services/email-queue.service.js";

// The throttle exists to stay inside the provider's rate limit; in tests it only makes the
// suite take minutes. Read lazily by the service, so setting it here is enough.
process.env.ENQUIRY_EMAIL_MIN_INTERVAL_MS = "0";

type SentMail = { to: string; subject: string; text?: string; html?: string };

/**
 * Runs `fn` with the mailer captured instead of sending.
 *
 * `sweepDigests()` drains the whole table, not just this test's rows, so every assertion
 * filters the capture by the recipient address the test owns — a dev database with other
 * pending rows must not be able to fail the suite.
 */
async function withCapturedMail<T>(fn: (sent: SentMail[]) => Promise<T>): Promise<T> {
  const sent: SentMail[] = [];
  const original = mailerService.sendMail.bind(mailerService);
  (mailerService as unknown as { sendMail: (o: SentMail) => Promise<void> }).sendMail = async (o) => {
    sent.push(o);
  };
  try {
    return await fn(sent);
  } finally {
    (mailerService as unknown as { sendMail: typeof original }).sendMail = original;
  }
}

/** Runs the sweep with the digest window forced open (or shut), then restores it. */
async function sweepWithWindow(ms: number) {
  const previous = process.env.ENQUIRY_EMAIL_WINDOW_MS;
  process.env.ENQUIRY_EMAIL_WINDOW_MS = String(ms);
  try {
    await emailQueueService.sweepDigests();
  } finally {
    if (previous === undefined) delete process.env.ENQUIRY_EMAIL_WINDOW_MS;
    else process.env.ENQUIRY_EMAIL_WINDOW_MS = previous;
  }
}

/** Runs `fn` with the per-digest row cap forced to `cap`, then restores it. */
async function withDigestCap<T>(cap: number, fn: () => Promise<T>): Promise<T> {
  const previous = process.env.ENQUIRY_EMAIL_DIGEST_CAP;
  process.env.ENQUIRY_EMAIL_DIGEST_CAP = String(cap);
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.ENQUIRY_EMAIL_DIGEST_CAP;
    else process.env.ENQUIRY_EMAIL_DIGEST_CAP = previous;
  }
}

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
      // Every test business gets its own inbox: that address is now the ONLY recipient, and a
      // unique one per test keeps the sweep's captured mail attributable when the suite shares
      // a database with other pending rows.
      email: `biz-inbox-${suffix}@example.com`,
    })
    .returning("id");
  return row.id;
}

/** The one address a business's enquiry mail goes to. */
async function businessInbox(businessId: number): Promise<string> {
  const row = await masterKnex("businesses").where({ id: businessId }).first("email");
  return row.email;
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

  // ── 0. Rendering. No database, so these still run when the rest cannot. ──
  await assert("the single-enquiry mail deep-links, escapes user text, and avoids the API origin", async () => {
    const mail = enquiryDistributedEmail({
      courseName: "MSc Data Science",
      institutionName: "University of <X>",
      intake: "April 2027",
      businessName: "Acme & Co",
      studentFirstName: "Priya",
      distributionId: "dist-1",
    });
    eq(mail.subject, "New student enquiry — MSc Data Science", "subject names the course");
    if (!mail.html.includes("/business/enquiries/dist-1/student")) throw new Error("no deep link to the distribution");
    if (mail.html.includes("localhost:3000")) throw new Error("links point at the API origin, not the web app");
    if (!mail.html.includes("University of &lt;X&gt;")) throw new Error("user-supplied text was not escaped");

    // Rows queued before distribution_id was in the payload must still render a usable link.
    const legacy = enquiryDistributedEmail({ courseName: "Old Course" });
    if (!legacy.html.includes("/business/enquiries")) throw new Error("legacy row lost its link");
    if (legacy.html.includes("/business/enquiries/null")) throw new Error("null leaked into the URL");
  });

  await assert("the summary lists each enquiry in both mail parts and states count and period", async () => {
    const items = [1, 2, 3].map((i) => ({
      studentFirstName: `Student${i}`,
      courseName: `Course ${i}`,
      institutionName: "Uni",
      intake: "Sep 2027",
    }));
    const digest = enquiryDigestEmail({ items, businessName: "Acme & Co", windowMinutes: 5 });
    eq(digest.subject, "3 new student enquiries", "subject names the count");
    for (const i of [1, 2, 3]) {
      if (!digest.html.includes(`Course ${i}`)) throw new Error(`html is missing enquiry ${i}`);
      if (!digest.text.includes(`Course ${i}`)) throw new Error(`text part is missing enquiry ${i}`);
      if (!digest.html.includes(`Student${i}`)) throw new Error(`html does not name student ${i}`);
    }
    // Count alone leaves "since when?" unanswered — the period has to be in the lead.
    if (!digest.html.includes("in the last 5 minutes")) throw new Error("lead does not state the window");
    if (!digest.text.includes("in the last 5 minutes")) throw new Error("text lead does not state the window");
    if (!digest.html.includes("Acme &amp; Co")) throw new Error("business name was not escaped");

    // A card with no course still appears — dropping it would silently lose an enquiry from a
    // summary whose entire promise is that nothing is missed.
    const sparse = enquiryDigestEmail({ items: [{}, {}] });
    eq((sparse.html.match(/Course enquiry/g) ?? []).length, 2, "both bare cards render");

    // An unclaimed institution has no inbox to open — the CTA must offer the claim link.
    const claim = enquiryDigestEmail({ items, claimUrl: "http://localhost:3001/join/abc" });
    if (!claim.html.includes("Claim your account")) throw new Error("claim CTA missing");
    if (!claim.html.includes("/join/abc")) throw new Error("claim URL missing");
  });

  await assert("a large summary lists five and counts the rest, heading the true total", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      studentFirstName: `Student${i + 1}`,
      courseName: `Course ${i + 1}`,
    }));
    const digest = enquiryDigestEmail({ items: many });

    eq(digest.subject, "12 new student enquiries", "heading counts every enquiry, not the printed ones");
    if (!digest.html.includes("Course 5")) throw new Error("the fifth enquiry should be listed");
    if (digest.html.includes("Course 6")) throw new Error("the sixth enquiry should not be listed");
    if (!digest.html.includes("7 more")) throw new Error("the unlisted enquiries are not accounted for");
    eq((digest.text.match(/^• /gm) ?? []).length, 5, "text part lists five too");
  });

  await assert("the summary carries one CTA and no per-card action", async () => {
    const items = [1, 2, 3].map((i) => ({ studentFirstName: `S${i}`, courseName: `Course ${i}` }));
    const digest = enquiryDigestEmail({ items });

    if (digest.html.includes("View enquiry")) throw new Error("a per-card action is still rendered");
    // Exactly one anchor: the CTA. The logo is an <img>, the footer is plain text.
    eq((digest.html.match(/<a\s/g) ?? []).length, 1, "one link in the whole mail");
    if (!digest.html.includes("Open your inbox")) throw new Error("primary CTA missing");
    // Wide, left-aligned shell — the narrow centred one is what made six cards unreadable.
    if (!digest.html.includes("max-width:600px")) throw new Error("summary should use the wide container");
    if (!digest.html.includes('align="left"')) throw new Error("a list of cards must be left-aligned");
  });

  await assert("both mails render the inbox card's shape and leak nothing beyond it", async () => {
    const single = enquiryDistributedEmail({
      studentFirstName: "Rojan",
      courseName: "Revenue Management 360",
      institutionName: "Cornell University",
      distributionId: "dist-1",
    });
    const digest = enquiryDigestEmail({
      items: [
        { studentFirstName: "Rojan", courseName: "Revenue Management 360" },
        { studentFirstName: "Asha", courseName: "Data Science" },
      ],
    });

    for (const [label, mail] of [
      ["single", single],
      ["digest", digest],
    ] as const) {
      // Avatar initial, real first name, redacted surname and address — the same boundary the
      // inbox card draws. The @gmail.com is a fixed placeholder on both, not a real provider.
      if (!mail.html.includes(">R<")) throw new Error(`${label}: no avatar initial`);
      if (!mail.html.includes("Rojan")) throw new Error(`${label}: first name missing`);
      if (!mail.html.includes("@gmail.com")) throw new Error(`${label}: redacted address missing`);
      if (!mail.html.includes("Revenue Management 360")) throw new Error(`${label}: course missing`);
      // The redaction bar must carry no real characters to un-hide.
      if (/Rojan\s*[A-Za-z]/.test(mail.html.replace(/<[^>]+>/g, ""))) {
        throw new Error(`${label}: something followed the first name in the rendered text`);
      }
    }
    if (!single.html.includes("Cornell University")) throw new Error("single: institution missing");
  });

  // ── 1. One enquiry, one email, to the business inbox — never to team members ──
  await assert("an enquiry emails only businesses.email, however many team members exist", async () => {
    const studentId = await makeStudent();
    const secondMemberId = await makeStudent();
    const { jobId, courseId } = await makeJobAndCourse("Notify Subject");
    const businessId = await makeBusiness();
    const enquiryId = await makeEnquiry(studentId, courseId);
    try {
      const distId = await makeDistribution(enquiryId, businessId);
      // Two members: under the old fan-out this produced three rows (two personal + the inbox).
      await addTeamMember(businessId, studentId);
      await addTeamMember(businessId, secondMemberId);
      const inbox = await businessInbox(businessId);
      await emailQueueService.enqueueDistributionEmails(enquiryId, distId, businessId);

      const rows = await masterKnex("enquiry_email_queue").where({ distribution_id: distId });
      eq(rows.length, 1, "exactly one queue row, regardless of team size");
      eq(rows[0].recipient_email, inbox, "addressed to the business inbox");
      eq(rows[0].template, "enquiry_distributed", "queued with the enquiry_distributed template");
      eq(rows[0].recipient_user_id, null, "an inbox is not a platform user");
      eq(rows[0].dedup_key, `enquiry_distributed:${distId}:business`, "dedup_key is per distribution, not per member");

      const members = await masterKnex("platform_users").whereIn("id", [studentId, secondMemberId]).pluck("email");
      if (rows.some((r: any) => members.includes(r.recipient_email))) {
        throw new Error("a team member's personal address was queued");
      }
    } finally {
      await masterKnex("user_business_index").where({ business_id: businessId }).delete();
      await cleanupAll({
        enquiryIds: [enquiryId],
        businessIds: [businessId],
        studentIds: [studentId, secondMemberId],
        jobIds: [jobId],
      });
    }
  });

  // ── 1b. An unconfigured business still hears about its leads ──
  await assert("a business with no email falls back to its owner rather than going unnotified", async () => {
    const studentId = await makeStudent();
    const { jobId, courseId } = await makeJobAndCourse("Fallback Subject");
    const businessId = await makeBusiness();
    await masterKnex("businesses").where({ id: businessId }).update({ email: null });
    const enquiryId = await makeEnquiry(studentId, courseId);
    try {
      const distId = await makeDistribution(enquiryId, businessId);
      const business = await masterKnex("businesses").where({ id: businessId }).first("owner_id");
      const owner = await masterKnex("platform_users").where({ id: business.owner_id }).first("email");
      await emailQueueService.enqueueDistributionEmails(enquiryId, distId, businessId);

      const rows = await masterKnex("enquiry_email_queue").where({ distribution_id: distId });
      eq(rows.length, 1, "still exactly one row");
      eq(rows[0].recipient_email, owner.email, "falls back to the owner's address");
    } finally {
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

  // ── 5. New-enquiry notices are queued only — never sent on the request path ──
  await assert("enqueuing enquiry_distributed sends nothing inline and leaves the row pending", async () => {
    const studentId = await makeStudent();
    const { jobId, courseId } = await makeJobAndCourse("Deferred Subject");
    const businessId = await makeBusiness();
    const enquiryId = await makeEnquiry(studentId, courseId);
    try {
      const distId = await makeDistribution(enquiryId, businessId);
      await addTeamMember(businessId, studentId);
      const inbox = await businessInbox(businessId);

      await withCapturedMail(async (sent) => {
        await emailQueueService.enqueueDistributionEmails(enquiryId, distId, businessId);
        eq(sent.filter((m) => m.to === inbox).length, 0, "nothing sent at enqueue time");
      });

      const rows = await masterKnex("enquiry_email_queue").where({ distribution_id: distId });
      eq(rows.length, 1, "the row was still queued");
      eq(rows[0].status, "pending", "row waits for the digest window");
    } finally {
      await masterKnex("user_business_index").where({ business_id: businessId }).delete();
      await cleanupAll({ enquiryIds: [enquiryId], businessIds: [businessId], studentIds: [studentId], jobIds: [jobId] });
    }
  });

  // ── 6. The point of the feature: N enquiries in one window -> ONE mail ──
  await assert("three enquiries in one window produce a single summary email", async () => {
    const studentId = await makeStudent();
    const { jobId, courseId } = await makeJobAndCourse("Digest Subject");
    const businessId = await makeBusiness();
    const enquiryIds: string[] = [];
    try {
      await addTeamMember(businessId, studentId);
      const inbox = await businessInbox(businessId);

      for (let i = 0; i < 3; i++) {
        const enquiryId = await makeEnquiry(studentId, courseId);
        enquiryIds.push(enquiryId);
        const distId = await makeDistribution(enquiryId, businessId);
        await emailQueueService.enqueueDistributionEmails(enquiryId, distId, businessId);
      }

      const pending = await masterKnex("enquiry_email_queue").whereIn("enquiry_id", enquiryIds);
      eq(pending.length, 3, "three rows queued, one per enquiry");

      const mine = await withCapturedMail(async (sent) => {
        await sweepWithWindow(0);
        return sent.filter((m) => m.to === inbox);
      });

      eq(mine.length, 1, "three enquiries collapsed into one email");
      eq(mine[0].subject, "3 new student enquiries", "summary subject names the count");

      // Every enquiry is accounted for by name — the promise the summary makes. There is no
      // per-card link any more; the one CTA opens the inbox where they are all actionable.
      const courses = await masterKnex("superadmin.extraction_courses as c")
        .join("enquiries as e", "e.course_id", "c.id")
        .whereIn("e.id", enquiryIds)
        .pluck("c.name");
      for (const name of courses) {
        if (!mine[0].html?.includes(name)) throw new Error(`summary is missing enquiry for "${name}"`);
      }
      if (!mine[0].html?.includes("Open your inbox")) throw new Error("summary has no primary CTA");
      if (mine[0].html?.includes("localhost:3000")) {
        throw new Error("summary links point at the API origin instead of the web app");
      }

      const after = await masterKnex("enquiry_email_queue").whereIn("enquiry_id", enquiryIds);
      eq(after.filter((r: any) => r.status === "sent").length, 3, "all three rows resolved by the one send");
    } finally {
      await masterKnex("user_business_index").where({ business_id: businessId }).delete();
      await cleanupAll({ enquiryIds, businessIds: [businessId], studentIds: [studentId], jobIds: [jobId] });
    }
  });

  // ── 7. Nothing leaves before the window has elapsed ──
  await assert("a group younger than the window is not sent", async () => {
    const studentId = await makeStudent();
    const { jobId, courseId } = await makeJobAndCourse("Unripe Subject");
    const businessId = await makeBusiness();
    const enquiryId = await makeEnquiry(studentId, courseId);
    try {
      const distId = await makeDistribution(enquiryId, businessId);
      await addTeamMember(businessId, studentId);
      const inbox = await businessInbox(businessId);
      await emailQueueService.enqueueDistributionEmails(enquiryId, distId, businessId);

      const mine = await withCapturedMail(async (sent) => {
        await sweepWithWindow(5 * 60_000);
        return sent.filter((m) => m.to === inbox);
      });

      eq(mine.length, 0, "row is younger than 5 minutes, so nothing is sent");
      const row = await masterKnex("enquiry_email_queue").where({ distribution_id: distId }).first();
      eq(row.status, "pending", "row still waiting");
    } finally {
      await masterKnex("user_business_index").where({ business_id: businessId }).delete();
      await cleanupAll({ enquiryIds: [enquiryId], businessIds: [businessId], studentIds: [studentId], jobIds: [jobId] });
    }
  });

  // ── 8. A window of exactly one still reads as the single-enquiry mail ──
  await assert("a group of one renders the single-enquiry template, not a one-item list", async () => {
    const studentId = await makeStudent();
    const { jobId, courseId } = await makeJobAndCourse("Solo Subject");
    const businessId = await makeBusiness();
    const enquiryId = await makeEnquiry(studentId, courseId);
    try {
      const distId = await makeDistribution(enquiryId, businessId);
      await addTeamMember(businessId, studentId);
      const inbox = await businessInbox(businessId);
      await emailQueueService.enqueueDistributionEmails(enquiryId, distId, businessId);

      const mine = await withCapturedMail(async (sent) => {
        await sweepWithWindow(0);
        return sent.filter((m) => m.to === inbox);
      });

      eq(mine.length, 1, "one email");
      if (!mine[0].subject.startsWith("New student enquiry")) {
        throw new Error(`expected the single-enquiry subject, got '${mine[0].subject}'`);
      }
      if (!mine[0].html?.includes(`/business/enquiries/${distId}/student`)) {
        throw new Error("single-enquiry mail should deep-link to the distribution");
      }
    } finally {
      await masterKnex("user_business_index").where({ business_id: businessId }).delete();
      await cleanupAll({ enquiryIds: [enquiryId], businessIds: [businessId], studentIds: [studentId], jobIds: [jobId] });
    }
  });

  // ── 9. Two sweeps at once must not both send the same summary ──
  // This is the case the SKIP LOCKED claim protocol exists for: a digest resolves N rows
  // with ONE message, so a lost race means a duplicate summary, not just wasted work.
  await assert("concurrent sweeps send the summary exactly once", async () => {
    const studentId = await makeStudent();
    const { jobId, courseId } = await makeJobAndCourse("Race Subject");
    const businessId = await makeBusiness();
    const enquiryIds: string[] = [];
    try {
      await addTeamMember(businessId, studentId);
      const inbox = await businessInbox(businessId);

      for (let i = 0; i < 2; i++) {
        const enquiryId = await makeEnquiry(studentId, courseId);
        enquiryIds.push(enquiryId);
        const distId = await makeDistribution(enquiryId, businessId);
        await emailQueueService.enqueueDistributionEmails(enquiryId, distId, businessId);
      }

      const mine = await withCapturedMail(async (sent) => {
        await Promise.all([sweepWithWindow(0), sweepWithWindow(0)]);
        return sent.filter((m) => m.to === inbox);
      });

      eq(mine.length, 1, "two concurrent sweeps still send one summary");
      const after = await masterKnex("enquiry_email_queue").whereIn("enquiry_id", enquiryIds);
      eq(after.filter((r: any) => r.status === "sent").length, 2, "both rows resolved exactly once");
    } finally {
      await masterKnex("user_business_index").where({ business_id: businessId }).delete();
      await cleanupAll({ enquiryIds, businessIds: [businessId], studentIds: [studentId], jobIds: [jobId] });
    }
  });

  // ── 9b. A group BIGGER than one digest must still not split across overlapping sweeps ──
  // Row-level SKIP LOCKED does not cover this on its own: past the cap there are unlocked rows
  // left over, so a second sweep claims those and mails a separate summary for the same window.
  // The group-level advisory lock in claimGroup is what makes this one mail.
  await assert("a group larger than the digest cap still yields one summary per sweep", async () => {
    const studentId = await makeStudent();
    const { jobId, courseId } = await makeJobAndCourse("Cap Race Subject");
    const businessId = await makeBusiness();
    const enquiryIds: string[] = [];
    try {
      const inbox = await businessInbox(businessId);
      for (let i = 0; i < 5; i++) {
        const enquiryId = await makeEnquiry(studentId, courseId);
        enquiryIds.push(enquiryId);
        const distId = await makeDistribution(enquiryId, businessId);
        await emailQueueService.enqueueDistributionEmails(enquiryId, distId, businessId);
      }

      // Cap 2 against 5 pending rows: without the group lock the second sweep picks up rows
      // 3 and 4 and sends a second mail concurrently.
      const mine = await withDigestCap(2, () =>
        withCapturedMail(async (sent) => {
          await Promise.all([sweepWithWindow(0), sweepWithWindow(0)]);
          return sent.filter((m) => m.to === inbox);
        }),
      );

      eq(mine.length, 1, "one summary, not one per overlapping sweep");
      const rows = await masterKnex("enquiry_email_queue").whereIn("enquiry_id", enquiryIds);
      eq(rows.filter((r: any) => r.status === "sent").length, 2, "only the claimed rows were resolved");
      eq(rows.filter((r: any) => r.status === "pending").length, 3, "the surplus waits for the next sweep");
    } finally {
      await cleanupAll({ enquiryIds, businessIds: [businessId], studentIds: [studentId], jobIds: [jobId] });
    }
  });

  // ── 10. Batching must not have swallowed the student-facing mail ──
  await assert("enquiry_unlocked still sends immediately on enqueue", async () => {
    const studentId = await makeStudent();
    const { jobId, courseId } = await makeJobAndCourse("Immediate Subject");
    const businessId = await makeBusiness();
    const enquiryId = await makeEnquiry(studentId, courseId);
    try {
      // Default status: chk_enquiry_distributions_unlocked ties status='unlocked' to a non-null
      // unlocked_at, and the notification path reads the enquiry and student, never the
      // distribution's status — so there is nothing to gain from staging that state here.
      const distId = await makeDistribution(enquiryId, businessId);
      const student = await masterKnex("platform_users").where({ id: studentId }).first("email");

      const mine = await withCapturedMail(async (sent) => {
        await emailQueueService.enqueueUnlockedEmailToStudent(enquiryId, distId, "Race Test Agency", businessId);
        return sent.filter((m) => m.to === student.email);
      });

      eq(mine.length, 1, "the student hears about the unlock right away");
      const row = await masterKnex("enquiry_email_queue").where({ distribution_id: distId }).first();
      eq(row.status, "sent", "row resolved inline, not left for the digest");
    } finally {
      await cleanupAll({ enquiryIds: [enquiryId], businessIds: [businessId], studentIds: [studentId], jobIds: [jobId] });
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
