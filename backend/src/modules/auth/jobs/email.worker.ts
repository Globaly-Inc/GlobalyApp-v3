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

// ── Create admin role-link on invitation accept ──

await queueService.consume("admin_invitation_accept", async (msg) => {
  const { invitation_id, platform_user_id, role, invited_by } = JSON.parse(msg!.content.toString());

  const existing = await adminRepo.findAdminByPlatformUserId(platform_user_id);
  if (existing) {
    logger.warn("Admin role already exists, skipping", { platform_user_id });
    await adminRepo.markInvitationAccepted(invitation_id);
    return;
  }

  await adminRepo.insertAdmin({
    platform_user_id,
    role,
    added_by: invited_by,
  });

  await adminRepo.markInvitationAccepted(invitation_id);
  logger.info("Admin role-link created from invitation", { platform_user_id, role });
});

logger.info("Auth worker started — consuming 'emails' + 'admin_invitation_accept' queues");
