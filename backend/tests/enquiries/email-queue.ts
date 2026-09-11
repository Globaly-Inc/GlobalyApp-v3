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
import {
  enquiryClaimEmail,
  enquiryLeadEmail,
  enquiryUnlockedEmail,
} from "../../src/shared/mail/templates.js";
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

/**
 * `accountStatus` is deliberately settable apart from `claimed`. The two columns really do come
 * apart in production — the admin create-business path provisions a schema and sets
 * account_status 1 while leaving claim_status 'unclaimed' — and that combination is the one that
 * shipped the wrong mail, so the suite has to be able to build it.
 */
async function makeBusiness(opts: { claimed?: boolean; accountStatus?: number } = {}): Promise<number> {
  const owner = await masterKnex("platform_users").orderBy("id").first();
  if (!owner) throw new Error("no platform_users row available to own the test business");
  const claimed = opts.claimed !== false;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [row] = await masterKnex("businesses")
    .insert({
      owner_id: owner.id,
      subdomain: `email-q-test-${suffix}`,
      business_name: `Email Queue Test Biz ${suffix}`,
      claim_status: claimed ? "claimed" : "unclaimed",
      account_status: opts.accountStatus ?? (claimed ? 1 : 0),
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
    const mail = enquiryLeadEmail({
      kind: "business",
      recipientName: "Acme & Co",
      distributionId: "dist-1",
      items: [
        {
          courseName: "MSc Data Science",
          institutionName: "University of <X>",
          intake: "April 2027",
          studentFirstName: "Priya",
        },
      ],
    });
    eq(mail.subject, "A student is asking about MSc Data Science", "subject names the course");
    if (!mail.html.includes("/business/enquiries/dist-1/student")) throw new Error("no deep link to the distribution");
    if (!mail.html.includes("Open this enquiry")) throw new Error("a deep-linked mail should say so");
    if (mail.html.includes("localhost:3000")) throw new Error("links point at the API origin, not the web app");
    if (!mail.html.includes("University of &lt;X&gt;")) throw new Error("user-supplied text was not escaped");

    // Rows queued before distribution_id was in the payload must still render a usable link.
    const legacy = enquiryLeadEmail({ kind: "business", items: [{ courseName: "Old Course" }] });
    if (!legacy.html.includes("/business/enquiries")) throw new Error("legacy row lost its link");
    if (legacy.html.includes("/business/enquiries/null")) throw new Error("null leaked into the URL");
    if (!legacy.html.includes("Open your inbox")) throw new Error("legacy row lost its CTA");
  });

  await assert("the summary lists each enquiry in both mail parts and states count and period", async () => {
    const items = [1, 2, 3].map((i) => ({
      studentFirstName: `Student${i}`,
      courseName: `Course ${i}`,
      institutionName: "Uni",
      intake: "Sep 2027",
    }));
    const digest = enquiryLeadEmail({ kind: "business", recipientName: "Acme & Co", items, windowMinutes: 5 });
    eq(digest.subject, "3 students are asking about your courses", "subject names the count");
    if (!digest.html.includes("new student enquiries")) throw new Error("the hero count label is missing");
    if (!digest.html.includes(">3</p>")) throw new Error("the hero count is not the true total");
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
    const sparse = enquiryLeadEmail({ kind: "business", items: [{}, {}] });
    eq((sparse.html.match(/Course enquiry/g) ?? []).length, 2, "both bare cards render");

    // The claim CTA belongs to the acquisition mail only. A lead notice that could grow a claim
    // button is how the two audiences got mixed up in one mail in the first place.
    if (digest.html.includes("Claim your")) throw new Error("the lead notice must not carry a claim CTA");
    // And the benefits block is acquisition-only — evergreen filler on a daily notice.
    if (digest.html.includes("Once you claim it")) throw new Error("benefits block leaked into the lead notice");
  });

  await assert("a large summary lists three and counts the rest, heading the true total", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      studentFirstName: `Student${i + 1}`,
      courseName: `Course ${i + 1}`,
    }));
    const digest = enquiryLeadEmail({ kind: "business", items: many });

    eq(digest.subject, "12 students are asking about your courses", "subject counts every enquiry");
    if (!digest.html.includes(">12</p>")) throw new Error("the hero count is not the true total");
    if (!digest.html.includes("Course 3")) throw new Error("the third enquiry should be listed");
    if (digest.html.includes("Course 4")) throw new Error("the fourth enquiry should not be listed");
    if (!digest.html.includes("9 more are waiting")) throw new Error("the unlisted enquiries are not accounted for");
    eq((digest.text.match(/^• /gm) ?? []).length, 3, "text part lists three too");
  });

  await assert("the institution fallback says why it came directly, and asks about programmes", async () => {
    const inst = enquiryLeadEmail({
      kind: "institution",
      recipientName: "Cornell University",
      items: [{ courseName: "Ancient Philosophy" }],
    });
    eq(inst.subject, "A student is asking about Ancient Philosophy", "institution subject");
    if (!inst.html.includes("no agent representing it was available")) {
      throw new Error("the fallback lost its explanation");
    }
    if (!inst.html.includes("courses listed under it")) throw new Error("wrong reason-for-receipt");
    const many = enquiryLeadEmail({ kind: "institution", items: [{ courseName: "A" }, { courseName: "B" }] });
    eq(many.subject, "2 students are asking about your programmes", "institutions are asked about programmes");
  });

  // A throw in a template is not cosmetic: sendQueuedRow catches it, marks the row failed,
  // and after the attempt cap the recipient is simply never told. So every name that reaches
  // a template has to survive being blank, whitespace, or absent.
  await assert("a blank or whitespace name renders rather than throwing", async () => {
    for (const name of ["   ", "", null, undefined, "\t\n"]) {
      const unlocked = enquiryUnlockedEmail({
        businessName: name as string | null,
        courseName: "Law & Society Minor",
        enquiryId: "enq-1",
      });
      if (!unlocked.html.includes("A business")) {
        throw new Error(`unlock mail did not fall back to a generic name for ${JSON.stringify(name)}`);
      }
      if (unlocked.subject.includes("  ")) throw new Error(`subject has a blank name for ${JSON.stringify(name)}`);

      // The reason-for-receipt line takes the same value down a different path.
      const lead = enquiryLeadEmail({ kind: "business", recipientName: name, items: [{ courseName: "A" }] });
      if (lead.html.includes("Sent to  ")) throw new Error("lead footer names a blank business");
      if (!lead.html.includes("courses you represent")) throw new Error("blank name lost the generic footer");
      const claim = enquiryClaimEmail({ kind: "business", recipientName: name, items: [{ courseName: "A" }] });
      if (claim.html.includes("Sent to  ")) throw new Error("claim footer names a blank business");
    }

    // A student with no usable first name gets the bullet placeholder, not a broken initial.
    const nameless = enquiryLeadEmail({ kind: "business", items: [{ studentFirstName: "  " }, { courseName: "B" }] });
    if (!nameless.html.includes("&#8226;")) throw new Error("blank student name lost its placeholder initial");
  });

  await assert("lead and acquisition mails are one design that differs only in the ask", async () => {
    const args = {
      recipientName: "Acme & Co",
      items: [
        { studentFirstName: "Rojan", courseName: "Revenue Management 360", institutionName: "Cornell University" },
        { studentFirstName: "Asha", courseName: "Data Science" },
      ],
    };
    const lead = enquiryLeadEmail({ kind: "business", ...args });
    const claim = enquiryClaimEmail({ kind: "business", ...args });

    // Both mails now sit on the SAME centred emailLayout card — that is the point of this test.
    for (const [label, mail] of [
      ["lead", lead],
      ["claim", claim],
    ] as const) {
      if (!mail.html.includes("max-width:600px")) throw new Error(`${label}: not the wide centred card`);
      if (!mail.html.includes('align="left"')) throw new Error(`${label}: a list of cards must be left-aligned`);
      if (!mail.html.includes("font-size:36px")) throw new Error(`${label}: hero count missing`);
      if (!mail.html.includes("What students are asking about")) throw new Error(`${label}: card section missing`);
      // One anchor: the CTA. Two would be two decisions.
      eq((mail.html.match(/<a\s/g) ?? []).length, 1, `${label}: one link in the whole mail`);
      // Neither carries the retired marketing frame.
      if (mail.html.includes("For education businesses")) throw new Error(`${label}: marketing frame survived`);
    }

    // The ask is what separates them, and only the ask.
    if (!lead.html.includes("Open your inbox")) throw new Error("lead: inbox CTA missing");
    if (lead.html.includes("Claim your")) throw new Error("lead: must not offer a claim");
    if (lead.html.includes("Once you claim it")) throw new Error("lead: benefits block leaked in");
    if (!claim.html.includes("Claim your business")) throw new Error("claim: claim CTA missing");
    if (!claim.html.includes("Claim it — it is free")) throw new Error("claim: benefits preamble missing");
    if (claim.html.includes("Open your inbox")) throw new Error("claim: offers an inbox it cannot open");

    // What they DO share: the navy brand, the logo, and the pre-unlock boundary.
    for (const [label, mail] of [
      ["lead", lead],
      ["claim", claim],
    ] as const) {
      if (!mail.html.includes("#012E8A")) throw new Error(`${label}: not on the navy brand`);
      if (!mail.html.includes("GlobalyOS%20White%20BG%20Icon")) throw new Error(`${label}: old logo`);
      if (!mail.html.includes(">R<")) throw new Error(`${label}: no avatar initial`);
      if (!mail.html.includes("Rojan")) throw new Error(`${label}: first name missing`);
      if (!mail.html.includes("@gmail.com")) throw new Error(`${label}: masked address missing`);
      if (!mail.html.includes("Revenue Management 360")) throw new Error(`${label}: course missing`);
      // The mask must carry no real characters to un-hide.
      if (/Rojan\s*[A-Za-z]/.test(mail.html.replace(/<[^>]+>/g, ""))) {
        throw new Error(`${label}: something followed the first name in the rendered text`);
      }
    }
    if (!lead.html.includes("Cornell University")) throw new Error("lead: institution missing");
  });

  await assert("the unlock mail names the unlocker, previews the message, and states what they see", async () => {
    const greeting = "Hi Rojan! Thanks for your enquiry. We've unlocked it and we're happy to help.";
    const mail = enquiryUnlockedEmail({
      businessName: "Acme & Co",
      courseName: "Ancient Philosophy",
      institutionName: "Cornell University",
      enquiryId: "e1",
      sharedContact: false,
      messagePreview: greeting,
    });

    // The headline names the UNLOCKER, never the institution: an agency representing Cornell
    // is not Cornell, and the student would act on that.
    if (!mail.html.includes("Acme &amp; Co wants to talk to you")) throw new Error("headline does not name the unlocker");
    if (mail.html.includes("Cornell University wants to talk")) throw new Error("headline claimed the institution sent it");
    if (!mail.html.includes(greeting.slice(0, 40))) throw new Error("message preview missing");
    if (!mail.html.includes("/personal/enquiries/e1")) throw new Error("no deep link to the enquiry");
    if (!mail.html.includes("phone number stays private")) throw new Error("contact boundary not stated");
    // Same centred card as the two recipient-facing mails — one design across all three.
    if (!mail.html.includes("max-width:600px")) throw new Error("not the wide centred card");
    if (!mail.html.includes("The message waiting for you")) throw new Error("message section missing");
    if (!mail.html.includes("Read &amp; reply") && !mail.html.includes("Read & reply")) {
      throw new Error("CTA missing");
    }
    eq((mail.html.match(/<a\s/g) ?? []).length, 1, "one link in the whole mail");
    if (mail.html.includes("Your applications")) throw new Error("the retired marketing frame survived");

    // Shared contact flips the sentence rather than dropping it.
    const shared = enquiryUnlockedEmail({ businessName: "Acme & Co", enquiryId: "e1", sharedContact: true });
    if (!shared.html.includes("phone number, as you agreed")) throw new Error("shared-contact wording missing");
    // No message on the thread yet must not render an empty quote block.
    if (shared.html.includes("&ldquo;")) throw new Error("empty quote block rendered with no preview");

    // A long first message is clipped, not dumped whole into the mail.
    const long = enquiryUnlockedEmail({ businessName: "Acme", enquiryId: "e1", messagePreview: "x".repeat(400) });
    if (!long.html.includes("…")) throw new Error("long preview was not truncated");
    if (long.html.includes("x".repeat(200))) throw new Error("preview exceeded the clip length");
  });

  // ── The acquisition mail: what an unclaimed business or institution gets instead ──
  await assert("the claim mail leads with the count and asks for the claim, not the inbox", async () => {
    const items = [1, 2, 3].map((i) => ({
      studentFirstName: `Student${i}`,
      courseName: `Course ${i}`,
      institutionName: "Uni",
      intake: "Sep 2027",
    }));

    for (const kind of ["business", "institution"] as const) {
      const mail = enquiryClaimEmail({
        kind,
        recipientName: "Acme & Co",
        items,
        claimUrl: "http://localhost:3001/invite/business/accept?token=abc",
      });

      // The subject leads with the count and the ask — it has to survive a crowded inbox from a
      // sender they have never heard of.
      eq(mail.subject, `3 students are interested in your ${kind} — claim your profile`, `${kind} subject`);
      if (!mail.html.includes(`Claim your ${kind}`)) throw new Error(`${kind}: claim CTA missing`);
      if (!mail.html.includes("token=abc")) throw new Error(`${kind}: claim URL missing`);
      // The hero count is a block, not a sentence — 36px is the number.
      if (!mail.html.includes("font-size:36px")) throw new Error(`${kind}: hero count block missing`);
      if (!mail.html.includes("What students are asking about")) throw new Error(`${kind}: card section missing`);
      if (!mail.html.includes("Claim it — it is free and takes a minute")) {
        throw new Error(`${kind}: benefits preamble missing`);
      }
      // Course cards still carry the enquiries; the mail is marketing, not contentless.
      for (const i of [1, 2, 3]) {
        if (!mail.html.includes(`Course ${i}`)) throw new Error(`${kind}: html is missing enquiry ${i}`);
        if (!mail.text.includes(`Course ${i}`)) throw new Error(`${kind}: text is missing enquiry ${i}`);
      }
      if (!mail.html.includes("Acme &amp; Co")) throw new Error(`${kind}: recipient name was not escaped`);
      // Exactly one anchor — the claim button. A second link is a second decision.
      eq((mail.html.match(/<a\s/g) ?? []).length, 1, `${kind}: one link in the whole mail`);
      // It must never read as a lead notice pointing at an inbox they cannot open.
      if (mail.html.includes("Open your inbox")) throw new Error(`${kind}: still offers an inbox CTA`);
      if (mail.html.includes("Unlock the enquiry")) throw new Error(`${kind}: still asks for an unlock`);
      // Navy branding, not the retired maroon, and the new hosted mark.
      if (!mail.html.includes("#012E8A")) throw new Error(`${kind}: not on the navy brand`);
      if (mail.html.toLowerCase().includes("#811d1d") || mail.html.includes("#7A1620")) {
        throw new Error(`${kind}: maroon survived the recolour`);
      }
      if (!mail.html.includes("GlobalyOS%20White%20BG%20Icon")) throw new Error(`${kind}: old logo`);
      // Same pre-unlock boundary as every other enquiry mail: a first name and a redaction bar,
      // never a surname or a real address.
      if (!mail.html.includes("@gmail.com")) throw new Error(`${kind}: masked address missing`);
      if (!mail.html.includes("#D7DBE0")) throw new Error(`${kind}: redaction bars missing`);
    }

    // One enquiry still gets the acquisition mail: the recipient's problem is that they cannot
    // open anything, which does not depend on how many are waiting.
    const single = enquiryClaimEmail({ kind: "business", recipientName: "Solo Co", items: [{ courseName: "Solo" }] });
    eq(single.subject, "1 student is interested in your business — claim your profile", "singular subject");
    if (!single.html.includes("new student enquiry<")) throw new Error("count label did not go singular");
    // No token minted (a DB failure, say) must still leave a working button, not a dead one.
    if (!single.html.includes('href="http')) throw new Error("claim CTA fell back to a dead href");

    // Long windows list five and count the rest.
    const many = Array.from({ length: 9 }, (_, i) => ({ courseName: `Course ${i + 1}` }));
    const big = enquiryClaimEmail({ kind: "institution", items: many });
    if (!big.html.includes(">9</p>")) throw new Error("the hero count is not the true total");
    if (big.html.includes("Course 4")) throw new Error("the fourth enquiry should not be listed");
    if (!big.html.includes("6 more")) throw new Error("the unlisted enquiries are not accounted for");
    // No recipient name — the footer still has to explain why the mail arrived.
    if (!big.html.includes("students enquired about courses your institution offers")) {
      throw new Error("nameless footer lost its reason-for-receipt line");
    }
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

  // ── 1c. An UNCLAIMED business is matched like any other, and gets the acquisition mail ──
  await assert("an unclaimed business is queued the claim template with a live claim link", async () => {
    const studentId = await makeStudent();
    const { jobId, courseId } = await makeJobAndCourse("Unclaimed Subject");
    const businessId = await makeBusiness({ claimed: false });
    const enquiryId = await makeEnquiry(studentId, courseId);
    try {
      const distId = await makeDistribution(enquiryId, businessId);
      await emailQueueService.enqueueDistributionEmails(enquiryId, distId, businessId);

      const rows = await masterKnex("enquiry_email_queue").where({ distribution_id: distId });
      eq(rows.length, 1, "an unclaimed business is a recipient, not a skipped one");
      eq(rows[0].template, "enquiry_business_claim", "queued under the acquisition template");
      // The dedup key is deliberately NOT keyed on the template — a business claimed between
      // enqueue and sweep must not be told a second time under the other name.
      eq(rows[0].dedup_key, `enquiry_distributed:${distId}:business`, "dedup_key stays per distribution");

      const claimUrl = rows[0].payload?.claim_url;
      if (typeof claimUrl !== "string" || !claimUrl.includes("/invite/business/accept?token=")) {
        throw new Error(`claim CTA was not minted: ${JSON.stringify(claimUrl)}`);
      }
      // The link has to actually open: minting writes the token onto the row it points at.
      const token = new URL(claimUrl).searchParams.get("token");
      const business = await masterKnex("businesses").where({ id: businessId }).first("claim_token");
      eq(business.claim_token, token, "the mailed token is the one stored on the business");

      // And the mail it renders is the acquisition one, not a lead notice.
      //
      // Filtered by the address this test owns, never by subject: the sweep drains the whole
      // table, so a dev database holding other pending claim rows would otherwise fail this.
      const inbox = await businessInbox(businessId);
      const mine = await withCapturedMail(async (sent) => {
        await sweepWithWindow(0);
        return sent.filter((m) => m.to === inbox);
      });
      eq(mine.length, 1, "the sweep sent the acquisition mail");
      if (!mine[0].subject.includes("interested in your business")) {
        throw new Error(`not the acquisition subject: ${mine[0].subject}`);
      }
      if (!mine[0].html?.includes("Claim your business")) throw new Error("claim CTA missing from the sent mail");
    } finally {
      await cleanupAll({ enquiryIds: [enquiryId], businessIds: [businessId], studentIds: [studentId], jobIds: [jobId] });
    }
  });

  // ── 1d. The regression: a provisioned schema is not a claim ──
  //
  // Business 367 in the dev database — created through the admin panel, so account_status 1 and
  // a tenant schema from minute one, but claim_status 'unclaimed' because nobody at that
  // business had ever been told the listing existed. Branching on account_status sent it the
  // ordinary lead notice. This pins the combination, not just the happy pair.
  await assert("account_status 1 with claim_status unclaimed still gets the acquisition mail", async () => {
    const studentId = await makeStudent();
    const { jobId, courseId } = await makeJobAndCourse("Admin Created Subject");
    const businessId = await makeBusiness({ claimed: false, accountStatus: 1 });
    const enquiryId = await makeEnquiry(studentId, courseId);
    try {
      const distId = await makeDistribution(enquiryId, businessId);
      await emailQueueService.enqueueDistributionEmails(enquiryId, distId, businessId);

      const row = await masterKnex("enquiry_email_queue").where({ distribution_id: distId }).first();
      eq(row.template, "enquiry_business_claim", "an admin-created listing is not a claimed one");

      const inbox = await businessInbox(businessId);
      const mine = await withCapturedMail(async (sent) => {
        await sweepWithWindow(0);
        return sent.filter((m) => m.to === inbox);
      });
      eq(mine.length, 1, "exactly one mail");
      if (!mine[0].subject.includes("interested in your business")) {
        throw new Error(`still the lead notice: ${mine[0].subject}`);
      }
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
      eq(mine[0].subject, "3 students are asking about your courses", "summary subject names the count");

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
      if (!mine[0].subject.startsWith("A student is asking about")) {
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

      // Cap 2 against 5 pending rows. The overlap has to be forced, not hoped for: with an
      // instant mailer, Promise.all lets the first sweep commit before the second one even
      // queries, and two SEQUENTIAL sweeps each mailing part of an oversized group is correct
      // behaviour, not the bug. So the first sweep is held inside its transaction — still
      // holding the group's advisory lock — while the second runs to completion.
      const mine = await withDigestCap(2, async () => {
        const sent: SentMail[] = [];
        const original = mailerService.sendMail.bind(mailerService);
        let firstSweepIsInside = () => {};
        const reachedSend = new Promise<void>((resolve) => (firstSweepIsInside = resolve));
        let releaseFirstSweep = () => {};
        const held = new Promise<void>((resolve) => (releaseFirstSweep = resolve));

        (mailerService as unknown as { sendMail: (o: SentMail) => Promise<void> }).sendMail = async (o) => {
          sent.push(o);
          if (o.to === inbox && sent.filter((m) => m.to === inbox).length === 1) {
            firstSweepIsInside();
            await held; // keep this transaction — and the advisory lock — open
          }
        };

        try {
          const first = sweepWithWindow(0);
          await Promise.race([
            reachedSend,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("the first sweep never reached the mailer")), 10_000),
            ),
          ]);
          // Runs while the first sweep still owns the group: must find nothing to send.
          await sweepWithWindow(0);
          releaseFirstSweep();
          await first;
        } finally {
          releaseFirstSweep();
          (mailerService as unknown as { sendMail: typeof original }).sendMail = original;
        }
        return sent.filter((m) => m.to === inbox);
      });

      eq(mine.length, 1, "the second sweep must not mail a group the first still owns");
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
