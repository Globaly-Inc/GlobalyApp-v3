// Auth repository — OTP challenges and multi-device sessions.
// Separated from platform_users to avoid write contention on the identity table.

import { masterKnex } from "../../core/db/master-pool.js";

// ── OTP Challenges ──

export async function createOtpChallenge(email: string, otpHash: string, expiresAt: Date) {
  const [row] = await masterKnex("auth_otp_challenges")
    .insert({ email, otp_hash: otpHash, expires_at: expiresAt, attempts: 0, locked_until: null })
    .onConflict("email")
    .merge({ otp_hash: otpHash, expires_at: expiresAt, attempts: 0, locked_until: null })
    .returning("*");
  return row;
}

export async function findOtpChallenge(email: string) {
  return masterKnex("auth_otp_challenges")
    .where({ email })
    .first();
}

export async function incrementOtpAttempts(id: number, attempts: number) {
  await masterKnex("auth_otp_challenges")
    .where({ id })
    .update({ attempts });
}

export async function lockOtp(id: number, attempts: number, lockedUntil: Date) {
  await masterKnex("auth_otp_challenges")
    .where({ id })
    .update({ attempts, locked_until: lockedUntil });
}

export async function deleteOtpChallenge(id: number) {
  await masterKnex("auth_otp_challenges").where({ id }).delete();
}

// ── Sessions (multi-device) ──

export async function createSession(data: {
  platform_user_id: number;
  refresh_token_hash: string;
  token_family: string;
  ip_address?: string | null;
  user_agent?: string | null;
  device_label?: string | null;
  expires_at: Date;
  org_id?: string | null;
}) {
  const [row] = await masterKnex("auth_sessions")
    .insert(data)
    .returning("*");
  return row;
}

/** Remembers which business this session last switched to, so /refresh can honor it. */
export async function updateSessionOrgId(sessionId: string, orgId: string) {
  await masterKnex("auth_sessions")
    .where({ id: sessionId })
    .update({ org_id: orgId, last_used_at: masterKnex.fn.now() });
}

export async function findSessionByRefreshToken(hash: string) {
  return masterKnex("auth_sessions")
    .where({ refresh_token_hash: hash })
    .first();
}

export async function findSessionsByUserId(platformUserId: number) {
  return masterKnex("auth_sessions")
    .where({ platform_user_id: platformUserId })
    .orderBy("last_used_at", "desc");
}

export async function rotateRefreshToken(sessionId: string, newHash: string) {
  await masterKnex("auth_sessions")
    .where({ id: sessionId })
    .update({ refresh_token_hash: newHash, last_used_at: masterKnex.fn.now() });
}

export async function updateSessionMeta(sessionId: string, data: {
  ip_address?: string | null;
  user_agent?: string | null;
}) {
  await masterKnex("auth_sessions")
    .where({ id: sessionId })
    .update({ ...data, last_used_at: masterKnex.fn.now() });
}

export async function deleteSession(sessionId: string) {
  await masterKnex("auth_sessions").where({ id: sessionId }).delete();
}

export async function deleteAllSessions(platformUserId: number) {
  await masterKnex("auth_sessions").where({ platform_user_id: platformUserId }).delete();
}

/** Delete sessions matching a token family — used for reuse detection. */
export async function deleteSessionsByFamily(platformUserId: number, family: string) {
  await masterKnex("auth_sessions")
    .where({ platform_user_id: platformUserId, token_family: family })
    .delete();
}

/** Purge expired sessions. Call from cron. */
export async function purgeExpiredSessions() {
  return masterKnex("auth_sessions").where("expires_at", "<", masterKnex.fn.now()).delete();
}

/** Purge expired OTP challenges. Call from cron. */
export async function purgeExpiredOtps() {
  return masterKnex("auth_otp_challenges").where("expires_at", "<", masterKnex.raw("now() - interval '1 hour'")).delete();
}
