// Unified auth service — single send-otp / verify-otp / refresh for all user types.
// Resolves user type automatically: admin_users → students → agents (if subdomain provided).

import { randomInt, randomBytes, createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "../../config.js";
import { createChildLogger } from "../../shared/logger.js";
import { NotFoundError, UnauthorizedError } from "../../shared/errors.js";
import { queueService } from "../../shared/queue/queueService.js";
import { mailerService } from "../../shared/mail/mailerService.js";
import { getKnex } from "../../core/db/pool-manager.js";
import { buildConnString } from "../../core/db/knex.js";

import * as adminRepo from "../superadmin/admin-users/repositories/admin-users.repository.js";
import * as studentRepo from "../students/repositories/students.repository.js";
import * as agentRepo from "../agents/repositories/agents.repository.js";

const logger = createChildLogger("auth-service");

type UserType = "admin" | "student" | "agent";

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
  // 1. superadmin.admin_users
  const admin = await adminRepo.findAdminByEmail(email);
  if (admin) {
    return {
      type: "admin", id: admin.id, email: admin.email, role: admin.role,
      otp: admin.otp, otp_expires_at: admin.otp_expires_at,
      updateOtp: (otp, exp) => adminRepo.updateOtp(admin.id, otp, exp),
      clearOtp: () => adminRepo.clearOtp(admin.id),
      updateRefreshToken: (t) => adminRepo.updateRefreshToken(admin.id, t),
    };
  }

  // 2. students
  const student = await studentRepo.findStudentByEmail(email);
  if (student) {
    return {
      type: "student", id: student.id, email: student.email,
      otp: student.otp, otp_expires_at: student.otp_expires_at,
      updateOtp: (otp, exp) => studentRepo.updateOtp(student.id, otp, exp),
      clearOtp: () => studentRepo.clearOtp(student.id),
      updateRefreshToken: (t) => studentRepo.updateRefreshToken(student.id, t),
    };
  }

  // 3. agents (needs subdomain to resolve business DB)
  if (subdomain) {
    const business = await agentRepo.findBusinessBySubdomain(subdomain);
    if (business) {
      const db = getKnex(business.id, buildConnString(business));
      const agent = await agentRepo.findAgentByEmail(db, email);
      if (agent) {
        return {
          type: "agent", id: agent.id, email: agent.email, role: agent.role, orgId: business.id,
          otp: agent.otp, otp_expires_at: agent.otp_expires_at,
          updateOtp: (otp, exp) => agentRepo.updateOtp(db, agent.id, otp, exp),
          clearOtp: () => agentRepo.clearOtp(db, agent.id),
          updateRefreshToken: (t) => agentRepo.updateRefreshToken(db, agent.id, t),
        };
      }
    }
  }

  return null;
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

export async function sendOtp(email: string, subdomain?: string) {
  const user = await resolveUser(email, subdomain);
  if (!user) throw new NotFoundError("Account not found");

  const otp = String(randomInt(100_000, 999_999));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await user.updateOtp(otp, expiresAt);

  await queueEmail({
    to: user.email,
    subject: "Your Login OTP",
    html: `<p>Your OTP is <strong>${otp}</strong>. It expires in 10 minutes.</p>`,
  });

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
  return { access_token: accessToken, refresh_token: rawRefresh, type: user.type, role: user.role ?? null };
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

  // Check student
  const student = await studentRepo.findStudentByRefreshToken(hashed);
  if (student) {
    const at = jwt.sign(
      { sub: student.id, type: "student", email: student.email },
      config.JWT_SECRET as jwt.Secret,
      { expiresIn: config.JWT_EXPIRY as jwt.SignOptions["expiresIn"] },
    );
    const newRaw = randomBytes(40).toString("hex");
    await studentRepo.updateRefreshToken(student.id, hashToken(newRaw));
    return { access_token: at, refresh_token: newRaw, type: "student" as const };
  }

  // Check agent (needs subdomain)
  if (subdomain) {
    const business = await agentRepo.findBusinessBySubdomain(subdomain);
    if (business) {
      const db = getKnex(business.id, buildConnString(business));
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
