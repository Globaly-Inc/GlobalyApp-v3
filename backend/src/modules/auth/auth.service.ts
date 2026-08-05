// Unified auth service — single send-otp / verify-otp / refresh for all user types.
// Resolves user type automatically: admin_users → platform_users → agents (if subdomain provided).

import { randomInt, randomBytes, createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "../../config.js";
import { createChildLogger } from "../../shared/logger.js";
import { ConflictError, NotFoundError, UnauthorizedError } from "../../shared/errors.js";
import { queueService } from "../../shared/queue/queueService.js";
import { mailerService } from "../../shared/mail/mailerService.js";
import { getKnex } from "../../core/db/pool-manager.js";
import { buildConnString } from "../../core/db/knex.js";

import * as adminRepo from "../superadmin/admin-users/repositories/admin-users.repository.js";
import * as platformUserRepo from "../platform-users/repositories/platform-users.repository.js";
import * as agentRepo from "../agents/repositories/agents.repository.js";

const logger = createChildLogger("auth-service");

type UserType = "admin" | "platform_user" | "agent";

interface ResolvedUser {
  type: UserType;
  id: number;
  email: string;
  role?: string;
  otp: string | null;
  otp_expires_at: Date | null;
  orgId?: string;
  // repo helpers bound to this user
  updateOtp: (otp: string, expiresAt: Date) => Promise<void>;
  clearOtp: () => Promise<void>;
  updateRefreshToken: (token: string | null) => Promise<void>;
}

// ── resolve ──

async function resolveUser(email: string, subdomain?: string): Promise<ResolvedUser | null> {
  const candidates: ResolvedUser[] = [];

  // 1. superadmin.admin_users
  const admin = await adminRepo.findAdminByEmail(email);
  if (admin) {
    candidates.push({
      type: "admin", id: admin.id, email: admin.email, role: admin.role,
      otp: admin.otp, otp_expires_at: admin.otp_expires_at,
      updateOtp: (otp, exp) => adminRepo.updateOtp(admin.id, otp, exp),
      clearOtp: () => adminRepo.clearOtp(admin.id),
      updateRefreshToken: (t) => adminRepo.updateRefreshToken(admin.id, t),
    });
  }

  // 2. platform users
  const platformUser = await platformUserRepo.findByEmail(email);
  if (platformUser) {
    candidates.push({
      type: "platform_user", id: platformUser.id, email: platformUser.email,
      otp: platformUser.otp, otp_expires_at: platformUser.otp_expires_at,
      updateOtp: (otp, exp) => platformUserRepo.updateOtp(platformUser.id, otp, exp),
      clearOtp: () => platformUserRepo.clearOtp(platformUser.id),
      updateRefreshToken: (t) => platformUserRepo.updateRefreshToken(platformUser.id, t),
    });
  }

  // 3. agents (needs subdomain to resolve business DB)
  if (subdomain) {
    const business = await agentRepo.findBusinessBySubdomain(subdomain);
    if (business) {
      const db = await getKnex(business.id, buildConnString(business));
      const agent = await agentRepo.findAgentByEmail(db, email);
      if (agent) {
        candidates.push({
          type: "agent", id: agent.id, email: agent.email, role: agent.role, orgId: business.id,
          otp: agent.otp, otp_expires_at: agent.otp_expires_at,
          updateOtp: (otp, exp) => agentRepo.updateOtp(db, agent.id, otp, exp),
          clearOtp: () => agentRepo.clearOtp(db, agent.id),
          updateRefreshToken: (t) => agentRepo.updateRefreshToken(db, agent.id, t),
        });
      }
    }
  }

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Multiple matches (same email in admin + platform_users): prefer the one
  // with an active OTP so verify-otp resolves to the right account.
  const withOtp = candidates.find((c) => c.otp && c.otp_expires_at && new Date() < c.otp_expires_at);
  return withOtp ?? candidates[0];
}

// ── helpers ──

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function signAccessToken(user: ResolvedUser) {
  const payload: Record<string, unknown> = {
    sub: user.id, type: user.type, email: user.email,
  };
  if (user.role) payload.role = user.role;
  if (user.orgId) payload.orgId = user.orgId;

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

  // Send OTP immediately so user can verify and log in
  const otp = String(randomInt(100_000, 999_999));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await platformUserRepo.updateOtp(user.id, otp, expiresAt);

  // ponytail: fire-and-forget — registration must not fail because email is down
  queueEmail({
    to: email,
    subject: "Your Login OTP",
    html: `<p>Your OTP is <strong>${otp}</strong>. It expires in 10 minutes.</p>`,
  }).catch((err) => logger.warn("OTP email failed (registration succeeded)", { email, err: err.message }));

  logger.info("User registered", { userId: user.id });
  return { message: "Registered. Check your email for OTP to log in." };
}

export async function sendOtp(email: string, subdomain?: string) {
  const user = await resolveUser(email, subdomain);
  if (!user) throw new NotFoundError("Account not found");

  const otp = String(randomInt(100_000, 999_999));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await user.updateOtp(otp, expiresAt);

  queueEmail({
    to: user.email,
    subject: "Your Login OTP",
    html: `<p>Your OTP is <strong>${otp}</strong>. It expires in 10 minutes.</p>`,
  }).catch((err) => logger.warn("OTP email failed", { email, err: err.message }));

  logger.info("OTP sent", { type: user.type, userId: user.id });
  return { message: "OTP sent" };
}

export async function verifyOtp(email: string, otp: string, subdomain?: string) {
  const user = await resolveUser(email, subdomain);
  if (!user) throw new NotFoundError("Account not found");

  if (!user.otp || user.otp !== otp) throw new UnauthorizedError("Invalid OTP");
  if (!user.otp_expires_at || new Date() > user.otp_expires_at) throw new UnauthorizedError("OTP expired");

  await user.clearOtp();

  const accessToken = signAccessToken(user);
  const rawRefresh = randomBytes(40).toString("hex");
  await user.updateRefreshToken(hashToken(rawRefresh));

  logger.info("User authenticated", { type: user.type, userId: user.id });
  return {
    access_token: accessToken,
    refresh_token: rawRefresh,
    user: {
      id: user.id,
      email: user.email,
      type: user.type,
      role: user.role ?? null,
    },
  };
}

export async function refreshAccessToken(refreshToken: string, subdomain?: string) {
  const hashed = hashToken(refreshToken);

  // Check admin
  const admin = await adminRepo.findAdminByRefreshToken(hashed);
  if (admin) {
    const at = jwt.sign(
      { sub: admin.id, type: "admin", role: admin.role, email: admin.email },
      config.JWT_SECRET as jwt.Secret,
      { expiresIn: config.JWT_EXPIRY as jwt.SignOptions["expiresIn"] },
    );
    const newRaw = randomBytes(40).toString("hex");
    await adminRepo.updateRefreshToken(admin.id, hashToken(newRaw));
    return { access_token: at, refresh_token: newRaw, type: "admin" as const };
  }

  // Check platform user
  const platformUser = await platformUserRepo.findByRefreshToken(hashed);
  if (platformUser) {
    const at = jwt.sign(
      { sub: platformUser.id, type: "platform_user", email: platformUser.email },
      config.JWT_SECRET as jwt.Secret,
      { expiresIn: config.JWT_EXPIRY as jwt.SignOptions["expiresIn"] },
    );
    const newRaw = randomBytes(40).toString("hex");
    await platformUserRepo.updateRefreshToken(platformUser.id, hashToken(newRaw));
    return { access_token: at, refresh_token: newRaw, type: "platform_user" as const };
  }

  // Check agent (needs subdomain)
  if (subdomain) {
    const business = await agentRepo.findBusinessBySubdomain(subdomain);
    if (business) {
      const db = await getKnex(business.id, buildConnString(business));
      const agent = await agentRepo.findAgentByRefreshToken(db, hashed);
      if (agent) {
        const at = jwt.sign(
          { sub: agent.id, type: "agent", orgId: business.id, role: agent.role, email: agent.email },
          config.JWT_SECRET as jwt.Secret,
          { expiresIn: config.JWT_EXPIRY as jwt.SignOptions["expiresIn"] },
        );
        const newRaw = randomBytes(40).toString("hex");
        await agentRepo.updateRefreshToken(db, agent.id, hashToken(newRaw));
        return { access_token: at, refresh_token: newRaw, type: "agent" as const };
      }
    }
  }

  throw new UnauthorizedError("Invalid refresh token");
}

export async function getMe(auth: { sub: string; type: string; role?: string; orgId?: string; email: string }) {
  const id = Number(auth.sub);

  if (auth.type === "admin") {
    const admin = await adminRepo.findAdminById(id);
    if (!admin) throw new NotFoundError("Admin not found");
    return { user: { ...admin, type: "admin" as const } };
  }

  if (auth.type === "platform_user") {
    const user = await platformUserRepo.findById(id);
    if (!user) throw new NotFoundError("User not found");
    return { user: { ...user, type: "platform_user" as const } };
  }

  if (auth.type === "agent" && auth.orgId) {
    const business = await agentRepo.findBusinessById(auth.orgId);
    if (!business) throw new NotFoundError("Business not found");
    const db = await getKnex(business.id, buildConnString(business));
    const agent = await agentRepo.findAgentById(db, id);
    if (!agent) throw new NotFoundError("Agent not found");
    return { user: { ...agent, type: "agent" as const, orgId: business.id } };
  }

  throw new UnauthorizedError("Unknown user type");
}
