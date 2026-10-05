import { createHash, randomBytes } from "node:crypto";
import { config } from "../../../config.js";
import { masterKnex } from "../../../core/db/master-pool.js";
import { AppError, BadRequestError, ConflictError, NotFoundError } from "../../../shared/errors.js";
import { createChildLogger } from "../../../shared/logger.js";
import { onboardingInviteEmail, onboardingLinkRequestEmail } from "../../../shared/mail/templates.js";
import { mailerService } from "../../../shared/mail/mailerService.js";
import { queueEmail } from "../../auth/auth.service.js";
import { registerBusiness } from "../../businesses/services/businesses.service.js";
import { issueCode } from "../../referrals/services/codes.service.js";
import * as jobsRepo from "../../superadmin/data-extraction/repositories/jobs.repository.js";
import * as repo from "../repositories/onboarding-invitations.repository.js";
import * as userRepo from "../repositories/platform-users.repository.js";
import { onboardInstitution } from "./platform-users.service.js";
import {
  markWelcomePendingForBusiness,
  markWelcomePendingForInstitution,
} from "../../businesses/services/onboarding-progress.service.js";

const logger = createChildLogger("onboarding-invitations");
const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
const SEND_TIMEOUT_MS = 30 * 1000;

type InviteType = repo.OnboardingInvitationRow["type"];
type InviteDelivery = { id: string; email: string; type: InviteType; orgName: string; categoryName: string | null; token: string };

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

function mintToken() {
  const token = randomBytes(32).toString("hex");
  return { token, token_hash: hashToken(token), expires_at: new Date(Date.now() + INVITE_TTL_MS) };
}

export function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Mail server didn't confirm within ${ms / 1000}s — the email may still arrive`)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/** Sends within the admin's request and records the outcome; a failure is shown as "Email failed"
 *  and fixed with Resend, never thrown — the invite itself was created. */
async function sendInviteEmail(d: InviteDelivery): Promise<"sent" | "failed"> {
  const acceptUrl = `${config.WEB_APP_URL}/invite/onboarding?token=${d.token}&type=${d.type}`;
  try {
    await withTimeout(
      mailerService.sendMail({ to: d.email, ...onboardingInviteEmail({ acceptUrl, kind: d.type, orgName: d.orgName, categoryName: d.categoryName }) }),
      SEND_TIMEOUT_MS,
    );
    await repo.markEmailSent(d.id);
    return "sent";
  } catch (err: any) {
    logger.warn("Onboarding invite email failed", { invitationId: d.id, err: err.message });
    await repo.markEmailFailed(d.id, err.message ?? "Unknown error").catch(() => {});
    return "failed";
  }
}

export async function sendInvitation(email: string, orgName: string, businessCategoryId: number, invitedBy: number, contactName?: string) {
  const category = await repo.findCategory(businessCategoryId);
  if (!category) throw new BadRequestError("Unknown business category");
  // Institutions are their own table and onboarding; every other category is a business.
  const type: InviteType = category.slug === "institutions" ? "institution" : "business";

  const { token, token_hash, expires_at } = mintToken();
  let id: string;
  try {
    ({ id } = await repo.insertInvitation({ email, type, org_name: orgName, contact_name: contactName ?? null, business_category_id: category.id, token_hash, invited_by: invitedBy, expires_at }));
  } catch (err: any) {
    // Same address sent by two admins at once — the pending-email index lets only one through.
    if (err.code === "23505") throw new ConflictError("Already invited");
    throw err;
  }
  await repo.clearLinkRequestsForEmail(email);
  const email_status = await sendInviteEmail({ id, email, type, orgName, categoryName: category.name, token });
  return { email, type, email_status };
}

export async function listInvitations(limit: number, offset: number, status?: repo.InvitationStatusFilter, search?: string) {
  const { rows, total, counts } = await repo.listInvitations(limit, offset, status, search);
  const now = Date.now();
  const data = rows.map((r: { status: string; expires_at: Date }) => ({
    ...r,
    status: r.status === "pending" && new Date(r.expires_at).getTime() <= now ? "expired" : r.status,
  }));
  return { data, total, counts };
}

/** A new token, so an expired invite becomes usable again and any older link stops working. */
/** `ifRequested`: the resend link in a "new link requested" email — a second open of it (the
 *  request is cleared by the first resend) must not mail the invitee yet another link. */
export async function resendInvitation(id: string, { ifRequested = false } = {}) {
  const invite = await repo.findPendingById(id);
  if (!invite) throw new NotFoundError("Only a pending invite can be resent");
  if (ifRequested && !invite.link_requested_at) throw new ConflictError("This invite was already resent.");
  const { token, token_hash, expires_at } = mintToken();

  if (!(await repo.refreshToken(id, token_hash, expires_at, { onlyIfRequested: ifRequested }))) {
    throw new ConflictError("This invite changed just now — reload the list and try again.");
  }
  const category = invite.business_category_id ? await repo.findCategory(invite.business_category_id) : undefined;
  const email_status = await sendInviteEmail({ id: invite.id, email: invite.email, type: invite.type, orgName: invite.org_name, categoryName: category?.name ?? null, token });
  return { expires_at, email_status };
}

export async function deleteInvitation(id: string) {
  if (await repo.deleteInvitation(id)) return;
  if (await repo.findById(id)) {
    throw new ConflictError("This invite is being accepted right now — their account is still being set up.");
  }
  throw new NotFoundError("Invite not found");
}

export async function revokeInvitation(id: string) {
  const invite = await repo.findPendingById(id);
  if (!invite) throw new NotFoundError("Only a pending invite can be revoked");
  if (!(await repo.transitionStatus(id, "pending", "revoked"))) {
    throw new ConflictError("This invite was accepted just now, so it can no longer be revoked");
  }
}

/** Creates the account and org but deliberately returns no session: a mail scanner that opens the
 *  link can only use it up, never sign in — the recipient signs in with an OTP to their own inbox. */
export async function acceptInvitation(token: string, type: InviteType) {
  const tokenHash = hashToken(token);
  const invite = await repo.claimPending(tokenHash, type);
  if (!invite) {
    // An accepted link never signs anyone in again — otherwise it's a password-free login forever.
    const existing = await repo.findByTokenHash(tokenHash);
    if (existing?.status === "accepted" && existing.type === type) {
      throw new ConflictError("Your account is already set up. Sign in with your email to continue.", { email: existing.email });
    }
    const lapsed = await lapsedReason(tokenHash, type);
    if (lapsed?.reason === "revoked") throw new AppError("This invite was cancelled.", 410, "INVITE_REVOKED");
    if (lapsed?.reason === "expired") throw new AppError("This invite link has expired.", 410, "INVITE_EXPIRED");
    throw new NotFoundError("This invite link isn't valid.");
  }

  let createdUserId: number | undefined;
  let createdOrg: { kind: "business" | "institution"; id: number; schemaName: string; ownerId: number } | undefined;
  let user: Awaited<ReturnType<typeof userRepo.insert>>;
  // Everything after the claim is inside this try, so any failure — even a read — releases the link.
  try {
    const existing = await userRepo.findByEmail(invite.email);
    if (existing) {
      user = existing;
    } else {
      user = await userRepo.insert({
        first_name: invite.contact_name?.split(/\s+/)[0] ?? "",
        last_name: invite.contact_name?.split(/\s+/).slice(1).join(" ") ?? "",
        email: invite.email,
        account_status: 1,
        is_personal_account: true,
        meta: { created_via: "onboarding_invite" },
      });
      createdUserId = user.id;
      await userRepo.updateUser(user.id, { is_email_verified: true });
    }

    if (invite.type === "business") {
      const { org } = await registerBusiness(user.id, {
        business_name: invite.org_name,
        business_category_id: invite.business_category_id ?? undefined,
      });
      createdOrg = { kind: "business", id: Number(org.id), schemaName: org.org_id, ownerId: user.id };
      if (!(await repo.recordAccepted(invite.id, user.id, { businessId: Number(org.id) }))) {
        logger.warn("Invite vanished during setup; account kept without its invite row", { invitationId: invite.id, userId: user.id, businessId: org.id });
      }
      // Accepting an invitation is the one moment that earns the portal's welcome splash. Recorded
      // here, not carried in the URL, so it survives the OTP hop and cannot be replayed by a link.
      await markWelcomePendingForBusiness(Number(org.id));
      logger.info("Onboarding invite accepted", { invitationId: invite.id, userId: user.id, businessId: org.id });
    } else {
      const { institution } = await onboardInstitution(user.id, {
        institution_name: invite.org_name,
        email: invite.email,
      });
      createdOrg = { kind: "institution", id: Number(institution.id), schemaName: institution.org_id, ownerId: user.id };
      if (!(await repo.recordAccepted(invite.id, user.id, { institutionId: Number(institution.id) }))) {
        logger.warn("Invite vanished during setup; account kept without its invite row", { invitationId: invite.id, userId: user.id, institutionId: institution.id });
      }
      await markWelcomePendingForInstitution(Number(institution.id));
      logger.info("Onboarding invite accepted", { invitationId: invite.id, userId: user.id, institutionId: institution.id });
    }
  } catch (err) {
    if (createdUserId) await rollbackUser(createdUserId);
    else if (createdOrg) await rollbackOrg(createdOrg);
    await repo.revertToPending(invite.id);
    throw err;
  }

  // An adopted account already got its referral code at its own signup.
  if (createdUserId !== undefined) {
    const newUserId = createdUserId;
    issueCode("user", newUserId).catch((err) =>
      logger.warn("Referral code issuance error", { userId: newUserId, err: err.message }),
    );
  }
  return { email: invite.email, type: invite.type };
}

const SUPPORT_EMAIL = "support@globalyapp.com";

/** Why a link that matches a real invite can't be used: the invite was revoked, or this link (or the
 *  whole invite) is past its expiry. Null for an unknown link, or one already accepted. */
async function lapsedReason(tokenHash: string, type: InviteType) {
  const invite = await repo.findByTokenHash(tokenHash);
  if (!invite || invite.type !== type) return null;
  if (invite.status === "revoked") return { reason: "revoked" as const, invite };
  if (invite.status === "pending" && !(await repo.isLiveToken(tokenHash))) return { reason: "expired" as const, invite };
  return null;
}

/** "Request a new link" from an expired or revoked invite: emails the admin who sent it (support
 *  when that admin is gone), at most once a day per invite. The admin answers from Business Invites. */
export async function requestNewLink(token: string, type: InviteType) {
  const lapsed = await lapsedReason(hashToken(token), type);
  if (!lapsed) throw new NotFoundError("This invite link isn't valid.");
  const { reason, invite } = lapsed;
  // Already asked today: the admin has it, so report success without a second email.
  if (!(await repo.markLinkRequested(invite.id))) return { requested: true };

  try {
    const to = (await repo.findInviterEmail(invite.invited_by)) ?? SUPPORT_EMAIL;
    const invitesUrl = `${config.WEB_APP_URL}/admin/platform/businesses?tab=invites`;
    const actionUrl = reason === "expired" ? `${invitesUrl}&resend=${invite.id}` : invitesUrl;
    await queueEmail({ to, ...onboardingLinkRequestEmail({ email: invite.email, orgName: invite.org_name, reason, invitesUrl, actionUrl }) });
  } catch (err: any) {
    logger.warn("New-link request email failed", { invitationId: invite.id, err: err.message });
    await repo.clearLinkRequest(invite.id).catch(() => {});
    throw new AppError(`We couldn't send your request. Email ${SUPPORT_EMAIL} instead.`, 502, "REQUEST_FAILED");
  }
  logger.info("New invite link requested", { invitationId: invite.id, reason });
  return { requested: true };
}

async function rollbackOrg(org: { kind: "business" | "institution"; id: number; schemaName: string; ownerId?: number }) {
  try {
    if (org.kind === "institution") {
      await masterKnex("user_institution_index").where({ institution_id: org.id }).delete();
      await masterKnex.raw("DROP SCHEMA IF EXISTS ?? CASCADE", [org.schemaName]);
      const row = await masterKnex("institutions").where({ id: org.id }).first("source_job_id");
      await userRepo.deleteInstitution(org.id);
      if (row?.source_job_id) await jobsRepo.deleteJob(row.source_job_id);
    } else {
      await masterKnex("user_business_index").where({ business_id: org.id }).delete();
      await masterKnex.raw("DROP SCHEMA IF EXISTS ?? CASCADE", [org.schemaName]);
      await masterKnex("businesses").where({ id: org.id }).delete();
    }
    if (org.ownerId) await resetAccountKind(org.ownerId, org.kind);
  } catch (err: any) {
    logger.error("Onboarding invite org rollback failed", { kind: org.kind, orgId: org.id, err: err.message });
  }
}

async function resetAccountKind(userId: number, kind: "business" | "institution") {
  const remaining = kind === "institution" ? await repo.findInstitutionByOwner(userId) : await repo.findBusinessByOwner(userId);
  if (remaining) return;
  await userRepo.updateUser(userId, kind === "institution" ? { is_institution_account: false } : { is_business_account: false });
  await userRepo.removeAccountCategory(userId, kind);
}

async function rollbackUser(userId: number) {
  try {
    const institution = await repo.findInstitutionByOwner(userId);
    if (institution) await rollbackOrg({ kind: "institution", id: Number(institution.id), schemaName: institution.schema_name });
    const business = await repo.findBusinessByOwner(userId);
    if (business) await rollbackOrg({ kind: "business", id: Number(business.id), schemaName: business.schema_name });
    await userRepo.deleteUser(userId);
  } catch (err: any) {
    logger.error("Onboarding invite rollback failed", { userId, err: err.message });
  }
}
