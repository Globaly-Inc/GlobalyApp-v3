// Email queue service (Phase 8, PRD §17/§26/§32).
//
// Durable outbox: every notification is inserted into `enquiry_email_queue`
// with a `dedup_key` before any send is attempted, and the UNIQUE constraint
// on that column is the single source of truth for "never sent twice" — not
// an in-memory check. `enqueue()` itself never throws on a dedup collision;
// the caller (matching/accept) doesn't need to know or care whether this is
// the first or the Nth attempt to fire the same event.
//
// Sending policy: new-enquiry notices are BATCHED into a 5-minute summary; every
// other template still sends inline the moment it's queued.
//
// The old policy was "immediate if idle, else batched", which never held under
// load — one enquiry fans out to every member of every matched business, so a
// burst of 100 enquiries meant ~800 messages, sent serially behind a 1.2s
// throttle, most of them rejected by the provider for rate. Now a row for one of
// the four new-enquiry templates (see TEMPLATE) is only inserted;
// `sweepDigests()` (driven by enquiry-email.worker.ts) later collects everything
// pending for one recipient and sends ONE mail listing all of it.
//
// Who gets mailed is decided by matching, never here: claimed and unclaimed,
// verified and unverified recipients are all eligible. `claim_status` picks the
// TEMPLATE — a lead notice for a recipient someone has taken ownership of, an
// acquisition mail with a claim CTA for one nobody has — and reachability (a
// deliverable address) is the only thing that can stop a mail being queued at all.
// Do not reach for `account_status` here: it says a schema exists, not that a
// human agreed to work the leads. See resolveBusinessRecipients.
//
// The window is tumbling, keyed on the oldest pending row in a
// (recipient_email, template) group — see findReadyDigestGroups. Grouping on the
// address rather than the business is deliberate: someone who belongs to two
// matched businesses gets one mail, not two.
//
// schema.enquiry_email_queue has no `max_attempts` column (see the migration)
// — the cap is an application constant, not app-configurable-per-row.

import { masterKnex } from "../../../core/db/master-pool.js";
import { config } from "../../../config.js";
import { mailerService } from "../../../shared/mail/mailerService.js";
import {
  emailLayout,
  enquiryClaimEmail,
  enquiryLeadEmail,
  enquiryUnlockedEmail,
  type DigestItem,
} from "../../../shared/mail/templates.js";
import { mintInstitutionClaimUrl } from "../../platform-users/services/institution-claim.service.js";
import { mintBusinessClaimUrl } from "../../businesses/services/businesses.service.js";
import { createChildLogger } from "../../../shared/logger.js";
import * as emailQueueRepo from "../repositories/email-queue.repository.js";

const logger = createChildLogger("enquiry-email-queue");

export const MAX_ATTEMPTS = Number(process.env.ENQUIRY_EMAIL_MAX_ATTEMPTS) || 5;

/**
 * The four new-enquiry notices, one per (recipient kind × claimed state).
 *
 * The claimed/unclaimed split is a TEMPLATE split rather than a flag inside one template, and
 * that is load-bearing rather than stylistic: summaries are grouped by (template,
 * recipient_email), so two template names is what keeps a claimed recipient's lead notice and an
 * unclaimed one's acquisition mail out of the same digest. A single template with an `is_claimed`
 * payload flag would put both kinds of row in one group and force the digest to pick one voice
 * for a mixed batch — which is exactly the case that arises when one address owns a claimed
 * listing and an unclaimed one.
 */
export const TEMPLATE = {
  /** Matched business, claimed: the ordinary lead notice. */
  BUSINESS: "enquiry_distributed",
  /** Matched business, unclaimed: the acquisition mail with a claim CTA. */
  BUSINESS_CLAIM: "enquiry_business_claim",
  /** Fallback institution, claimed. */
  INSTITUTION: "enquiry_institution_fallback",
  /** Fallback institution, unclaimed. */
  INSTITUTION_CLAIM: "enquiry_institution_claim",
} as const;

/**
 * Templates that wait for a summary instead of sending on enqueue. These are the four
 * high-fan-out new-enquiry notices; `enquiry_unlocked` goes to the student, is one per
 * unlock, and is time-sensitive, so it stays immediate.
 *
 * Read at call time rather than captured, so a test can widen the window without
 * reloading the module.
 */
export const BATCHED_TEMPLATES: string[] = [
  TEMPLATE.BUSINESS,
  TEMPLATE.BUSINESS_CLAIM,
  TEMPLATE.INSTITUTION,
  TEMPLATE.INSTITUTION_CLAIM,
];

/**
 * Is this address worth queuing a message for?
 *
 * `.invalid` is RFC 2606 reserved and can never resolve, and promote deliberately mints owner
 * placeholders on `unclaimed.globalyhub.invalid` when extraction found no contact at all. Queuing
 * one produced a guaranteed bounce, five retry attempts, and a `failed` row that read like an
 * outage — while the institution path had guarded the identical case since it was written. The
 * rule is the general one rather than that one domain, so the next placeholder scheme is covered
 * without a second look.
 */
function deliverable(email: string | null | undefined): email is string {
  const trimmed = email?.trim();
  return !!trimmed && !/\.invalid$/i.test(trimmed);
}

const windowMs = () => Number(process.env.ENQUIRY_EMAIL_WINDOW_MS ?? 5 * 60_000);

/**
 * Most enquiries ONE summary may account for. Not how many it prints — the template lists the
 * five most recent and counts the rest (see enquiryDigestEmail), so this only bounds how many
 * rows a single transaction claims and resolves.
 *
 * Beyond it, the surplus stays `pending`; its group is already past the window, so the next
 * poll sends a second summary. A recipient with 500 enquiries in one window therefore gets a
 * handful of mails rather than 500, each honestly counting what it covers.
 *
 * ponytail: a flat cap. If a single recipient's backlog starts starving the others in the
 * group list, the upgrade is a per-recipient rate limit, not a bigger number here.
 */
const digestCap = () => Number(process.env.ENQUIRY_EMAIL_DIGEST_CAP) || 50;

/**
 * How much one sweep takes on: recipients to summarise, and single rows to retry. Distinct
 * from digestCap — that one bounds a single mail's length, this one bounds a single pass.
 */
const batchCap = () => Number(process.env.ENQUIRY_EMAIL_BATCH_CAP) || 200;

interface EnqueueOpts {
  dedupKey: string;
  template: string;
  payload?: Record<string, unknown>;
  recipientEmail: string;
  enquiryId?: string | null;
  distributionId?: string | null;
  businessId?: number | null;
  recipientUserId?: number | null;
}

export async function enqueue(opts: EnqueueOpts) {
  const row = await emailQueueRepo.insertIgnoreDup({
    enquiry_id: opts.enquiryId ?? null,
    distribution_id: opts.distributionId ?? null,
    business_id: opts.businessId ?? null,
    recipient_user_id: opts.recipientUserId ?? null,
    recipient_email: opts.recipientEmail,
    template: opts.template,
    payload: opts.payload ?? {},
    dedup_key: opts.dedupKey,
  });

  if (!row) {
    // dedup_key already existed — this event was already queued/sent. No-op, no error.
    logger.info("Skipped duplicate enqueue", { dedupKey: opts.dedupKey });
    return null;
  }

  // Batched templates are queued and nothing more — sweepDigests() owns them from here.
  // Everything else sends inline, as it always did.
  //
  // This makes delivery of new-enquiry notices a HARD dependency on the enquiry-email worker
  // actually running (`npm run job:enquiry-email` — the enquiry-email-worker Compose service,
  // and worker-enquiry-email.yml in the GitOps repo). There is no inline fallback left: if
  // nothing sweeps, these rows sit `pending` forever and no business hears about its leads.
  if (!BATCHED_TEMPLATES.includes(opts.template)) {
    await sendQueuedRow(row.id);
  }

  return row;
}

/**
 * Renders a queued row through the shared mail templates, so an enquiry notification looks
 * like the OTP and invitation mails rather than a debug dump. Both parts come back: text-only
 * clients and spam filters both want the plain one.
 *
 * Old rows are safe to render — every field the templates read is optional, so a payload
 * queued before a field existed just renders without that line.
 */
function renderEmail(
  template: string,
  payload: Record<string, unknown>,
): { subject: string; text: string; html: string } {
  const str = (key: string) => (payload[key] as string | null) ?? null;

  switch (template) {
    case TEMPLATE.BUSINESS:
    case TEMPLATE.INSTITUTION:
      return enquiryLeadEmail({
        kind: template === TEMPLATE.INSTITUTION ? "institution" : "business",
        recipientName: str("business_name") ?? str("institution_name"),
        items: [digestItemOf(payload)],
        distributionId: str("distribution_id"),
        windowMinutes: Math.max(1, Math.round(windowMs() / 60_000)),
      });
    // A window holding exactly one enquiry still renders the acquisition mail, not a lead
    // notice: the recipient's problem is that they cannot open anything, and that is
    // independent of how many enquiries are waiting.
    case TEMPLATE.BUSINESS_CLAIM:
    case TEMPLATE.INSTITUTION_CLAIM:
      return enquiryClaimEmail({
        kind: template === TEMPLATE.INSTITUTION_CLAIM ? "institution" : "business",
        recipientName: str("business_name") ?? str("institution_name"),
        items: [digestItemOf(payload)],
        claimUrl: str("claim_url"),
        windowMinutes: Math.max(1, Math.round(windowMs() / 60_000)),
      });
    case "enquiry_unlocked":
      return enquiryUnlockedEmail({
        businessName: str("business_name"),
        courseName: str("course_name"),
        institutionName: str("institution_name"),
        enquiryId: str("enquiry_id"),
        sharedContact: payload.shared_contact === true,
        messagePreview: str("message_preview"),
      });
    default: {
      // WEB_APP_URL, not APP_URL: the latter is this API's own origin, so a recipient
      // clicking it lands on the API rather than the app.
      const href = `${config.WEB_APP_URL.replace(/\/$/, "")}/business/enquiries`;
      return {
        subject: "Enquiry update",
        text: `You have an enquiry update. View enquiries → ${href}`,
        html: emailLayout({
          heading: "Enquiry update",
          body: `<p style="margin:0">There's an update waiting on one of your enquiries.</p>`,
          cta: { label: "View enquiries", href },
        }),
      };
    }
  }
}

/**
 * One mail for a whole group. A group of exactly one renders as the normal single-enquiry
 * mail — a one-item list reads as bureaucracy where the single template reads as news.
 */
function renderDigest(
  template: string,
  rows: emailQueueRepo.QueueRow[],
): { subject: string; text: string; html: string } {
  if (rows.length === 1) return renderEmail(template, rows[0].payload ?? {});

  const str = (p: Record<string, unknown>, key: string) => (p[key] as string | null) ?? null;
  const payloadOf = (row: emailQueueRepo.QueueRow) => (row.payload ?? {}) as Record<string, unknown>;

  // Every row goes in: the templates print the first five and count the rest, so the heading's
  // number is the true size of this window.
  const items: DigestItem[] = rows.map((row) => digestItemOf(payloadOf(row)));
  const windowMinutes = Math.max(1, Math.round(windowMs() / 60_000));
  const first = payloadOf(rows[0]);

  if (template === TEMPLATE.BUSINESS_CLAIM || template === TEMPLATE.INSTITUTION_CLAIM) {
    // `claimGroup` orders by created_at ASC, so the LAST row carries the newest token — and
    // `setClaimPending` overwrites, so the newest is the only one that still opens. Reading any
    // other row's link would hand the recipient a button that was spent by the enquiry after it.
    const newest = payloadOf(rows[rows.length - 1]);
    return enquiryClaimEmail({
      kind: template === TEMPLATE.INSTITUTION_CLAIM ? "institution" : "business",
      recipientName: str(first, "business_name") ?? str(first, "institution_name"),
      items,
      claimUrl: str(newest, "claim_url"),
      windowMinutes,
    });
  }

  return enquiryLeadEmail({
    kind: template === TEMPLATE.INSTITUTION ? "institution" : "business",
    recipientName: str(first, "business_name") ?? str(first, "institution_name"),
    items,
    windowMinutes,
  });
}

/** The four card fields, pulled out of a queue payload. Shared so the single and summary
 *  renders of the same row cannot describe it differently. */
function digestItemOf(payload: Record<string, unknown>): DigestItem {
  const str = (key: string) => (payload[key] as string | null) ?? null;
  return {
    studentFirstName: str("student_first_name"),
    courseName: str("course_name"),
    institutionName: str("institution_name"),
    intake: str("intake"),
  };
}

/**
 * Minimum gap between SMTP sends. A distribution fans out to every recipient of
 * every matched business, so without this we fire ~8 messages back to back and
 * providers reject the tail — Mailtrap's sandbox answers
 * "550 Too many emails per second", which burns an attempt per rejected row.
 *
 * ponytail: in-process only, so two workers running at once can still exceed the
 * cap. Move the gate into the DB (or a real rate limiter) if that becomes real.
 */
const minSendIntervalMs = () => Number(process.env.ENQUIRY_EMAIL_MIN_INTERVAL_MS ?? 1200);
let lastSendStartedAt = 0;

async function throttleSends(): Promise<void> {
  const waitMs = lastSendStartedAt + minSendIntervalMs() - Date.now();
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastSendStartedAt = Date.now();
}

/** Sends one queued row and updates its status. Safe to call from enqueue() (immediate path) or the batch worker. */
export async function sendQueuedRow(id: string): Promise<void> {
  // Throttle BEFORE opening the transaction — sleeping inside it would hold the
  // row lock and a pool connection for the whole delay.
  await throttleSends();

  await masterKnex.transaction(async (trx) => {
    const row = await emailQueueRepo.findByIdForUpdate(trx, id);
    if (!row || row.status === "sent" || row.status === "cancelled") return; // already handled — no double send

    await emailQueueRepo.markSending(trx, id);

    try {
      const { subject, text, html } = renderEmail(row.template, row.payload ?? {});
      await mailerService.sendMail({ to: row.recipient_email, subject, text, html });
      await emailQueueRepo.markSent(trx, id);
      logger.info("Sent enquiry email", { id, template: row.template, recipientEmail: row.recipient_email });
    } catch (err) {
      // Says which it was — a requeue that will be retried, or the cap, after which nobody is
      // ever told. The second is an incident; without the attempt count they read identically.
      const attempts = (row.attempts ?? 0) + 1;
      logger.error("Failed to send queued enquiry email", {
        id,
        template: row.template,
        attempts,
        maxAttempts: MAX_ATTEMPTS,
        outcome: attempts >= MAX_ATTEMPTS ? "gave up" : "requeued for retry",
        // `.message`, not the Error: winston's errors({stack:true}) only unwraps an Error passed
        // AS the message, and an Error nested in metadata has non-enumerable properties — it
        // serialises to `{}`. A render throw would otherwise log nothing at all about itself.
        error: err instanceof Error ? err.message : String(err),
      });
      await emailQueueRepo.markFailed(trx, id, MAX_ATTEMPTS);
    }
  });
}

/**
 * Sends one recipient's summary for one template, and resolves every row it covered.
 *
 * The claim, the send and the status update are one transaction. `claimGroup` takes an
 * advisory lock on the group before reading it, so a concurrent sweep gets zero rows here and
 * moves on rather than sending a second copy of the same summary — the failure this protocol
 * exists to prevent, since a digest resolves N rows with a single message. Row-level
 * SKIP LOCKED alone would not do it: past the cap there are unlocked rows left for a second
 * sweep to pick up and mail separately.
 *
 * ponytail: the SMTP call sits inside the transaction, holding the row locks for one
 * round-trip. That is what `sendQueuedRow` already does, and it is the crash-safe
 * direction — a dead process rolls back to `pending` instead of stranding rows in
 * `sending` with no reaper to free them. Split it into claim/commit/send/mark only if
 * lock hold time actually shows up.
 */
export async function sendDigestGroup(template: string, recipientEmail: string): Promise<void> {
  // Throttle BEFORE the transaction — sleeping inside would hold locks and a pool connection.
  await throttleSends();

  await masterKnex.transaction(async (trx) => {
    const cap = digestCap();
    const rows = await emailQueueRepo.claimGroup(trx, template, recipientEmail, cap);
    if (rows.length === 0) return; // another sweep owns this group

    const ids = rows.map((r) => r.id);
    try {
      const { subject, text, html } = renderDigest(template, rows);
      await mailerService.sendMail({ to: recipientEmail, subject, text, html });
      await emailQueueRepo.markSentMany(trx, ids);
      logger.info("Sent enquiry summary", { template, recipientEmail, count: rows.length });
    } catch (err) {
      // Per-row attempts differ inside one group (a retried row is older than a fresh one), so
      // the log reports the worst case: how close the most-attempted row is to being abandoned.
      const attempts = Math.max(...rows.map((r) => r.attempts ?? 0)) + 1;
      logger.error("Failed to send enquiry summary", {
        template,
        recipientEmail,
        count: rows.length,
        attempts,
        maxAttempts: MAX_ATTEMPTS,
        outcome: attempts >= MAX_ATTEMPTS ? "gave up" : "requeued for retry",
        error: err instanceof Error ? err.message : String(err),
      });
      await emailQueueRepo.markFailedMany(trx, ids, MAX_ATTEMPTS);
    }
  });
}

/**
 * The worker's entry point: drain whatever is due.
 *
 * Two passes, because the outbox holds two kinds of row. Non-batched templates
 * (`enquiry_unlocked`) only reach here as retries of a failed inline send and still go one
 * mail per row. Batched templates go out as one summary per (recipient, template) group
 * whose oldest row has aged past the window.
 *
 * Groups are processed serially: `throttleSends` is per-process and in-memory, so firing
 * them concurrently would step straight past the provider's rate limit.
 */
export async function sweepDigests(): Promise<void> {
  const singles = await emailQueueRepo.findPendingSingles(BATCHED_TEMPLATES, batchCap());
  for (const row of singles) {
    await sendQueuedRow(row.id);
  }

  const groups = await emailQueueRepo.findReadyDigestGroups(BATCHED_TEMPLATES, windowMs(), batchCap());
  logger.info(`Enquiry email sweep: ${singles.length} single(s), ${groups.length} summary group(s)`);

  for (const group of groups) {
    await sendDigestGroup(group.template, group.recipient_email);
  }
}

/**
 * Who hears about a distribution: the business's own inbox (`businesses.email`), and nobody
 * else. One enquiry is one email.
 *
 * This used to fan out to every active `user_business_index` member as well, which meant a
 * single enquiry became one message per team member — the multiplier that made a burst
 * unmanageable even before the summary batching, and the reason a five-person agency saw the
 * same lead five times.
 *
 * `businesses.email` is nullable, so an unconfigured business falls back to its owner's
 * address rather than being told nothing — a silently undelivered lead is worse than a mail
 * arriving at a personal inbox. The recipient is an inbox, not a platform user, so `userId`
 * stays null and the dedup key ends in "business": exactly one row per distribution.
 *
 * Claim state rides along because it decides which mail is sent, not whether one is: an
 * unclaimed business is a legitimate recipient (matching has never filtered on it) but has
 * nobody who has agreed to work the lead a notice points at.
 *
 * `claim_status`, NOT `account_status`, is the test, and the difference is not academic.
 * `account_status` answers "could someone sign in", which the ADMIN create-business path sets
 * to 1 the moment it eagerly provisions a tenant schema — before anyone at that business has
 * been told the listing exists. Branching on it sent a lead notice to a listing an admin had
 * typed in that morning. `claim_status` answers the question this mail actually turns on:
 * has a human from this business taken ownership? Only self-service registration and the
 * accept-claim flow set it to 'claimed'; admin-created and promoted listings stay 'unclaimed'.
 *
 * 'claim_pending' — what minting a claim link leaves behind — correctly reads as NOT claimed,
 * so a second enquiry mints a fresh link rather than flipping the recipient to the claimed mail
 * because we happened to mail it once already.
 */
async function resolveBusinessRecipients(businessId: number): Promise<{
  recipients: { userId: number | null; email: string }[];
  businessName: string | null;
  isClaimed: boolean;
}> {
  const business = await masterKnex("businesses as b")
    .leftJoin("platform_users as owner", "owner.id", "b.owner_id")
    .where("b.id", businessId)
    .first("b.email", "b.business_name", "b.claim_status", "owner.email as owner_email");

  const isClaimed = business?.claim_status === "claimed";
  const own = business?.email?.trim();
  const inbox = deliverable(own) ? own : deliverable(business?.owner_email) ? business.owner_email.trim() : null;
  if (!inbox) {
    // Not an error: the enquiry is distributed and visible in the business's inbox UI.
    // Nobody is reachable by mail, which is worth knowing about.
    logger.warn("Business has no deliverable email and no owner address — no enquiry notification sent", {
      businessId,
      isClaimed,
    });
    return { recipients: [], businessName: business?.business_name ?? null, isClaimed };
  }
  if (!deliverable(own)) {
    logger.warn("Business has no usable email set — notifying the owner instead", { businessId });
  }

  // business_name comes back on the same row: the mail names the business it was sent to,
  // since one person can hold several.
  return { recipients: [{ userId: null, email: inbox }], businessName: business?.business_name ?? null, isClaimed };
}

/**
 * Enqueues the new-enquiry notice for a newly-distributed business — the lead notice when the
 * business is claimed, the acquisition mail with a claim CTA when it is not.
 *
 * A claim link is minted per enquiry, exactly as the institution fallback does, because the
 * token lives 72 hours and an enquiry can land long after the last one expired. The newest mint
 * supersedes the older ones; `renderDigest` reads the newest row's link for precisely that reason.
 */
export async function enqueueDistributionEmails(enquiryId: string, distributionId: string, businessId: number) {
  const { recipients, businessName, isClaimed } = await resolveBusinessRecipients(businessId);
  logger.info("Enquiry recipient identified", {
    enquiryId,
    distributionId,
    businessId,
    isClaimed,
    reachable: recipients.length > 0,
  });
  if (recipients.length === 0) return;

  const claimUrl = isClaimed ? null : await mintBusinessClaimUrl(businessId);
  if (claimUrl) logger.info("Claim CTA generated for unclaimed business", { businessId, enquiryId, distributionId });

  // Names, not raw ids — the email is read by a human.
  const enquiry = await masterKnex("enquiries as e")
    .leftJoin("superadmin.extraction_courses as c", "c.id", "e.course_id")
    // institutions, not the scraped overview row: this is the name an admin published,
    // and the same one the public search page shows the student.
    .leftJoin("institutions as i", "i.id", "e.institution_id")
    // First name ONLY. It is what the inbox card shows before the unlock is paid for
    // (enquiry-inbox-card.tsx), and it is what makes twenty rows in a summary tellable
    // apart. The surname, email and phone are what the unlock buys — they must not
    // travel in an email that costs nothing to forward.
    .join("platform_users as u", "u.id", "e.student_id")
    .where("e.id", enquiryId)
    .first(
      "e.course_id",
      "e.preferred_intake",
      "e.preferred_year",
      "c.name as course_name",
      "i.institution_name as institution_name",
      "u.first_name as student_first_name",
    );

  // One label rather than two payload fields: the mail prints "April 2027", and either half
  // can be missing.
  const intake = [enquiry?.preferred_intake, enquiry?.preferred_year].filter(Boolean).join(" ") || null;
  const template = isClaimed ? TEMPLATE.BUSINESS : TEMPLATE.BUSINESS_CLAIM;

  for (const r of recipients) {
    // The dedup key stays keyed on the distribution and NOT on the template: one distribution is
    // one notification, and a business that gets claimed between the enqueue and the sweep must
    // not be told twice under two template names.
    await enqueue({
      dedupKey: `enquiry_distributed:${distributionId}:${r.userId ?? "business"}`,
      template,
      payload: {
        course_id: enquiry?.course_id ?? null,
        course_name: enquiry?.course_name ?? null,
        institution_name: enquiry?.institution_name ?? null,
        intake,
        business_name: businessName,
        student_first_name: enquiry?.student_first_name ?? null,
        distribution_id: distributionId,
        claim_url: claimUrl,
      },
      recipientEmail: r.email,
      recipientUserId: r.userId,
      businessId,
      enquiryId,
      distributionId,
    });
    logger.info("Enquiry summary queued", { template, enquiryId, distributionId, businessId });
  }
}

/**
 * Tells the STUDENT that a business unlocked their enquiry and left them a message.
 *
 * Every other mail in this module goes to a recipient of an enquiry; this one goes back to the
 * person who sent it. Until now the student learned that a business had their details only by
 * opening the app — the one moment their data actually changed hands was the one moment nothing
 * told them.
 *
 * `business_id` is the unlocker, which is genuinely a business here (an institution recipient
 * passes null, since the column FKs `businesses`) — it is recorded for the audit trail, not for
 * addressing: the recipient is the student.
 *
 * Dedup key is the distribution, so a repeat unlock — which charges nothing and returns the same
 * result — cannot mail the student twice.
 */
export async function enqueueUnlockedEmailToStudent(
  enquiryId: string,
  distributionId: string,
  unlockerName: string | null,
  businessId: number | null,
) {
  const enquiry = await masterKnex("enquiries as e")
    .join("platform_users as u", "u.id", "e.student_id")
    .leftJoin("superadmin.extraction_courses as c", "c.id", "e.course_id")
    .leftJoin("institutions as i", "i.id", "e.institution_id")
    .where("e.id", enquiryId)
    .first(
      "u.id as student_user_id",
      "u.email as student_email",
      "e.share_contact_number",
      "c.name as course_name",
      "i.institution_name as institution_name",
    );
  // No address, nobody to tell. Not an error: the enquiry and its conversation are unaffected.
  if (!enquiry?.student_email) return;

  const firstMessage = await masterKnex("enquiry_messages")
    .where({ distribution_id: distributionId })
    .orderBy("created_at", "asc")
    .first("body");

  await enqueue({
    dedupKey: `enquiry_unlocked:${distributionId}`,
    template: "enquiry_unlocked",
    payload: {
      business_name: unlockerName,
      course_name: enquiry.course_name ?? null,
      institution_name: enquiry.institution_name ?? null,
      enquiry_id: enquiryId,
      // Echoed back so the mail can state what the unlocker can actually see, rather than
      // describing the feature in the abstract.
      shared_contact: enquiry.share_contact_number === true,
      // The thread's opening message — today always the templated unlock greeting. Snapshotted
      // at enqueue rather than read at send: the mail describes the moment of the unlock, and a
      // later reply would make "sent you a message" point at the wrong one.
      message_preview: firstMessage?.body ?? null,
    },
    recipientEmail: enquiry.student_email,
    recipientUserId: Number(enquiry.student_user_id),
    businessId,
    enquiryId,
    distributionId,
  });
}

/**
 * The institution-fallback notice: one row, to the institution's own contact address — the same
 * rule as a business, so the two recipient paths cannot drift. Members are not mailed
 * individually; an unclaimed institution has none anyway.
 *
 * The mail carries a claim link when the institution is unclaimed. A fresh link is minted per
 * fallback rather than reused: the token has a 72-hour life, and an enquiry can land long after
 * the last one expired.
 *
 * Resolution is split out and exported because matching gates the fallback on it: promote nulls
 * `institutions.email` when extraction found no address (or another institution already holds
 * it), and such an institution, still unclaimed, has nobody to notify. Distributing to it would
 * strand the enquiry as 'distributed' with no reachable recipient, so matching asks here first.
 *
 * `business_id` on the queue row stays NULL — it FKs to businesses, and this recipient is not one.
 */
export async function resolveInstitutionRecipients(institutionId: number) {
  const institution = await masterKnex("institutions")
    .where({ id: institutionId })
    .whereNull("deleted_at")
    .first("id", "email", "institution_name", "claim_status");
  if (!institution) return { recipients: [], institution: null };

  // The institution's own contact address, and nobody else — same rule as a business, so the
  // two recipient paths cannot drift. `institutions.email` is NOT NULL, but promote nulls it
  // when extraction found no address (or another institution already holds it), which is
  // precisely the "nobody reachable" case matching gates the fallback on.
  //
  // Reachability is the ONLY gate here. Claim state and verification are not: an unclaimed,
  // unverified institution with an address on file is a legitimate recipient and gets the
  // acquisition mail below.
  const contact = institution.email?.trim();
  const recipients: { userId: number | null; email: string }[] = deliverable(contact)
    ? [{ userId: null, email: contact }]
    : [];
  return { recipients, institution };
}

export async function enqueueInstitutionFallbackEmail(
  enquiryId: string,
  distributionId: string,
  institutionId: number,
) {
  const { recipients, institution } = await resolveInstitutionRecipients(institutionId);
  // `claim_status`, not `account_status` — see resolveBusinessRecipients for why.
  const isClaimed = institution?.claim_status === "claimed";
  logger.info("Enquiry recipient identified", {
    enquiryId,
    distributionId,
    institutionId,
    isClaimed,
    reachable: recipients.length > 0,
  });
  if (!institution || recipients.length === 0) return;

  const claimUrl = isClaimed ? null : await mintInstitutionClaimUrl(institutionId);
  if (claimUrl) {
    logger.info("Claim CTA generated for unclaimed institution", { institutionId, enquiryId, distributionId });
  }

  const enquiry = await masterKnex("enquiries as e")
    .leftJoin("superadmin.extraction_courses as c", "c.id", "e.course_id")
    // First name only — the same pre-unlock boundary the business notice draws. Without it
    // these cards render nameless in a summary, which reads as missing data rather than as
    // withheld data.
    .leftJoin("platform_users as u", "u.id", "e.student_id")
    .where("e.id", enquiryId)
    .first("e.preferred_intake", "e.preferred_year", "c.name as course_name", "u.first_name as student_first_name");
  const intake = [enquiry?.preferred_intake, enquiry?.preferred_year].filter(Boolean).join(" ") || null;
  const template = isClaimed ? TEMPLATE.INSTITUTION : TEMPLATE.INSTITUTION_CLAIM;

  for (const r of recipients) {
    // Keyed on the distribution, not the template — see enqueueDistributionEmails.
    await enqueue({
      dedupKey: `enquiry_institution_fallback:${distributionId}:${r.userId ?? "institution"}`,
      template,
      payload: {
        student_first_name: enquiry?.student_first_name ?? null,
        course_name: enquiry?.course_name ?? null,
        institution_name: institution.institution_name ?? null,
        intake,
        claim_url: claimUrl,
        distribution_id: distributionId,
      },
      recipientEmail: r.email,
      recipientUserId: r.userId,
      businessId: null,
      enquiryId,
      distributionId,
    });
    logger.info("Enquiry summary queued", { template, enquiryId, distributionId, institutionId });
  }
}
