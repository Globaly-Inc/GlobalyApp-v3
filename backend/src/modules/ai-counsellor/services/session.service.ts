import * as sessionsRepo from "../repositories/sessions.repository.js";
import type { SessionRow } from "../repositories/sessions.repository.js";
import { generateTitle } from "../lib/gemini-stream.js";
import { NotFoundError, ForbiddenError } from "../../../shared/errors.js";
import { createChildLogger } from "../../../shared/logger.js";

const logger = createChildLogger("session-service");

export async function getOrCreateSession(userId: number, sessionId?: number): Promise<SessionRow> {
  if (sessionId) {
    const session = await sessionsRepo.findById(sessionId);
    if (!session) throw new NotFoundError("Session not found");
    if (session.platform_user_id !== userId) throw new ForbiddenError("Not your session");
    return session;
  }
  return sessionsRepo.create(userId);
}

export async function listSessions(userId: number, includeArchived: boolean): Promise<SessionRow[]> {
  return sessionsRepo.findByUser(userId, includeArchived);
}

export async function updateSession(
  id: number,
  userId: number,
  patch: { title?: string; is_archived?: boolean; delete?: boolean },
): Promise<SessionRow> {
  const session = await sessionsRepo.findById(id);
  if (!session) throw new NotFoundError("Session not found");
  if (session.platform_user_id !== userId) throw new ForbiddenError("Not your session");

  if (patch.delete) {
    await sessionsRepo.softDelete(id);
    // Return the session as-is; the caller already knows it's deleted.
    return { ...session, deleted_at: new Date() };
  }

  const dbPatch: Partial<Pick<SessionRow, "title" | "is_archived">> = {};
  if (patch.title !== undefined) dbPatch.title = patch.title;
  if (patch.is_archived !== undefined) dbPatch.is_archived = patch.is_archived;

  const updated = await sessionsRepo.update(id, dbPatch);
  if (!updated) throw new NotFoundError("Session not found");
  return updated;
}

export async function autoTitle(sessionId: number, userMessage: string, aiResponse: string): Promise<void> {
  try {
    const title = await generateTitle(`User: ${userMessage.slice(0, 200)}\nAssistant: ${aiResponse.slice(0, 200)}`);
    if (title) await sessionsRepo.update(sessionId, { title });
  } catch (err) {
    logger.warn("Auto-title failed", { sessionId, err: err instanceof Error ? err.message : String(err) });
  }
}
