// Scribe sessions: start (with consent), transcript writes, ending, history.
//
// THE CONSENT GATE IS THE POINT OF THIS FILE. In V1 the consent row existed and
// nothing ever read it: scribe-token, -coaching, -review and -save all worked
// happily on a session with no consent record, so "consent" was a checkbox with
// no enforcement behind it (defect D-E3-1). Here a session cannot be created
// without consent — one transaction, both rows — and `requireConsentedSession`
// is the single door every downstream path goes through.
//
// A session is always addressed as (id, counselor_id). Business isolation comes
// from the tenant schema; counsellor isolation comes from that predicate. There
// is no route that takes a business id.

import type { Knex } from "knex";
import { BadRequestError, ConflictError, NotFoundError } from "../../../shared/errors.js";
import { buildPaginatedResponse, type PaginationInput } from "../../../shared/pagination.js";
import { CONSENT_VERSION, type SessionStatus } from "../consts.js";
import * as repo from "../repositories/scribe.repository.js";

export interface StartSessionInput {
  student_profile_id?: number | null;
  guest_name?: string | null;
  guest_phone?: string | null;
  consent: { student_name: string; consent_text: string; locale?: string | null };
}

export interface RequestEvidence {
  ip_address: string | null;
  user_agent: string | null;
}

/**
 * Session + consent, atomically. V1 inserted the session, inserted the consent,
 * and on failure issued a compensating `delete()` whose own error was discarded —
 * so a failed consent write could leave an orphan `active` session that was
 * transcribable with no consent at all. One transaction removes the whole class.
 */
export async function startSession(
  db: Knex,
  counselorId: number,
  input: StartSessionInput,
  evidence: RequestEvidence,
) {
  return db.transaction(async (trx) => {
    const session = await repo.insertSession(trx, {
      counselor_id: counselorId,
      student_profile_id: input.student_profile_id ?? null,
      guest_name: input.guest_name ?? null,
      guest_phone: input.guest_phone ?? null,
    });

    const consent = await repo.insertConsent(trx, {
      session_id: session.id,
      // Verbatim, as supplied. Deliberately NOT cross-checked against the linked
      // profile's name: the legal record is what was said in the room, and a
      // later profile edit must not be able to rewrite it.
      student_name: input.consent.student_name,
      student_id: input.student_profile_id ?? null,
      counselor_id: counselorId,
      consent_text: input.consent.consent_text,
      consent_version: CONSENT_VERSION,
      locale: input.consent.locale ?? null,
      ip_address: evidence.ip_address,
      user_agent: evidence.user_agent,
    });

    return { session, consent };
  });
}

/**
 * The one door. Resolves a session the caller owns AND proves consent was
 * recorded for it. Every provider path and every transcript write goes through
 * this before anything else happens.
 */
export async function requireConsentedSession(
  db: Knex,
  sessionId: number,
  counselorId: number,
): Promise<repo.SessionRow> {
  const session = await repo.findOwnSession(db, sessionId, counselorId);
  // Absent, or someone else's → NotFound, never Forbidden: a 403 would confirm
  // the session exists, which is the same disclosure training avoids.
  if (!session) throw new NotFoundError("Session not found");

  const consent = await repo.findConsent(db, sessionId);
  if (!consent) {
    throw new BadRequestError("This session has no recorded consent and cannot be transcribed");
  }
  return session;
}

export async function getSession(db: Knex, sessionId: number, counselorId: number) {
  const session = await requireConsentedSession(db, sessionId, counselorId);
  const [consent, review] = await Promise.all([
    repo.findConsent(db, sessionId),
    repo.findReview(db, sessionId),
  ]);
  return { session, consent, review: review ?? null };
}

export async function listSessions(
  db: Knex,
  counselorId: number,
  query: PaginationInput & { status?: SessionStatus; student_profile_id?: number },
) {
  const { rows, total } = await repo.listSessions(db, counselorId, query);
  return buildPaginatedResponse(rows, total, query);
}

/** Honest counts, including `pending_review` — sessions ended and not yet reviewed. */
export async function stats(db: Knex, counselorId: number) {
  return repo.sessionStats(db, counselorId);
}

// ── Transcripts ─────────────────────────────────────────────────────────────

export async function putTranscripts(
  db: Knex,
  sessionId: number,
  counselorId: number,
  chunks: Parameters<typeof repo.upsertTranscripts>[2],
) {
  const session = await requireConsentedSession(db, sessionId, counselorId);
  // A reviewed session is a closed record. Appending speech to it afterwards
  // would change the text the counsellor signed off on.
  if (session.status === "reviewed") {
    throw new ConflictError("This session has been reviewed and can no longer be changed");
  }
  const rows = await repo.upsertTranscripts(db, sessionId, chunks);
  return { data: rows, written: rows.length };
}

export async function listTranscripts(db: Knex, sessionId: number, counselorId: number) {
  await requireConsentedSession(db, sessionId, counselorId);
  return { data: await repo.listTranscripts(db, sessionId) };
}

// ── Ending ──────────────────────────────────────────────────────────────────

/**
 * Ending is its own transition, separate from reviewing. V1 folded the two
 * together inside scribe-review: it set a `completing` status that only
 * scribe-save ever moved on, while the history list filtered on `completed` — so
 * a counsellor who closed the tab lost the session from history for ever
 * (defect D-E3-10).
 *
 * `duration_seconds` comes from the recorder. V1 computed `now - started_at`
 * inside the review call, which billed review-screen time as session length.
 */
export async function endSession(
  db: Knex,
  sessionId: number,
  counselorId: number,
  input: { duration_seconds?: number; language_detected?: string | null },
) {
  const session = await requireConsentedSession(db, sessionId, counselorId);
  if (session.status !== "active") {
    throw new ConflictError(`Session is already ${session.status}`);
  }

  const updated = await repo.updateSession(db, sessionId, counselorId, {
    status: "ended",
    ended_at: db.fn.now(),
    ...(input.duration_seconds === undefined
      ? {}
      : { duration_seconds: input.duration_seconds }),
    ...(input.language_detected === undefined
      ? {}
      : { language_detected: input.language_detected }),
  });
  return { session: updated };
}
