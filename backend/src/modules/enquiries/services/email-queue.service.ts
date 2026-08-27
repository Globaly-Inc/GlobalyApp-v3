// Email queue service (Phase 8, PRD §17/§26/§32).
//
// Durable outbox: every notification is inserted into `enquiry_email_queue`
// with a `dedup_key` before any send is attempted, and the UNIQUE constraint
// on that column is the single source of truth for "never sent twice" — not
// an in-memory check. `enqueue()` itself never throws on a dedup collision;
// the caller (matching/accept) doesn't need to know or care whether this is
// the first or the Nth attempt to fire the same event.
//
// "Immediate if idle, else batched" (PRD §17): right after a row is inserted,
// we check whether the recipient has any *other* pending rows. None -> send
// right now, inline. One or more -> leave it for the batch sweep
// (`enquiry-email.worker.ts --sweep`) so a single recipient with many pending
// emails doesn't get hammered with N synchronous sends on the request path.
//
// schema.enquiry_email_queue has no `max_attempts` column (see the migration)
// — the cap is an application constant, not app-configurable-per-row.

import { masterKnex } from "../../../core/db/master-pool.js";
import { config } from "../../../config.js";
import { mailerService } from "../../../shared/mail/mailerService.js";
import { emailLayout, enquiryDistributedEmail, enquiryInstitutionFallbackEmail } from "../../../shared/mail/templates.js";
import { mintInstitutionClaimUrl } from "../../platform-users/services/institution-claim.service.js";
import { createChildLogger } from "../../../shared/logger.js";
import * as emailQueueRepo from "../repositories/email-queue.repository.js";

const logger = createChildLogger("enquiry-email-queue");

export const MAX_ATTEMPTS = Number(process.env.ENQUIRY_EMAIL_MAX_ATTEMPTS) || 5;

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

  const otherPending = await emailQueueRepo.countOtherPendingForRecipient({
    businessId: opts.businessId ?? null,
    recipientUserId: opts.recipientUserId ?? null,
    excludeId: row.id,
  });

  if (otherPending === 0) {
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
      });
    case "enquiry_institution_fallback":
      return enquiryInstitutionFallbackEmail({
        courseName: str("course_name"),
        institutionName: str("institution_name"),
        intake: str("intake"),
        isClaimed: payload.is_claimed === true,
        claimUrl: str("claim_url"),
      });
    default:
      return {
        subject: "Enquiry update",
        text: `You have an enquiry update. View enquiries → ${config.APP_URL}/business/enquiries`,
        html: emailLayout({
          heading: "Enquiry update",
          body: `<p style="margin:0">There's an update waiting on one of your enquiries.</p>`,
          cta: { label: "View enquiries", href: `${config.APP_URL}/business/enquiries` },
        }),
      };
  }
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
const MIN_SEND_INTERVAL_MS = Number(process.env.ENQUIRY_EMAIL_MIN_INTERVAL_MS) || 1200;
let lastSendStartedAt = 0;

async function throttleSends(): Promise<void> {
  const waitMs = lastSendStartedAt + MIN_SEND_INTERVAL_MS - Date.now();
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
 * Everyone who should hear about a distribution (PRD §17 / Flow B step 5):
 * every active `user_business_index` member's personal email, plus the
 * business's own shared inbox (`businesses.email`) when set. The shared inbox
 * has no platform user, so its `userId` is null — the dedup key falls back to
 * "business" for it, keeping one row per distribution per address.
 */
async function resolveBusinessRecipients(
  businessId: number,
): Promise<{ recipients: { userId: number | null; email: string }[]; businessName: string | null }> {
  const members = await masterKnex("user_business_index as ubi")
    .join("platform_users as pu", "pu.id", "ubi.platform_user_id")
    .where("ubi.business_id", businessId)
    .whereNull("ubi.deleted_at")
    .select("pu.id as userId", "pu.email");

  // business_name comes back on the same row the shared inbox does — the mail names the
  // business it was sent to, since one person can hold several.
  const business = await masterKnex("businesses").where({ id: businessId }).first("email", "business_name");

  const recipients: { userId: number | null; email: string }[] = [...members];
  const sharedInbox = business?.email?.trim();
  // Skip if the shared inbox is also a member's personal address — otherwise the
  // same person gets the same enquiry twice.
  if (sharedInbox && !members.some((m) => m.email?.toLowerCase() === sharedInbox.toLowerCase())) {
    recipients.push({ userId: null, email: sharedInbox });
  }
  return { recipients, businessName: business?.business_name ?? null };
}

/** Enqueues one `enquiry_distributed` row per recipient of a newly-distributed business. */
export async function enqueueDistributionEmails(enquiryId: string, distributionId: string, businessId: number) {
  const { recipients, businessName } = await resolveBusinessRecipients(businessId);

  // Names, not raw ids — the email is read by a human.
  const enquiry = await masterKnex("enquiries as e")
    .leftJoin("superadmin.extraction_courses as c", "c.id", "e.course_id")
    // institutions, not the scraped overview row: this is the name an admin published,
    // and the same one the public search page shows the student.
    .leftJoin("institutions as i", "i.id", "e.institution_id")
    .where("e.id", enquiryId)
    .first(
      "e.course_id",
      "e.preferred_intake",
      "e.preferred_year",
      "c.name as course_name",
      "i.institution_name as institution_name",
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
 * The institution-fallback notice: one row per institution member, plus the institution's own
 * contact address — the same shape as a business's recipients, read from user_institution_index
 * instead of user_business_index.
 *
 * An unclaimed institution has no members at all, so the contact address is the whole audience
 * and the mail carries a claim link. A fresh link is minted per fallback rather than reused: the
 * token has a 72-hour life, and an enquiry can land long after the last one expired.
 *
 * `business_id` on the queue row stays NULL — it FKs to businesses, and this recipient is not one.
 */
export async function enqueueInstitutionFallbackEmail(
  enquiryId: string,
  distributionId: string,
  institutionId: number,
) {
  const institution = await masterKnex("institutions")
    .where({ id: institutionId })
    .whereNull("deleted_at")
    .first("id", "email", "institution_name", "account_status");
  if (!institution) return;

  const members = await masterKnex("user_institution_index as uii")
    .join("platform_users as pu", "pu.id", "uii.platform_user_id")
    .where("uii.institution_id", institutionId)
    .whereNull("uii.deleted_at")
    .select("pu.id as userId", "pu.email");

  const recipients: { userId: number | null; email: string }[] = [...members];
  const contact = institution.email?.trim();
  if (contact && !members.some((m) => m.email?.toLowerCase() === contact.toLowerCase())) {
    recipients.push({ userId: null, email: contact });
  }
  if (recipients.length === 0) return;

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
