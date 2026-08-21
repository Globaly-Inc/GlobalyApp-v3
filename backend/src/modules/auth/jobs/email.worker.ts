// Worker — sends all queued emails.
// Run with: npm run job:auth

import "dotenv/config";
import { queueService } from "../../../shared/queue/queueService.js";
import { mailerService } from "../../../shared/mail/mailerService.js";
import { createChildLogger } from "../../../shared/logger.js";

const logger = createChildLogger("auth-worker");

// ── Send all emails (OTP, invitations, etc.) ──

await queueService.consume("emails", async (msg) => {
  const { to, subject, html, text } = JSON.parse(msg!.content.toString());
  await mailerService.sendMail({ to, subject, html, text });
  logger.info("Email sent", { to, subject });
});

logger.info("Auth worker started — consuming 'emails' queue");
