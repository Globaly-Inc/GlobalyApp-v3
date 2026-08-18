import * as sessionsRepo from "../repositories/sessions.repository.js";
import type { SessionRow } from "../repositories/sessions.repository.js";
import { getAiProvider } from "./provider.js";
import { ownsSession, type ChatScope } from "./scope.js";
import { NotFoundError, ForbiddenError } from "../../../shared/errors.js";
import { createChildLogger } from "../../../shared/logger.js";

const logger = createChildLogger("session-service");

/** Load a session the scope is allowed to see, or fail the way the caller expects. */
async function requireOwned(id: number, scope: ChatScope): Promise<SessionRow> {
  const session = await sessionsRepo.findById(id);
  if (!session) throw new NotFoundError("Session not found");
  if (!ownsSession(scope, session)) throw new ForbiddenError("Not your session");
  return session;
}

export async function getOrCreateSession(
  scope: ChatScope,
  sessionId?: number,
  embedConfigId?: number,
): Promise<SessionRow> {
  if (sessionId) return requireOwned(sessionId, scope);
  return sessionsRepo.create(scope, embedConfigId);
}

export async function getSession(id: number, scope: ChatScope): Promise<SessionRow> {
  return requireOwned(id, scope);
}

export async function listSessions(scope: ChatScope, includeArchived: boolean): Promise<SessionRow[]> {
  return sessionsRepo.findByScope(scope, includeArchived);
}

export async function updateSession(
  id: number,
  scope: ChatScope,
  patch: { title?: string; is_archived?: boolean; delete?: boolean },
): Promise<SessionRow> {
  const session = await requireOwned(id, scope);

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
    const title = await getAiProvider().generateTitle(
      `User: ${userMessage.slice(0, 200)}\nAssistant: ${aiResponse.slice(0, 200)}`,
    );
    if (title) await sessionsRepo.update(sessionId, { title });
  } catch (err) {
    logger.warn("Auto-title failed", { sessionId, err: err instanceof Error ? err.message : String(err) });
  }
}
