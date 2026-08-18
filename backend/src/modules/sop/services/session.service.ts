// Intake: opening a session, answering the questionnaire, reading it back.
//
// OWNERSHIP is by student id on every read and every write, and a session that is not
// the caller's is a 404, not a 403 — a 403 confirms the row exists, which is an
// enumeration oracle over other students' applications.
//
// V1 additionally let an agent at any business holding a distribution for this
// student's enquiry read the session. That delegation path is NOT built here (see the
// module header); the columns for it exist so adding it needs a route, not a migration.

import { NotFoundError } from "../../../shared/errors.js";
import { REQUIRED_QUESTION_KEYS } from "../consts.js";
import * as repo from "../repositories/sop.repository.js";

export async function createSession(
  studentId: number,
  input: {
    country_id?: number | null;
    target_org_type?: string | null;
    target_org_id?: number | null;
    course_service_id?: string | null;
    profile_snapshot: Record<string, unknown>;
  },
): Promise<repo.SessionRow> {
  return repo.insertSession({
    student_id: studentId,
    // Equal to the student today. V1 set it to the agent on a delegated intake.
    initiated_by: studentId,
    target_org_type: input.target_org_type ?? null,
    target_org_id: input.target_org_id ?? null,
    course_service_id: input.course_service_id ?? null,
    country_id: input.country_id ?? null,
    profile_snapshot: input.profile_snapshot,
  });
}

/** The one place a session is loaded for a caller. Throws rather than returning null. */
export async function requireOwnSession(
  sessionId: number,
  studentId: number,
): Promise<repo.SessionRow> {
  const session = await repo.findSession(sessionId, studentId);
  if (!session) throw new NotFoundError("SOP session not found");
  return session;
}

export async function listSessions(studentId: number) {
  return { data: await repo.listSessions(studentId) };
}

export async function getSession(sessionId: number, studentId: number) {
  const session = await requireOwnSession(sessionId, studentId);
  const [answers, documents] = await Promise.all([
    repo.listAnswers(sessionId),
    repo.listCurrentDocuments(sessionId),
  ]);
  return { session, answers, documents };
}

/**
 * Saves answers and re-derives readiness from what is now stored.
 *
 * The status is computed from the database, not asserted by the client: V1 let the
 * browser PATCH `status` and `stage` directly, so a client could declare itself
 * ready_to_generate having answered nothing (defect D-E5-3).
 */
export async function saveAnswers(
  sessionId: number,
  studentId: number,
  answers: Array<{ question_key: string; answer?: string | null; answer_json?: unknown }>,
) {
  const session = await requireOwnSession(sessionId, studentId);

  await repo.upsertAnswers(
    sessionId,
    answers.map((a) => ({
      question_key: a.question_key,
      answer: a.answer ?? null,
      answer_json: a.answer_json,
    })),
  );

  const stored = await repo.listAnswers(sessionId);
  const ready = isReady(stored);

  // A generated session stays generated: answering one more question afterwards must
  // not silently reopen it and invite a second paid draft.
  if (session.status === "in_progress" || session.status === "ready_to_generate") {
    await repo.updateSessionState(sessionId, {
      status: ready ? "ready_to_generate" : "in_progress",
      stage: ready ? "zone_b" : "zone_a",
    });
  }

  return { answers: stored, ready };
}

export function isReady(answers: Array<{ question_key: string; answer: string | null }>): boolean {
  const answered = new Set(
    answers.filter((a) => (a.answer ?? "").trim() !== "").map((a) => a.question_key),
  );
  return REQUIRED_QUESTION_KEYS.every((key) => answered.has(key));
}
