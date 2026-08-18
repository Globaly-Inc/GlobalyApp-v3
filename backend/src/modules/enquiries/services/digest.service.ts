// Enquiry digest — one teaser email per business per run, listing the leads
// waiting in its inbox. Behavioural spec: V1 `send-enquiry-digest`.
//
// The logic lives here, not in the worker, so it can be driven directly by a
// test with no broker and no SMTP. `src/workers/enquiry-digest.worker.ts` is the
// LavinMQ shim that calls it.

import { masterKnex } from "../../../core/db/master-pool.js";
import { config } from "../../../config.js";
import { emailLayout, esc } from "../../../shared/mail/templates.js";
import { createChildLogger } from "../../../shared/logger.js";
import { DIGEST_BATCH_LIMIT, DIGEST_MAX_LEADS_PER_EMAIL } from "../consts.js";
import * as repo from "../repositories/enquiries.repository.js";

const logger = createChildLogger("enquiry-digest");

export interface DigestEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Injected so the worker can queue mail while a test can capture it. */
export type SendDigest = (email: DigestEmail) => Promise<void>;

export interface DigestResult {
  claimed: number;
  businesses: number;
  emails_sent: number;
}

function digestHtml(businessName: string, leads: repo.ClaimedQueueRow[], total: number): string {
  const items = leads
    .map(
      (l) =>
        `<li style="margin:0 0 8px">${esc(l.student_first_name)} — new enquiry, unlock to view the full message and contact details</li>`,
    )
    .join("");
  const more =
    total > leads.length
      ? `<p style="margin:12px 0 0">…and ${total - leads.length} more waiting in your inbox.</p>`
      : "";

  return emailLayout({
    heading: `${total} new student lead${total === 1 ? "" : "s"}`,
    body: `<p style="margin:0 0 12px">Hi ${esc(businessName)},</p>
           <p style="margin:0 0 12px">You have ${total} new enquir${total === 1 ? "y" : "ies"} waiting.</p>
           <ul style="margin:0;padding-left:18px">${items}</ul>${more}`,
    cta: { label: "View enquiries", href: `${config.WEB_APP_URL.replace(/\/$/, "")}/business/enquiries` },
    footnote: "You are receiving this because enquiries are enabled on your business profile.",
  });
}

/**
 * Drain the pending digest queue.
 *
 * Idempotent over a re-delivered message: `claimPendingQueue` flips rows from
 * pending to sent in the SAME statement that returns them, so a second delivery
 * claims nothing and sends nothing. When a send fails the claimed rows are put
 * back as 'failed' with the reason, rather than V1's behaviour of reporting a
 * bounced digest as delivered.
 */
export async function runDigest(
  send: SendDigest,
  limit = DIGEST_BATCH_LIMIT,
): Promise<DigestResult> {
  const claimed = await repo.claimPendingQueue(limit);
  if (claimed.length === 0) return { claimed: 0, businesses: 0, emails_sent: 0 };

  const byBusiness = new Map<number, repo.ClaimedQueueRow[]>();
  for (const row of claimed) {
    const bucket = byBusiness.get(row.business_id) ?? [];
    bucket.push(row);
    byBusiness.set(row.business_id, bucket);
  }

  const businesses = await masterKnex("businesses")
    .whereIn("id", [...byBusiness.keys()])
    .select("id", "business_name", "email");
  const nameOf = new Map(businesses.map((b) => [Number(b.id), b]));

  let sent = 0;
  for (const [businessId, leads] of byBusiness) {
    const business = nameOf.get(businessId);
    const ids = leads.map((l) => l.id);

    if (!business?.email) {
      await repo.markQueueFailed(ids, "business has no contact email");
      continue;
    }

    // V1 listed at most 10 leads and silently dropped the rest from the run —
    // and left them pending forever if the agent never cleared the queue. V3
    // still lists 10 but names the true total and marks every claimed row done.
    const listed = leads.slice(0, DIGEST_MAX_LEADS_PER_EMAIL);
    const subject = `${leads.length} new student lead${leads.length === 1 ? "" : "s"} on GlobalyHub`;

    try {
      await send({
        to: business.email,
        subject,
        html: digestHtml(business.business_name, listed, leads.length),
        text: `${leads.length} new student enquir${leads.length === 1 ? "y is" : "ies are"} waiting in your GlobalyHub inbox.`,
      });
      sent += 1;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await repo.markQueueFailed(ids, reason);
      logger.error("digest send failed", { businessId, reason });
    }
  }

  logger.info("digest run", { claimed: claimed.length, businesses: byBusiness.size, sent });
  return { claimed: claimed.length, businesses: byBusiness.size, emails_sent: sent };
}
