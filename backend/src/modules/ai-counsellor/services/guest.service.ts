import { createHash } from "crypto";
import { masterKnex } from "../../../core/db/master-pool.js";
import * as guestRepo from "../repositories/guest.repository.js";
import * as sessionsRepo from "../repositories/sessions.repository.js";
import * as messagesRepo from "../repositories/messages.repository.js";
import type { ChatScope } from "./scope.js";
import { createChildLogger } from "../../../shared/logger.js";

const logger = createChildLogger("guest-service");

const GUEST_SESSION_EXPIRY_DAYS = 7;

export function hashFingerprint(fingerprint: string, ip: string): string {
  return createHash("sha256").update(fingerprint + ip).digest("hex");
}

/** Check if a guest with this fingerprint is allowed to send a message. */
export async function checkGuestGate(fingerprintHash: string): Promise<{ allowed: boolean; existingSession?: guestRepo.GuestSessionRow }> {
  const existing = await guestRepo.findByFingerprint(fingerprintHash);
  if (existing) return { allowed: false, existingSession: existing };
  return { allowed: true };
}

/** Persist a guest's message + AI response after streaming completes. */
export async function createGuestSession(data: {
  fingerprintHash: string;
  messageContent: string;
  responseContent: string;
  responseSources?: unknown;
  embedConfigId?: number;
}): Promise<guestRepo.GuestSessionRow> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + GUEST_SESSION_EXPIRY_DAYS);

  return guestRepo.create({
    fingerprint_hash: data.fingerprintHash,
    message_content: data.messageContent,
    response_content: data.responseContent,
    response_sources: data.responseSources,
    embed_config_id: data.embedConfigId,
    expires_at: expiresAt,
  });
}

export interface MigrationResult {
  /** The owned session the transcript now lives in, or null if there was nothing to move. */
  session_id: number | null;
  /** True only for the call that actually moved it. */
  migrated: boolean;
}

/**
 * Adopt a guest transcript into the signed-up user's own chat history.
 *
 * One-shot, and provably so: the whole move — create the session, stamp the guest
 * row's `migrated_to_session_id`, copy the two messages — runs inside one
 * transaction that starts by taking `FOR UPDATE` on the guest row. A second
 * migration (a double-tapped button, a retried request, a concurrent tab) queues on
 * that lock, then re-reads a row that already carries a session id and returns it
 * without writing anything. So the transcript can never be duplicated and never
 * lands in two accounts.
 *
 * Guest transcripts always become PERSONAL sessions: a guest signing up is a
 * platform user, never a business.
 */
export async function migrateTranscript(fingerprintHash: string, userId: number): Promise<MigrationResult> {
  const guest = await guestRepo.findLatestByFingerprint(fingerprintHash);
  if (!guest) {
    logger.info("No guest session to migrate", { fingerprintHash });
    return { session_id: null, migrated: false };
  }
  if (guest.migrated_to_session_id) {
    return { session_id: guest.migrated_to_session_id, migrated: false };
  }
  if (!guest.message_content || !guest.response_content) {
    return { session_id: null, migrated: false };
  }
  if (guest.expires_at.getTime() <= Date.now()) {
    logger.info("Guest session expired before migration", { fingerprintHash });
    return { session_id: null, migrated: false };
  }

  const scope: ChatScope = { ownerType: "user", userId, businessId: null };

  return masterKnex.transaction(async (trx) => {
    const locked = await guestRepo.lockForMigration(guest.id, trx);
    if (!locked) return { session_id: null, migrated: false };
    // Re-read under the lock: whoever committed first owns the transcript.
    if (locked.migrated_to_session_id) {
      return { session_id: locked.migrated_to_session_id, migrated: false };
    }

    const session = await sessionsRepo.create(scope, undefined, trx);
    await guestRepo.markMigrated(locked.id, session.id, trx);

    await messagesRepo.create(
      { session_id: session.id, role: "user", content: locked.message_content! },
      trx,
    );
    await messagesRepo.create(
      {
        session_id: session.id,
        role: "assistant",
        content: locked.response_content!,
        sources: (locked.response_sources as unknown[]) ?? [],
      },
      trx,
    );

    await sessionsRepo.incrementMessageCount(session.id, trx);
    await sessionsRepo.incrementMessageCount(session.id, trx);

    return { session_id: session.id, migrated: true };
  });
}
