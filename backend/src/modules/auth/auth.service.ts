// Unified auth service — all users authenticate via platform_users.
// OTP challenges and sessions are in separate tables (not on platform_users).
// Admins and business membership are role-links, not separate auth identities.

import { randomInt, randomBytes, createHash, scryptSync, timingSafeEqual, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "../../config.js";
import { createChildLogger } from "../../shared/logger.js";
import { AppError, ForbiddenError, NotFoundError, UnauthorizedError } from "../../shared/errors.js";
import { queueService } from "../../shared/queue/queueService.js";
import { mailerService } from "../../shared/mail/mailerService.js";
import * as storage from "../../shared/storage/storageService.js";
import { emailLayout, otpEmail, esc } from "../../shared/mail/templates.js";

import * as platformUserRepo from "../platform-users/repositories/platform-users.repository.js";
import * as businessRepo from "../businesses/repositories/businesses.repository.js";
import * as adminRepo from "../superadmin/admin-users/repositories/admin-users.repository.js";
import * as authRepo from "./auth.repository.js";
import { getKnex } from "../../core/db/pool-manager.js";
import { schemaName } from "../../core/db/knex.js";
import { issueCode } from "../referrals/services/codes.service.js";
import { materialiseReferral, validateRefToken } from "../referrals/services/attribution.service.js";

import type { AuthClaims } from "../../core/types.js";

const logger = createChildLogger("auth-service");

// ponytail: configurable via env — OTP_MAX_ATTEMPTS, OTP_LOCKOUT_MINUTES, SESSION_EXPIRY_DAYS

// ── helpers ──

/** SHA-256 hash for refresh tokens (high-entropy random data, fast hash is fine). */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Slow hash for OTP (6-digit, low-entropy — scrypt prevents brute-force if DB leaks). */
function hashOtp(otp: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(otp, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

/** Verify OTP against scrypt hash. Constant-time comparison. */
function verifyOtpHash(otp: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const check = scryptSync(otp, salt, 64).toString("hex");
  return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(check, "hex"));
}

/** Encode userId into refresh token so failed lookups can identify the user for family detection. */
function encodeRefreshToken(userId: number): { raw: string; hashed: string } {
  const random = randomBytes(40).toString("hex");
  const raw = `${userId}.${random}`;
  return { raw, hashed: hashToken(raw) };
}

/** Decode userId from a refresh token. Returns null if format is invalid. */
function decodeRefreshUserId(token: string): number | null {
  const dot = token.indexOf(".");
  if (dot === -1) return null;
  const id = Number(token.slice(0, dot));
  return Number.isFinite(id) ? id : null;
}

/** Derive a short device label from user-agent string. */
function deriveDeviceLabel(ua?: string): string | null {
  if (!ua) return null;
  if (ua.includes("Mobile")) return "Mobile";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Safari")) return "Safari";
  return "Unknown";
}

export type OrgType = "business" | "institution";

function signAccessToken(user: {
  id: number;
  email: string;
  adminRole?: string;
  orgId?: string;
  orgRole?: string;
  orgType?: OrgType;
}) {
  const payload: Record<string, unknown> = {
    sub: user.id,
    type: user.adminRole ? "admin" : "platform_user",
    email: user.email,
  };
  if (user.adminRole) payload.role = user.adminRole;
  if (user.orgId) {
    payload.orgId = user.orgId;
    payload.orgRole = user.orgRole;
    // Always stamped from here on. The tenant plugin still treats an absent orgType as
    // "business" so tokens minted before institution context existed keep working.
    payload.orgType = user.orgType ?? "business";
  }

  return jwt.sign(payload, config.JWT_SECRET as jwt.Secret, {
    expiresIn: config.JWT_EXPIRY as jwt.SignOptions["expiresIn"],
  });
}

/**
 * Mints an org-scoped access token outside the login flow — e.g. right after a logged-in user
 * registers their own business or institution, so they don't have to sign in again to get
 * org context.
 */
export function issueScopedAccessToken(
  user: { id: number; email: string },
  orgId: string,
  orgRole: string,
  orgType: OrgType = "business",
) {
  return signAccessToken({ id: user.id, email: user.email, orgId, orgRole, orgType });
}

/**
 * Which org a freshly minted token should be scoped to.
 *
 * `preferredOrgId` is the org this session last switched to (`auth_sessions.org_id`, written by
 * switchAccount). Honouring it is what stops a silent /refresh from dragging a user who
 * switched org back to their default one. It is searched across BOTH kinds, so an institution
 * switch survives a refresh exactly like a business switch does.
 *
 * Falling back, business wins when the user has both: it keeps every existing business user's
 * login byte-identical to before institution context existed. Such a user reaches their
 * institution with POST /auth/switch-account.
 */
async function resolveOrgScope(userId: number, preferredOrgId?: string | null) {
  const [businesses, institutions] = await Promise.all([
    platformUserRepo.listUserBusinesses(userId),
    platformUserRepo.listUserInstitutions(userId),
  ]);

  const scoped = (
    org: { org_id: string; role: string } | undefined,
    orgType: OrgType,
  ) => (org ? { businesses, institutions, orgId: org.org_id, orgRole: org.role, orgType } : null);

  // The remembered org only counts while the membership still holds — listUser* already
  // exclude revoked/soft-deleted rows, so a user removed from that org falls back instead of
  // being handed a token for something they can no longer enter.
  if (preferredOrgId) {
    const remembered =
      scoped(businesses.find((b) => b.org_id === preferredOrgId), "business") ??
      scoped(institutions.find((i) => i.org_id === preferredOrgId), "institution");
    if (remembered) return remembered;
  }

  return (
    scoped(businesses[0], "business") ??
    scoped(institutions[0], "institution") ?? {
      businesses,
      institutions,
      orgId: undefined,
      orgRole: undefined,
      orgType: undefined,
    }
  );
}

// ── email queue ──

export async function queueEmail(options: { to: string; subject: string; html: string; text?: string }) {
  try {
    await queueService.publish("emails", options);
  } catch {
    // ponytail: fallback to direct send when queue is unavailable (local dev)
    logger.warn("Queue unavailable, sending email directly", { to: options.to });
    await mailerService.sendMail(options);
  }
}

export async function queueInvitationEmail(options: {
  to: string;
  name: string;
  role: string;
  acceptUrl: string;
}) {
  await queueEmail({
    to: options.to,
    subject: "You have been invited to GlobalyHub",
    html: emailLayout({
      heading: "You have been invited to GlobalyHub",
      body: `<p style="margin:0 0 12px">Hi ${esc(options.name)},</p>
             <p style="margin:0">You have been invited to join as <strong>${esc(options.role)}</strong>.</p>`,
      cta: { label: "Accept invitation", href: options.acceptUrl },
      footnote: "This link expires in 72 hours.",
    }),
    text: `Hi ${options.name}, you have been invited to join GlobalyHub as ${options.role}. Accept: ${options.acceptUrl} (expires in 72 hours).`,
  });
}

// ── public API ──

export async function registerUser(
  firstName: string,
  lastName: string,
  email: string,
  refToken?: string,
) {
  // Checked BEFORE the account lookup and keyed on the business's own contact email, because a
  // promoted listing has no owner to find it by and its claimant usually has no account yet —
  // the old owner-based check only ever fired for people who had already registered. Naming the
  // listing leaks nothing: promoted listings are public catalog entries.
  const pendingBusiness = await businessRepo.findUnclaimedBusinessByContactEmail(email);
  if (pendingBusiness) {
    throw new AppError(
      `A business profile ("${pendingBusiness.business_name}") already exists for this email. Would you like to claim it?`,
      409,
      "BUSINESS_CLAIM_AVAILABLE",
    );
  }

  const existing = await platformUserRepo.findByEmail(email);
  if (existing) {
    // Reveals account existence by design — the product wants sign-up to tell the caller
    // directly that the email is already registered (EMAIL_ALREADY_EXISTS, handled by the
    // frontend as an inline field error), on top of notifying the real owner by email in case
    // the caller isn't them.
    queueEmail({
      to: email,
      subject: "Registration attempt on your GlobalyApp account",
      html: emailLayout({
        heading: "Someone tried to sign up with your email",
        body: `<p style="margin:0">An account already exists for this address. If that was you, sign in instead — no new account was created.</p>`,
        cta: { label: "Sign in", href: `${config.WEB_APP_URL.replace(/\/$/, "")}/auth/sign-in` },
        footnote: "If this wasn't you, no action is needed.",
      }),
    }).catch((err) => logger.warn("Registration notice email failed", { email, err: err.message }));
    throw new AppError("An account already exists with this email. Please sign in instead.", 409, "EMAIL_ALREADY_EXISTS");
  }

  // W1 (click -> registration) is decided HERE and never re-evaluated: the token's own `exp` is the
  // window. Pure jwt.verify + shape check, no DB, and it cannot throw — so a referral can never fail a
  // registration (INV-7). A referral row is NOT created yet: this account does not exist until the OTP
  // is verified, and attributing now would burn the one-referral-per-person slot on registrations that
  // are abandoned.
  const pendingReferral = validateRefToken(refToken);

  const user = await platformUserRepo.insert({
    first_name: firstName,
    last_name: lastName,
    email,
    account_status: 0, // inactive until OTP verified
    is_personal_account: true,
    meta: pendingReferral ? { pending_referral: pendingReferral } : undefined,
  });

  // Referral code issuance is idempotent and never throws; a failure is repaired by
  // `npm run job:referral-codes` rather than blocking the account (INV-10).
  issueCode("user", user.id).catch((err) =>
    logger.warn("Referral code issuance error", { userId: user.id, err: err.message }),
  );

  const otp = String(randomInt(100_000, 999_999));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await authRepo.createOtpChallenge(email, hashOtp(otp), expiresAt);

  queueEmail({ to: email, ...otpEmail(otp) }).catch((err) =>
    logger.warn("OTP email failed (registration succeeded)", { email, err: err.message }),
  );

  logger.info("User registered", { userId: user.id });
  return { message: "Check your email for next steps." };
}

/** Blocks login only when the user is suspended everywhere they'd otherwise have access — an
 * explicit, still-current suspension (a member/agent row that exists and is flagged suspended)
 * on EVERY org they belong to, with no active org left to fall back on. A user suspended from
 * one org but still an active member of another (or with personal-account access unrelated to
 * either) must still be able to log in — the earlier version of this check blocked on any
 * suspended row at all, locking such a user out everywhere over a single org's suspension.
 * Likewise this is NOT "zero accessible orgs" in general, which also happens when someone was
 * cleanly removed from their last org, the org itself was disabled/deleted, or an institution
 * hasn't been provisioned yet — none of those are suspension, and the is_business_account/
 * is_institution_account flags never get reset after such a removal. Suspending a member only
 * ever updated members/agents in the tenant schema; login itself never checked it before this,
 * so a fully suspended user could still request and use an OTP. */
async function requireLoginNotSuspended(user: {
  id: number; is_business_account: boolean; is_institution_account: boolean; is_personal_account: boolean;
}) {
  if (!user.is_business_account && !user.is_institution_account) return;
  // A personal account is valid access in its own right, independent of any org membership — a
  // user suspended out of their sole org but who also has personal-account access must still be
  // able to log in and use it. The comment above once claimed this was already handled; it
  // wasn't — this was the actual missing check.
  if (user.is_personal_account) return;
  const [suspendedBusiness, suspendedInstitution, activeBusinesses, activeInstitutions] = await Promise.all([
    user.is_business_account ? platformUserRepo.hasSuspendedBusinessMembership(user.id) : false,
    user.is_institution_account ? platformUserRepo.hasSuspendedInstitutionMembership(user.id) : false,
    user.is_business_account ? platformUserRepo.listUserBusinesses(user.id) : [],
    user.is_institution_account ? platformUserRepo.listUserInstitutions(user.id) : [],
  ]);
  const isSuspendedSomewhere = suspendedBusiness || suspendedInstitution;
  const hasActiveOrgLeft = activeBusinesses.length > 0 || activeInstitutions.length > 0;
  if (isSuspendedSomewhere && !hasActiveOrgLeft) {
    throw new ForbiddenError("Your account has been suspended. Contact your administrator.");
  }
}

export async function sendOtp(email: string) {
  const user = await platformUserRepo.findByEmail(email);
  if (!user) throw new NotFoundError("Account not found");
  await requireLoginNotSuspended(user);

  // Check lockout from existing challenge
  const existing = await authRepo.findOtpChallenge(email);
  if (existing?.locked_until && new Date() < new Date(existing.locked_until)) {
    throw new UnauthorizedError("Too many attempts. Try again later.");
  }

  const otp = String(randomInt(100_000, 999_999));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await authRepo.createOtpChallenge(email, hashOtp(otp), expiresAt);

  await queueEmail({ to: user.email, ...otpEmail(otp) });

  // The plaintext OTP is a bearer credential — never let it reach production logs.
  logger.info("OTP sent", {
    userId: user.id,
    ...(config.NODE_ENV === "production" ? {} : { otp }),
  });
  return { message: "OTP sent" };
}

export async function verifyOtp(email: string, otp: string, meta?: { ip?: string; userAgent?: string }) {
  const user = await platformUserRepo.findByEmail(email);
  if (!user) throw new NotFoundError("Account not found");
  // Re-checked here too (not just sendOtp) — a suspension landing between "code sent" and
  // "code entered" must still block completing the login, not just requesting a fresh code.
  await requireLoginNotSuspended(user);

  const challenge = await authRepo.findOtpChallenge(email);
  if (!challenge) throw new UnauthorizedError("No OTP requested");

  if (challenge.locked_until && new Date() < new Date(challenge.locked_until)) {
    throw new UnauthorizedError("Too many attempts. Try again later.");
  }

  if (new Date() > new Date(challenge.expires_at)) {
    throw new UnauthorizedError("OTP expired");
  }

  // Compare using scrypt — slow hash, constant-time
  if (!verifyOtpHash(otp, challenge.otp_hash)) {
    const attempts = (challenge.attempts ?? 0) + 1;
    if (attempts >= config.OTP_MAX_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + config.OTP_LOCKOUT_MINUTES * 60 * 1000);
      await authRepo.lockOtp(challenge.id, attempts, lockedUntil);
    } else {
      await authRepo.incrementOtpAttempts(challenge.id, attempts);
    }
    throw new UnauthorizedError("Invalid OTP");
  }

  // OTP valid — clean up challenge
  await authRepo.deleteOtpChallenge(challenge.id);

  // Activate account on first verification
  const updates: Record<string, unknown> = {};
  if (!user.is_email_verified) updates.is_email_verified = true;
  if (user.account_status === 0) updates.account_status = 1;
  if (Object.keys(updates).length > 0) {
    await platformUserRepo.updateUser(user.id, updates);
  }

  // Materialise a pending referral, on EVERY successful verification.
  //
  // Deliberately NOT gated on "was this the first activation". This endpoint is the shared login
  // endpoint, and that is precisely what makes each later sign-in a free retry: if attribution hits a
  // transient DB error, the pending token is retained and the next login picks it up. Gating on
  // account_status === 0 would strand that token forever with nothing left to consume it.
  //
  // Duplication is prevented by the database (consume-once meta + referrals_referred_unique), not by
  // the call site. The service returns immediately when nothing is pending, so a normal login costs
  // one indexed read. Fire-and-forget: a referral must never affect the login response (INV-7).
  materialiseReferral(user.id).catch((err) =>
    logger.warn("Referral attribution deferred", { userId: user.id, err: err.message }),
  );

  const adminRecordAny = await adminRepo.findAdminByPlatformUserIdIncludingInactive(user.id);
  if (adminRecordAny && !adminRecordAny.is_active) {
    throw new ForbiddenError("This user is not active. Please contact administrator.");
  }
  const adminRecord = adminRecordAny;

  // Create a new session (multi-device — doesn't kill other sessions)
  const { raw: rawRefresh, hashed: hashedRefresh } = encodeRefreshToken(user.id);
  const family = randomUUID();
  const sessionExpiry = new Date(Date.now() + config.SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  // A platform_user can own several orgs; login has no "which one did they pick last" signal
  // of its own (that lives on the session, updated by switchAccount), so a fresh login starts
  // on their default org. This session's org_id is what /refresh will honor from here on.
  const scope = await resolveOrgScope(user.id);

  await authRepo.createSession({
    platform_user_id: user.id,
    refresh_token_hash: hashedRefresh,
    token_family: family,
    ip_address: meta?.ip ?? null,
    user_agent: meta?.userAgent ?? null,
    device_label: deriveDeviceLabel(meta?.userAgent),
    expires_at: sessionExpiry,
    org_id: scope.orgId ?? null,
  });

  const accessToken = signAccessToken({
    id: user.id,
    email: user.email,
    adminRole: adminRecord?.role,
    orgId: scope.orgId,
    orgRole: scope.orgRole,
    orgType: scope.orgType,
  });

  logger.info("User authenticated", { userId: user.id, isAdmin: !!adminRecord, orgType: scope.orgType });
  return {
    access_token: accessToken,
    refresh_token: rawRefresh,
    user: {
      id: user.id,
      email: user.email,
      type: adminRecord ? ("admin" as const) : ("platform_user" as const),
      role: adminRecord?.role ?? null,
    },
    businesses: scope.businesses,
    institutions: scope.institutions,
  };
}

export async function refreshAccessToken(refreshToken: string, meta?: { ip?: string; userAgent?: string }) {
  const hashed = hashToken(refreshToken);

  const session = await authRepo.findSessionByRefreshToken(hashed);
  if (session) {
    // Check session expiry
    if (new Date() > new Date(session.expires_at)) {
      await authRepo.deleteSession(session.id);
      throw new UnauthorizedError("Session expired");
    }

    const userId = session.platform_user_id;
    const user = await platformUserRepo.findByIdFull(userId);
    if (!user) {
      await authRepo.deleteSession(session.id);
      throw new UnauthorizedError("User not found");
    }

    // Warn on IP/device mismatch (defensive, not blocking)
    if (meta?.ip && session.ip_address && meta.ip !== session.ip_address) {
      logger.warn("Refresh token used from different IP", {
        userId, expected: session.ip_address, actual: meta.ip,
      });
    }

    // Token valid — rotate
    const adminRecord = await adminRepo.findAdminByPlatformUserId(userId);
    // Honor whichever org this session last switched to (switchAccount records it), falling
    // back to the default if none was recorded or membership no longer holds — e.g. the user
    // was removed from it since. Without this, every refresh (which happens silently in the
    // background) would reset a user with multiple orgs back to whichever sorts first,
    // undoing any switch they'd made.
    const scope = await resolveOrgScope(userId, session.org_id);

    const accessToken = signAccessToken({
      id: userId,
      email: user.email,
      adminRole: adminRecord?.role,
      orgId: scope.orgId,
      orgRole: scope.orgRole,
      orgType: scope.orgType,
    });

    const { raw: newRaw, hashed: newHashed } = encodeRefreshToken(userId);
    await authRepo.rotateRefreshToken(session.id, newHashed);

    // Update IP/device on successful refresh
    await authRepo.updateSessionMeta(session.id, {
      ip_address: meta?.ip ?? session.ip_address,
      user_agent: meta?.userAgent ?? session.user_agent,
    });

    return {
      access_token: accessToken,
      refresh_token: newRaw,
      type: adminRecord ? ("admin" as const) : ("platform_user" as const),
    };
  }

  // Token not found — check for reuse (stolen token replayed after rotation)
  const userId = decodeRefreshUserId(refreshToken);
  if (userId) {
    // Find any session for this user to check if family exists
    const sessions = await authRepo.findSessionsByUserId(userId);
    if (sessions.length > 0) {
      // Reuse detected — nuke ALL sessions for safety
      logger.warn("Refresh token reuse detected — invalidating all sessions", { userId });
      await authRepo.deleteAllSessions(userId);
    }
  }

  throw new UnauthorizedError("Invalid refresh token");
}

/**
 * Re-scopes the access token to a specific org, by schema_name — used by the header switcher
 * (a user holding more than one org) and by /business/profile/:id reconciling context to
 * whatever org a deep link names.
 *
 * The org kind is inferred from which table owns the schema_name — the caller does not have
 * to say. Membership is re-checked against the tenant (`agents` / `members`) rather than the
 * master index, so a revoked membership cannot be re-scoped into.
 *
 * When the caller's refresh token is supplied, the choice is recorded on that session so
 * /refresh keeps honoring it instead of resetting to their default org on the next silent
 * refresh. Applies to both kinds.
 */
/**
 * Mints a short-lived, single-purpose token for a "Preview" button (self-service or superadmin —
 * see search/utils/preview-auth.ts's resolvePreviewSchemaName) — NOT the caller's real session
 * token. Putting the actual bearer access token in a URL query string would leave a fully
 * reusable credential sitting in browser history, server logs and referrer headers; this token
 * carries no `sub`/`orgRole`/role claims, expires in 10 minutes, and `purpose: "preview"` makes
 * the main auth plugin refuse it outright as a session token (see auth.plugin.ts), so a leaked
 * preview link can only ever bypass is_published on the two public preview routes it was
 * minted for.
 */
export function issuePreviewTokenForOrg(orgId: string, orgType: "institution") {
  return jwt.sign({ purpose: "preview", orgType, orgId }, config.JWT_SECRET, { expiresIn: "10m" });
}

/** Self-service wrapper — mints a preview token for the caller's OWN institution context. */
export function issuePreviewToken(auth: AuthClaims) {
  if (auth.orgType !== "institution" || !auth.orgId) {
    throw new ForbiddenError("Switch to an institution context first");
  }
  return issuePreviewTokenForOrg(auth.orgId, "institution");
}

export async function switchAccount(userId: number, orgId: string, refreshToken?: string) {
  const user = await platformUserRepo.findByIdFull(userId);
  if (!user) throw new NotFoundError("User not found");

  // Only after membership is confirmed — remembering an org the caller can't enter would make
  // every later refresh fall back anyway, and hide the real problem.
  const rememberOnSession = async () => {
    if (!refreshToken) return;
    const session = await authRepo.findSessionByRefreshToken(hashToken(refreshToken));
    if (session?.platform_user_id === userId) {
      await authRepo.updateSessionOrgId(session.id, orgId);
    }
  };

  const business = await platformUserRepo.findBusinessByDbName(orgId);
  if (business) {
    const db = await getKnex(business.id, schemaName(business.schema_name));
    // deleted_at MUST be filtered here, exactly as requirePermission does. Without it a
    // removed agent still gets an orgId-scoped token: it 403s on permissioned routes but
    // passes every route guarded only by requireBusinessContext, and the tenant db handle
    // is attached either way. It also produced a confusing failure — switching "worked",
    // then every business page reported "Not a member of this business".
    // account_status: 1 is required too (mirroring the institution branch below) — a suspended
    // agent is already excluded from the initial org scope (resolveOrgScope), but without this
    // check they could still call switch-account directly with the business's own id and get an
    // org-scoped token for the very membership they're suspended from.
    // is_contact_only excluded too — a contact who was never through invite-accept has an
    // active, non-deleted agents row (createContact) but has never proven they own this
    // account; without this a dormant contact could call switch-account directly and mint
    // themselves a real org-scoped token for a business they were never invited to.
    const agent = await db("agents")
      .join("roles", "agents.role_id", "roles.id")
      .where("agents.platform_user_id", userId)
      .where("agents.account_status", 1)
      .where("agents.is_contact_only", false)
      .whereNull("agents.deleted_at")
      .select("roles.name as role")
      .first();

    if (!agent) throw new UnauthorizedError("Not a member of this business");
    await rememberOnSession();

    logger.info("Account switched", { userId, orgId, orgType: "business", role: agent.role });
    return {
      access_token: issueScopedAccessToken({ id: user.id, email: user.email }, orgId, agent.role, "business"),
      org_type: "business" as const,
    };
  }

  const institution = await platformUserRepo.findInstitutionBySchemaName(orgId);
  if (!institution) throw new NotFoundError("Organisation not found");

  // Pool key is the schema uuid — institution ids would collide with business ids.
  const db = await getKnex(institution.schema_name, schemaName(institution.schema_name));
  // is_contact_only excluded too — same reasoning as the business branch above: a contact
  // never through invite-accept must not be able to switch-account their way into a real
  // institution-scoped token.
  const member = await db("members")
    .where({ platform_user_id: userId, account_status: 1, is_contact_only: false })
    .whereNull("deleted_at")
    .first("role");

  if (!member) throw new UnauthorizedError("Not a member of this institution");
  await rememberOnSession();

  logger.info("Account switched", { userId, orgId, orgType: "institution", role: member.role });
  return {
    access_token: issueScopedAccessToken({ id: user.id, email: user.email }, orgId, member.role, "institution"),
    org_type: "institution" as const,
  };
}

export async function logout(userId: number, refreshToken?: string) {
  if (refreshToken) {
    // Logout single device — delete only this session
    const hashed = hashToken(refreshToken);
    const session = await authRepo.findSessionByRefreshToken(hashed);
    if (session) {
      await authRepo.deleteSession(session.id);
    }
  } else {
    // Logout all devices
    await authRepo.deleteAllSessions(userId);
  }
  logger.info("User logged out", { userId });
}

export async function getMe(auth: AuthClaims) {
  const id = Number(auth.sub);

  const user = await platformUserRepo.findById(id);
  if (!user) throw new NotFoundError("User not found");

  // platform_users.photo_url/cover_url are storage paths, not URLs — sign them the same way
  // platform-users.service.ts does, so every /me-shaped response resolves to a viewable image.
  const [photo_url, cover_url] = await Promise.all([
    storage.resolvePreviewUrl(user.photo_url),
    storage.resolvePreviewUrl(user.cover_url),
  ]);

  // Looked up unconditionally, not gated on `auth.type === "admin"`: `type` reflects what the
  // CURRENT token can do (a business-scoped token reads "platform_user" even for an admin who
  // switched into a business they own), but `is_admin`/`admin_role` answer "is this person also
  // an admin" independent of that scoping, so the frontend can still show a "Super Admin" entry
  // after a switch instead of losing it.
  const adminRecord = await adminRepo.findAdminByPlatformUserId(id);

  const result: Record<string, unknown> = {
    ...user,
    photo_url,
    cover_url,
    type: auth.type,
    is_admin: !!adminRecord,
    admin_role: adminRecord?.role ?? null,
    admin_id: adminRecord?.id ?? null,
  };

  if (auth.orgId) {
    result.orgId = auth.orgId;
    result.orgRole = auth.orgRole;
    // Absent on tokens minted before institution context existed — those are businesses.
    result.orgType = auth.orgType ?? "business";
  }

  // Both lists, so the frontend can offer a picker and know which switch-account targets
  // exist. Membership in either is what makes /auth/switch-account succeed.
  const [businesses, institutions] = await Promise.all([
    platformUserRepo.listUserBusinesses(id),
    platformUserRepo.listUserInstitutions(id),
  ]);
  result.businesses = await Promise.all(
    businesses.map(async (b) => ({ ...b, logo_url: await storage.resolvePreviewUrl(b.logo_url) })),
  );
  result.institutions = await Promise.all(
    institutions.map(async (i) => ({ ...i, logo_url: await storage.resolvePreviewUrl(i.logo_url) })),
  );

  return { user: result };
}