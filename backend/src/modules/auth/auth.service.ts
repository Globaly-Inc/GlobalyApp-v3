// Unified auth service — all users authenticate via platform_users.
// Admins and business membership are role-links, not separate auth identities.

import { randomInt, randomBytes, createHash, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "../../config.js";
import { createChildLogger } from "../../shared/logger.js";
import { ConflictError, NotFoundError, UnauthorizedError } from "../../shared/errors.js";
import { queueService } from "../../shared/queue/queueService.js";
import { mailerService } from "../../shared/mail/mailerService.js";

import * as platformUserRepo from "../platform-users/repositories/platform-users.repository.js";
import * as adminRepo from "../superadmin/admin-users/repositories/admin-users.repository.js";
import { getKnex } from "../../core/db/pool-manager.js";
import { schemaName } from "../../core/db/knex.js";

import type { AuthClaims } from "../../core/types.js";

const logger = createChildLogger("auth-service");

const OTP_MAX_ATTEMPTS = 5;
const OTP_LOCKOUT_MINUTES = 30;

// ── helpers ──

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
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
  if (existing) throw new ConflictError("Email already registered");

  const user = await platformUserRepo.insert({
    first_name: firstName,
    last_name: lastName,
    email,
    username: email,
    account_status: 1,
  });

  const otp = String(randomInt(100_000, 999_999));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  // Store hash, send raw in email
  await platformUserRepo.updateOtp(user.id, hashToken(otp), expiresAt);

  queueEmail({
    to: email,
    subject: "Your Login OTP",
    html: `<p>Your OTP is <strong>${otp}</strong>. It expires in 10 minutes.</p>`,
  }).catch((err) => logger.warn("OTP email failed (registration succeeded)", { email, err: err.message }));

  logger.info("User registered", { userId: user.id });
  return { message: "Registered. Check your email for OTP to log in." };
}

export async function sendOtp(email: string) {
  const user = await platformUserRepo.findByEmail(email);
  if (!user) throw new NotFoundError("Account not found");

  if (user.otp_locked_until && new Date() < new Date(user.otp_locked_until)) {
    throw new UnauthorizedError("Too many attempts. Try again later.");
  }

  const otp = String(randomInt(100_000, 999_999));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  // Store hash, send raw in email
  await platformUserRepo.updateOtp(user.id, hashToken(otp), expiresAt);

  queueEmail({
    to: user.email,
    subject: "Your Login OTP",
    html: `<p>Your OTP is <strong>${otp}</strong>. It expires in 10 minutes.</p>`,
  }).catch((err) => logger.warn("OTP email failed", { email, err: err.message }));

  logger.info("OTP sent", { userId: user.id });
  return { message: "OTP sent" };
}

export async function verifyOtp(email: string, otp: string) {
  const user = await platformUserRepo.findByEmail(email);
  if (!user) throw new NotFoundError("Account not found");

  if (user.otp_locked_until && new Date() < new Date(user.otp_locked_until)) {
    throw new UnauthorizedError("Too many attempts. Try again later.");
  }

  if (!user.otp || !user.otp_expires_at) throw new UnauthorizedError("No OTP requested");

  if (new Date() > new Date(user.otp_expires_at)) {
    throw new UnauthorizedError("OTP expired");
  }

  // Compare hash — OTP is stored hashed
  if (user.otp !== hashToken(otp)) {
    const attempts = (user.otp_attempts ?? 0) + 1;
    if (attempts >= OTP_MAX_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + OTP_LOCKOUT_MINUTES * 60 * 1000);
      await platformUserRepo.lockOtp(user.id, attempts, lockedUntil);
    } else {
      await platformUserRepo.incrementOtpAttempts(user.id, attempts);
    }
    throw new UnauthorizedError("Invalid OTP");
  }

  await platformUserRepo.clearOtp(user.id);

  const adminRecord = await adminRepo.findAdminByPlatformUserId(user.id);

  const accessToken = signAccessToken({
    id: user.id,
    email: user.email,
    adminRole: adminRecord?.role,
  });

  const { raw: rawRefresh, hashed: hashedRefresh } = encodeRefreshToken(user.id);
  const family = randomUUID();
  await platformUserRepo.updateRefreshToken(user.id, hashedRefresh, family);

  if (!user.is_email_verified) {
    await platformUserRepo.updateUser(user.id, { is_email_verified: true });
  }

  // Include owned businesses so client can show account picker immediately
  const businesses = await platformUserRepo.listUserBusinesses(user.id);

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

export async function refreshAccessToken(refreshToken: string) {
  const hashed = hashToken(refreshToken);

  const user = await platformUserRepo.findByRefreshToken(hashed);
  if (user) {
    // Token valid — rotate
    const adminRecord = await adminRepo.findAdminByPlatformUserId(user.id);

    const accessToken = signAccessToken({
      id: user.id,
      email: user.email,
      adminRole: adminRecord?.role,
    });

    const { raw: newRaw, hashed: newHashed } = encodeRefreshToken(user.id);
    await platformUserRepo.updateRefreshToken(user.id, newHashed, user.refresh_token_family);

    return {
      access_token: accessToken,
      refresh_token: newRaw,
      type: adminRecord ? ("admin" as const) : ("platform_user" as const),
    };
  }

  // Token not found — check for reuse (stolen token replayed after rotation)
  const userId = decodeRefreshUserId(refreshToken);
  if (userId) {
    const suspect = await platformUserRepo.findByIdFull(userId);
    if (suspect?.refresh_token_family) {
      // Family exists but token doesn't match — reuse detected.
      // Nuke all tokens for this user, force re-authentication.
      logger.warn("Refresh token reuse detected — invalidating session", { userId });
      await platformUserRepo.updateRefreshToken(userId, null, null);
    }
  }

  throw new UnauthorizedError("Invalid refresh token");
}

export async function switchAccount(userId: number, orgId: string) {
  const user = await platformUserRepo.findByIdFull(userId);
  if (!user) throw new NotFoundError("User not found");

  // Look up business and verify user is an agent in it
  const business = await platformUserRepo.findBusinessByDbName(orgId);
  if (!business) throw new NotFoundError("Business not found");

  const db = await getKnex(business.id, schemaName(business.schema_name));
  const agent = await db("agents")
    .join("roles", "agents.role_id", "roles.id")
    .where("agents.platform_user_id", userId)
    .select("roles.name as role")
    .first();

  if (!agent) throw new UnauthorizedError("Not a member of this business");

  const accessToken = signAccessToken({
    id: user.id,
    email: user.email,
    orgId,
    orgRole: agent.role,
  });

  logger.info("Account switched", { userId, orgId, role: agent.role });
  return { access_token: accessToken };
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
