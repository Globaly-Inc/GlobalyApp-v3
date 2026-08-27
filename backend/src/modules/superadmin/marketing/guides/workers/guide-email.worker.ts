// Batch sweep worker for guide_leads awaiting email delivery — style mirrors
// enquiry-email.worker.ts. The lead route also publishes a `guide.email` LavinMQ signal so a
// live consumer could pick this up sooner, but this cron sweep (claim WHERE email_sent_at IS
// NULL) is the source of truth: it runs regardless of whether that publish landed.
//
// Cron-triggered, one-shot — run on a schedule via cron/systemd-timer, not as a long-lived
// process: `npm run job:guide-email`.

import "dotenv/config";
import { createChildLogger } from "../../../../../shared/logger.js";
import * as storage from "../../../../../shared/storage/storageService.js";
import { mailerService } from "../../../../../shared/mail/mailerService.js";
import { guideDeliveryEmail } from "../../../../../shared/mail/templates.js";
import * as leadsRepo from "../repositories/leads.repository.js";

const logger = createChildLogger("guide-email-worker");
const BATCH_CAP = Number(process.env.GUIDE_EMAIL_BATCH_CAP) || 200; // ponytail: flat cap, per-guide cap if one guide starves others
const SEVEN_DAYS_SECONDS = 7 * 24 * 3600;

const batch = await leadsRepo.claimUnsentBatch(BATCH_CAP);
logger.info(`Guide email sweep: ${batch.length} unsent lead(s)`);

for (const lead of batch) {
  try {
    if (!lead.guide_pdf_url) {
      // Nothing to send yet — leave the row claimable for a later sweep, once a PDF is uploaded.
      logger.warn("Guide has no PDF uploaded — skipping, will retry next sweep", { leadId: lead.id, guideSlug: lead.guide_slug });
      continue;
    }

    const downloadUrl = await storage.getSignedDownloadUrl(lead.guide_pdf_url, `${lead.guide_slug}.pdf`, SEVEN_DAYS_SECONDS);
    await mailerService.sendMail({ to: lead.email, ...guideDeliveryEmail({ guideTitle: lead.guide_title, downloadUrl }) });
    await leadsRepo.markEmailSent(lead.id);
    logger.info("Guide email sent", { leadId: lead.id, guideSlug: lead.guide_slug });
  } catch (err) {
    // Failure leaves email_sent_at NULL — the row stays claimable on the next sweep.
    logger.error("Failed to send guide email — will retry next sweep", {
      leadId: lead.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

logger.info("Guide email sweep complete");
process.exit(0);
