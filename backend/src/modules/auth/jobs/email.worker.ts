// Worker — sends all queued emails and processes invitation acceptances.
// Run with: npm run job:auth

import "dotenv/config";
import { queueService } from "../../../shared/queue/queueService.js";
import { mailerService } from "../../../shared/mail/mailerService.js";
import { createChildLogger } from "../../../shared/logger.js";
import * as adminRepo from "../../superadmin/admin-users/repositories/admin-users.repository.js";

const logger = createChildLogger("auth-worker");

// ── Send all emails (OTP, invitations, etc.) ──

await queueService.consume("emails", async (msg) => {
  const { to, subject, html, text } = JSON.parse(msg!.content.toString());
  await mailerService.sendMail({ to, subject, html, text });
  logger.info("Email sent", { to, subject });
});

// ── Create admin user on invitation accept ──

await queueService.consume("admin_invitation_accept", async (msg) => {
  const { invitation_id, name, email, role, invited_by } = JSON.parse(msg!.content.toString());

  const existing = await adminRepo.findAdminByEmail(email);
  if (existing) {
    logger.warn("Admin already exists, skipping", { email });
    await adminRepo.markInvitationAccepted(invitation_id);
    return;
  }

  await adminRepo.insertAdmin({
    name,
    email,
    role,
    account_status: 1,
    added_by: invited_by,
  });

  await adminRepo.markInvitationAccepted(invitation_id);
  logger.info("Admin user created from invitation", { email, role });
});

logger.info("Auth worker started — consuming 'emails' + 'admin_invitation_accept' queues");
