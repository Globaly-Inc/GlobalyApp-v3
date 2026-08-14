// Unified auth service — all users authenticate via platform_users.
// OTP challenges and sessions are in separate tables (not on platform_users).
// Admins and business membership are role-links, not separate auth identities.

import { randomInt, randomBytes, createHash, scryptSync, timingSafeEqual, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "../../config.js";
import { createChildLogger } from "../../shared/logger.js";
import { NotFoundError, UnauthorizedError } from "../../shared/errors.js";
import { queueService } from "../../shared/queue/queueService.js";
import { mailerService } from "../../shared/mail/mailerService.js";

import * as platformUserRepo from "../platform-users/repositories/platform-users.repository.js";
import * as adminRepo from "../superadmin/admin-users/repositories/admin-users.repository.js";
import * as authRepo from "./auth.repository.js";
import { getKnex } from "../../core/db/pool-manager.js";
import { schemaName } from "../../core/db/knex.js";

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

export async function queueEmail(options: { to: string; subject: string; html: string }) {
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
    html: `<p>Hi ${options.name},</p><p>You have been invited as <strong>${options.role}</strong>.</p><p><a href="${options.acceptUrl}">Accept Invitation</a></p><p>This link expires in 72 hours.</p>`,
  });
}

// ── public API ──

export async function registerUser(firstName: string, lastName: string, email: string) {
  const existing = await platformUserRepo.findByEmail(email);
  if (existing) {
    // Anti-enumeration: return identical response, send "someone tried to register" email
    queueEmail({
      to: email,
      subject: "Registration Attempt",
      html: `<p>Someone tried to register an account with your email. If this was you, log in instead.</p>`,
    }).catch((err) => logger.warn("Registration notice email failed", { email, err: err.message }));
    return { message: "Check your email for next steps." };
  }

  const user = await platformUserRepo.insert({
    first_name: firstName,
    last_name: lastName,
    email,
    account_status: 0, // inactive until OTP verified
  });

  const otp = String(randomInt(100_000, 999_999));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await authRepo.createOtpChallenge(email, hashOtp(otp), expiresAt);

  queueEmail({
    to: email,
    subject: "Your Login OTP",
    html: `<p>Your OTP is <strong>${otp}</strong>. It expires in 10 minutes.</p>`,
  }).catch((err) => logger.warn("OTP email failed (registration succeeded)", { email, err: err.message }));

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

  queueEmail({
    to: user.email,
    subject: "Your Login OTP",
    html: `<p>Your OTP is <strong>${otp}</strong>. It expires in 10 minutes.</p>`,
  }).catch((err) => logger.warn("OTP email failed", { email, err: err.message }));

  logger.info("OTP sent", { userId: user.id });
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

  const adminRecord = await adminRepo.findAdminByPlatformUserId(user.id);

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
  const agent = await db("agents")
    .join("roles", "agents.role_id", "roles.id")
    .where("agents.platform_user_id", userId)
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
