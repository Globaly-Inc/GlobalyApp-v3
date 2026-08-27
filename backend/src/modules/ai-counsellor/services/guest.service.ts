import { createHash } from "crypto";
import * as guestRepo from "../repositories/guest.repository.js";
import * as sessionsRepo from "../repositories/sessions.repository.js";
import * as messagesRepo from "../repositories/messages.repository.js";
import { createChildLogger } from "../../../shared/logger.js";

const logger = createChildLogger("guest-service");

const GUEST_SESSION_EXPIRY_DAYS = 7;

export function hashFingerprint(fingerprint: string, ip: string): string {
  return createHash("sha256").update(fingerprint + ip).digest("hex");
}

export function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

/** Check if a guest with this fingerprint or IP is allowed to send a message. */
export async function checkGuestGate(fingerprintHash: string, ipHash: string): Promise<{ allowed: boolean; existingSession?: guestRepo.GuestSessionRow }> {
  const existing = await guestRepo.findByFingerprintOrIp(fingerprintHash, ipHash);
  if (existing) return { allowed: false, existingSession: existing };
  return { allowed: true };
}

/** Persist a guest's message + AI response after streaming completes. */
export async function createGuestSession(data: {
  fingerprintHash: string;
  ipHash: string;
  messageContent: string;
  responseContent: string;
  responseSources?: unknown;
  embedConfigId?: number;
}): Promise<guestRepo.GuestSessionRow> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + GUEST_SESSION_EXPIRY_DAYS);

  return guestRepo.create({
    fingerprint_hash: data.fingerprintHash,
    ip_hash: data.ipHash,
    message_content: data.messageContent,
    response_content: data.responseContent,
    response_sources: data.responseSources,
    embed_config_id: data.embedConfigId,
    expires_at: expiresAt,
  });
}

/** Migrate a guest transcript into an authenticated session. */
export async function migrateTranscript(fingerprintHash: string, userId: number): Promise<number | null> {
  const guest = await guestRepo.findByFingerprint(fingerprintHash);
  if (!guest || !guest.message_content || !guest.response_content) {
    logger.info("No guest session to migrate", { fingerprintHash });
    return null;
  }

  const session = await sessionsRepo.create(userId);

  await messagesRepo.create({
    session_id: session.id,
    role: "user",
    content: guest.message_content,
  });
  await messagesRepo.create({
    session_id: session.id,
    role: "assistant",
    content: guest.response_content,
    sources: (guest.response_sources as unknown[]) ?? [],
  });

  await guestRepo.markMigrated(guest.id, session.id);

  return session.id;
}
