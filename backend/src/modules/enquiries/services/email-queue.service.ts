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
// throttle, most of them rejected by the provider for rate. Now a
// `enquiry_distributed` / `enquiry_institution_fallback` row is only inserted;
// `sweepDigests()` (driven by enquiry-email.worker.ts) later collects everything
// pending for one recipient and sends ONE mail listing all of it.
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
  enquiryDigestEmail,
  enquiryDistributedEmail,
  enquiryInstitutionFallbackEmail,
  enquiryUnlockedEmail,
  type DigestItem,
} from "../../../shared/mail/templates.js";
import { mintInstitutionClaimUrl } from "../../platform-users/services/institution-claim.service.js";
import { createChildLogger } from "../../../shared/logger.js";
import * as emailQueueRepo from "../repositories/email-queue.repository.js";

const logger = createChildLogger("enquiry-email-queue");

export const MAX_ATTEMPTS = Number(process.env.ENQUIRY_EMAIL_MAX_ATTEMPTS) || 5;

/**
 * Templates that wait for a summary instead of sending on enqueue. These are the two
 * high-fan-out new-enquiry notices; `enquiry_unlocked` goes to the student, is one per
 * unlock, and is time-sensitive, so it stays immediate.
 *
 * Read at call time rather than captured, so a test can widen the window without
 * reloading the module.
 */
export const BATCHED_TEMPLATES = ["enquiry_distributed", "enquiry_institution_fallback"];

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
    case "enquiry_distributed":
      return enquiryDistributedEmail({
        courseName: str("course_name"),
        institutionName: str("institution_name"),
        intake: str("intake"),
        businessName: str("business_name"),
        studentFirstName: str("student_first_name"),
        distributionId: str("distribution_id"),
      });
    case "enquiry_unlocked":
      return enquiryUnlockedEmail({
        businessName: str("business_name"),
        courseName: str("course_name"),
        institutionName: str("institution_name"),
        enquiryId: str("enquiry_id"),
        sharedContact: payload.shared_contact === true,
      });
    case "enquiry_institution_fallback":
      return enquiryInstitutionFallbackEmail({
        courseName: str("course_name"),
        institutionName: str("institution_name"),
        intake: str("intake"),
        isClaimed: payload.is_claimed === true,
        claimUrl: str("claim_url"),
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

  // An unclaimed institution has no inbox to open, so the CTA offers the claim link instead.
  // Any row's link works; the newest has the most life left on its 72-hour token.
  const lastPayload = (rows[rows.length - 1].payload ?? {}) as Record<string, unknown>;
  const claimUrl = lastPayload.is_claimed === false ? str(lastPayload, "claim_url") : null;

  const items: DigestItem[] = rows.map((row) => {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    return {
      studentFirstName: str(payload, "student_first_name"),
      courseName: str(payload, "course_name"),
      institutionName: str(payload, "institution_name"),
      intake: str(payload, "intake"),
    };
  });

  // Every claimed row goes in: the template prints the first five and counts the rest, so the
  // heading's number is the true size of this window.
  return enquiryDigestEmail({
    items,
    businessName: str((rows[0].payload ?? {}) as Record<string, unknown>, "business_name"),
    windowMinutes: Math.max(1, Math.round(windowMs() / 60_000)),
    claimUrl,
  });
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
    } catch (err) {
      logger.error("Failed to send queued enquiry email", { id, error: err });
      await emailQueueRepo.markFailed(trx, id, MAX_ATTEMPTS);
    }
  });
}

/**
 * Sends one recipient's summary for one template, and resolves every row it covered.
 *
 * The claim, the send and the status update are one transaction. `claimGroup` uses
 * SKIP LOCKED, so a concurrent sweep gets zero rows here and moves on rather than sending
 * a second copy of the same summary — which is the failure this whole protocol exists to
 * prevent, since a digest resolves N rows with a single message.
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
      logger.error("Failed to send enquiry summary", { template, recipientEmail, error: err });
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
 */
async function resolveBusinessRecipients(
  businessId: number,
): Promise<{ recipients: { userId: number | null; email: string }[]; businessName: string | null }> {
  const business = await masterKnex("businesses as b")
    .leftJoin("platform_users as owner", "owner.id", "b.owner_id")
    .where("b.id", businessId)
    .first("b.email", "b.business_name", "owner.email as owner_email");

  const inbox = business?.email?.trim() || business?.owner_email?.trim();
  if (!inbox) {
    // Not an error: the enquiry is distributed and visible in the business's inbox UI.
    // Nobody is reachable by mail, which is worth knowing about.
    logger.warn("Business has no email and no owner address — no enquiry notification sent", { businessId });
    return { recipients: [], businessName: business?.business_name ?? null };
  }
  if (!business?.email?.trim()) {
    logger.warn("Business has no email set — notifying the owner instead", { businessId });
  }

  // business_name comes back on the same row: the mail names the business it was sent to,
  // since one person can hold several.
  return { recipients: [{ userId: null, email: inbox }], businessName: business?.business_name ?? null };
}

/** Enqueues the single `enquiry_distributed` row for a newly-distributed business. */
export async function enqueueDistributionEmails(enquiryId: string, distributionId: string, businessId: number) {
  const { recipients, businessName } = await resolveBusinessRecipients(businessId);

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

  for (const r of recipients) {
    await enqueue({
      dedupKey: `enquiry_distributed:${distributionId}:${r.userId ?? "business"}`,
      template: "enquiry_distributed",
      payload: {
        course_id: enquiry?.course_id ?? null,
        course_name: enquiry?.course_name ?? null,
        institution_name: enquiry?.institution_name ?? null,
        intake,
        business_name: businessName,
        student_first_name: enquiry?.student_first_name ?? null,
        distribution_id: distributionId,
      },
      recipientEmail: r.email,
      recipientUserId: r.userId,
      businessId,
      enquiryId,
      distributionId,
    });
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
    .first("id", "email", "institution_name", "account_status");
  if (!institution) return { recipients: [], institution: null };

  // The institution's own contact address, and nobody else — same rule as a business, so the
  // two recipient paths cannot drift. `institutions.email` is NOT NULL, but promote nulls it
  // when extraction found no address (or another institution already holds it), which is
  // precisely the "nobody reachable" case matching gates the fallback on.
  const contact = institution.email?.trim();
  const recipients: { userId: number | null; email: string }[] = contact ? [{ userId: null, email: contact }] : [];
  return { recipients, institution };
}

export async function enqueueInstitutionFallbackEmail(
  enquiryId: string,
  distributionId: string,
  institutionId: number,
) {
  const { recipients, institution } = await resolveInstitutionRecipients(institutionId);
  if (!institution || recipients.length === 0) return;

  const isClaimed = Number(institution.account_status) === 1;
  const claimUrl = isClaimed ? null : await mintInstitutionClaimUrl(institutionId);

  const enquiry = await masterKnex("enquiries as e")
    .leftJoin("superadmin.extraction_courses as c", "c.id", "e.course_id")
    .where("e.id", enquiryId)
    .first("e.preferred_intake", "e.preferred_year", "c.name as course_name");
  const intake = [enquiry?.preferred_intake, enquiry?.preferred_year].filter(Boolean).join(" ") || null;

  for (const r of recipients) {
    await enqueue({
      dedupKey: `enquiry_institution_fallback:${distributionId}:${r.userId ?? "institution"}`,
      template: "enquiry_institution_fallback",
      payload: {
        course_name: enquiry?.course_name ?? null,
        institution_name: institution.institution_name ?? null,
        intake,
        is_claimed: isClaimed,
        claim_url: claimUrl,
        distribution_id: distributionId,
      },
      recipientEmail: r.email,
      recipientUserId: r.userId,
      businessId: null,
      enquiryId,
      distributionId,
    });
  }
}
