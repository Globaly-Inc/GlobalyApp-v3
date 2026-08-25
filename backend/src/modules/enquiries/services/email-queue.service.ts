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

/** Templates render as plain-text subject/body — v1 has no HTML template engine (out of scope). */
function renderEmail(template: string, payload: Record<string, unknown>): { subject: string; text: string } {
  switch (template) {
    case "enquiry_distributed": {
      const courseName = (payload.course_name as string | null) ?? null;
      const institutionName = (payload.institution_name as string | null) ?? null;
      const subjectLine = courseName
        ? `New student enquiry — ${courseName}`
        : "New student enquiry available";
      const lines = [
        "You have received a new student enquiry.",
        "",
        courseName ? `Course: ${courseName}` : null,
        institutionName ? `Institution: ${institutionName}` : null,
        "",
        // CTA per Flow B step 6 — no direct-unlock link, unlock is out of scope.
        `View Enquiries → ${config.APP_URL}/business/enquiries`,
      ].filter((l) => l !== null);
      return { subject: subjectLine, text: lines.join("\n") };
    }
    default:
      return { subject: "Enquiry update", text: "You have an enquiry update." };
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
      const { subject, text } = renderEmail(row.template, row.payload ?? {});
      await mailerService.sendMail({ to: row.recipient_email, subject, text });
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
async function resolveBusinessRecipients(businessId: number): Promise<{ userId: number | null; email: string }[]> {
  const members = await masterKnex("user_business_index as ubi")
    .join("platform_users as pu", "pu.id", "ubi.platform_user_id")
    .where("ubi.business_id", businessId)
    .whereNull("ubi.deleted_at")
    .select("pu.id as userId", "pu.email");

  const business = await masterKnex("businesses").where({ id: businessId }).first("email");

  const recipients: { userId: number | null; email: string }[] = [...members];
  const sharedInbox = business?.email?.trim();
  // Skip if the shared inbox is also a member's personal address — otherwise the
  // same person gets the same enquiry twice.
  if (sharedInbox && !members.some((m) => m.email?.toLowerCase() === sharedInbox.toLowerCase())) {
    recipients.push({ userId: null, email: sharedInbox });
  }
  return recipients;
}

/** Enqueues one `enquiry_distributed` row per recipient of a newly-distributed business. */
export async function enqueueDistributionEmails(enquiryId: string, distributionId: string, businessId: number) {
  const recipients = await resolveBusinessRecipients(businessId);

  // Names, not raw ids — the email is read by a human.
  const enquiry = await masterKnex("enquiries as e")
    .leftJoin("superadmin.extraction_courses as c", "c.id", "e.course_id")
    // institutions, not the scraped overview row: this is the name an admin published,
    // and the same one the public search page shows the student.
    .leftJoin("institutions as i", "i.id", "e.institution_id")
    .where("e.id", enquiryId)
    .first("e.course_id", "c.name as course_name", "i.institution_name as institution_name");

  for (const r of recipients) {
    await enqueue({
      dedupKey: `enquiry_distributed:${distributionId}:${r.userId ?? "business"}`,
      template: "enquiry_distributed",
      payload: {
        course_id: enquiry?.course_id ?? null,
        course_name: enquiry?.course_name ?? null,
        institution_name: enquiry?.institution_name ?? null,
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
