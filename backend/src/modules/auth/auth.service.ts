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

function signAccessToken(user: {
  id: number;
  email: string;
  adminRole?: string;
  orgId?: string;
  orgRole?: string;
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
  }

  return jwt.sign(payload, config.JWT_SECRET as jwt.Secret, {
    expiresIn: config.JWT_EXPIRY as jwt.SignOptions["expiresIn"],
  });
}

/**
 * Mints a business-scoped access token outside the login flow — e.g. right after a logged-in
 * user registers their own business, so they don't have to sign in again to get org context.
 */
export function issueScopedAccessToken(user: { id: number; email: string }, orgId: string, orgRole: string) {
  return signAccessToken({ id: user.id, email: user.email, orgId, orgRole });
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
  const existing = await platformUserRepo.findByEmail(email);
  if (existing) {
    // A business was pre-seeded for this exact person (owner account created ahead of time by an
    // admin) and they haven't claimed it yet — tell them plainly, rather than the generic
    // anti-enumeration response below, so they can claim instead of hitting a dead end.
    const pendingBusiness = await businessRepo.findUnclaimedBusinessByOwnerId(existing.id);
    if (pendingBusiness) {
      throw new AppError(
        `A business profile ("${pendingBusiness.business_name}") already exists for this email. Would you like to claim it?`,
        409,
        "BUSINESS_CLAIM_AVAILABLE",
      );
    }

    // Anti-enumeration: return identical response, send "someone tried to register" email
    queueEmail({
      to: email,
      subject: "Registration attempt on your Globaly account",
      html: emailLayout({
        heading: "Someone tried to sign up with your email",
        body: `<p style="margin:0">An account already exists for this address. If that was you, sign in instead — no new account was created.</p>`,
        cta: { label: "Sign in", href: `${config.WEB_APP_URL.replace(/\/$/, "")}/auth/sign-in` },
        footnote: "If this wasn't you, no action is needed.",
      }),
    }).catch((err) => logger.warn("Registration notice email failed", { email, err: err.message }));
    return { message: "Check your email for next steps." };
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

export async function sendOtp(email: string) {
  const user = await platformUserRepo.findByEmail(email);
  if (!user) throw new NotFoundError("Account not found");

  // Check lockout from existing challenge
  const existing = await authRepo.findOtpChallenge(email);
  if (existing?.locked_until && new Date() < new Date(existing.locked_until)) {
    throw new UnauthorizedError("Too many attempts. Try again later.");
  }

  const otp = String(randomInt(100_000, 999_999));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await authRepo.createOtpChallenge(email, hashOtp(otp), expiresAt);

  queueEmail({ to: user.email, ...otpEmail(otp) }).catch((err) =>
    logger.warn("OTP email failed", { email, err: err.message }),
  );

  logger.info("OTP sent", { userId: user.id, otp: otp });
  return { message: "OTP sent" };
}

export async function verifyOtp(email: string, otp: string, meta?: { ip?: string; userAgent?: string }) {
  const user = await platformUserRepo.findByEmail(email);
  if (!user) throw new NotFoundError("Account not found");

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

  await authRepo.createSession({
    platform_user_id: user.id,
    refresh_token_hash: hashedRefresh,
    token_family: family,
    ip_address: meta?.ip ?? null,
    user_agent: meta?.userAgent ?? null,
    device_label: deriveDeviceLabel(meta?.userAgent),
    expires_at: sessionExpiry,
  });

  // Business accounts have exactly one business today (no multi-business picker), so scope the
  // token to it right away instead of making the client round-trip through a separate switch call.
  const businesses = await platformUserRepo.listUserBusinesses(user.id);
  const primaryBusiness = businesses[0];

  const accessToken = signAccessToken({
    id: user.id,
    email: user.email,
    adminRole: adminRecord?.role,
    orgId: primaryBusiness?.org_id,
    orgRole: primaryBusiness?.role,
  });

  logger.info("User authenticated", { userId: user.id, isAdmin: !!adminRecord });
  return {
    access_token: accessToken,
    refresh_token: rawRefresh,
    user: {
      id: user.id,
      email: user.email,
      type: adminRecord ? ("admin" as const) : ("platform_user" as const),
      role: adminRecord?.role ?? null,
    },
    businesses,
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
    const businesses = await platformUserRepo.listUserBusinesses(userId);
    const primaryBusiness = businesses[0];

    const accessToken = signAccessToken({
      id: userId,
      email: user.email,
      adminRole: adminRecord?.role,
      orgId: primaryBusiness?.org_id,
      orgRole: primaryBusiness?.role,
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
 * Kept as a backend capability for future multi-business use (an agent belonging to more than
 * one business, or an explicit account picker) even though today's frontend doesn't call it —
 * business accounts are auto-scoped to their one business at login/registration time instead.
 */
export async function switchAccount(userId: number, orgId: string) {
  const user = await platformUserRepo.findByIdFull(userId);
  if (!user) throw new NotFoundError("User not found");

  const business = await platformUserRepo.findBusinessByDbName(orgId);
  if (!business) throw new NotFoundError("Business not found");

  const db = await getKnex(business.id, schemaName(business.schema_name));
  // deleted_at MUST be filtered here, exactly as requirePermission does. Without it a
  // removed agent still gets an orgId-scoped token: it 403s on permissioned routes but
  // passes every route guarded only by requireBusinessContext, and the tenant db handle
  // is attached either way. It also produced a confusing failure — switching "worked",
  // then every business page reported "Not a member of this business".
  const agent = await db("agents")
    .join("roles", "agents.role_id", "roles.id")
    .where("agents.platform_user_id", userId)
    .whereNull("agents.deleted_at")
    .select("roles.name as role")
    .first();

  if (!agent) throw new UnauthorizedError("Not a member of this business");

  const accessToken = issueScopedAccessToken({ id: user.id, email: user.email }, orgId, agent.role);

  logger.info("Account switched", { userId, orgId, role: agent.role });
  return { access_token: accessToken };
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

  const result: Record<string, unknown> = {
    ...user,
    type: auth.type,
  };

  if (auth.type === "admin") {
    const adminRecord = await adminRepo.findAdminByPlatformUserId(id);
    if (adminRecord) {
      result.admin_role = adminRecord.role;
      result.admin_id = adminRecord.id;
    }
  }

  if (auth.orgId) {
    result.orgId = auth.orgId;
    result.orgRole = auth.orgRole;
  }

  result.businesses = await platformUserRepo.listUserBusinesses(id);

  return { user: result };
}
