// The portal's visitor detail page: read one visitor, correct what the chat got wrong.
//
// A separate file from embed.routes, which owns the widget CONFIG endpoints plus the visitor
// LIST. Worth folding the list in here at some point — these are all /embed/visitors — but not
// while that file is being edited elsewhere.

import type { FastifyInstance } from "fastify";
import { requireBusinessOrInstitutionContext } from "../../../core/plugins/auth.plugin.js";
import { NotFoundError } from "../../../shared/errors.js";
import { VisitorIdParamSchema, VisitorPatchSchema } from "../schemas/visitor.schema.js";
import * as repo from "../repositories/visitor-edit.repository.js";
import * as messagesRepo from "../repositories/messages.repository.js";

/** Newest turns the inbox shows. ponytail: no paging — widget chats are short; page if they aren't. */
const TRANSCRIPT_LIMIT = 200;

export async function visitorRoutes(app: FastifyInstance) {
  app.get("/embed/visitors/:id", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { id } = VisitorIdParamSchema.parse(req.params);
    const visitor = await repo.findVisitorById(req.db, id);
    if (!visitor) throw new NotFoundError("Visitor not found");
    return reply.send(visitor);
  });

  /**
   * The visitor's conversation with the assistant, read-only, for the Inbox's AI Embed tab.
   *
   * The session id is taken from the TENANT's visitor row, never from the URL — that row is the
   * ownership proof, since `ai_counselor_messages` lives in the shared master schema where any
   * id would resolve. Only the latest session: the row's `session_id` moves forward each turn.
   *
   * Allow-listed to what a transcript draws; token counts, latency and feedback stay internal.
   */
  app.get("/embed/visitors/:id/messages", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { id } = VisitorIdParamSchema.parse(req.params);
    const visitor = await repo.findVisitorById(req.db, id);
    if (!visitor) throw new NotFoundError("Visitor not found");
    const sessionId = visitor.session_id as number | null;
    const rows = sessionId == null ? [] : await messagesRepo.findBySession(sessionId, { limit: TRANSCRIPT_LIMIT });
    return reply.send({
      messages: rows.map((m) => ({ id: m.id, role: m.role, content: m.content, created_at: m.created_at })),
    });
  });

  /**
   * Correct a visitor's details.
   *
   * What an owner may touch is only what the visitor themselves stated — name, email, age,
   * gender, nationality, study preference. Everything else on the row is the widget's record of
   * what happened (message counts, timestamps, contact and summary state) or is computed from
   * the row, and is not the owner's to rewrite. The schema enforces that by being strict.
   *
   * The four record sections are editable too, each replaced wholesale.
   *
   * Note the chat stays the source of truth throughout. `recordProfile` overwrites
   * age/gender/nationality/study_preference whenever a later turn restates them, and merges
   * record entries back in by their dedupe key — so a correction here can be superseded by the
   * visitor themselves, and a DELETED entry reappears if they mention it again. That is the
   * right precedence (they know their own qualifications) but it does mean an edit is a
   * correction, not a lock.
   */
  app.patch("/embed/visitors/:id", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { id } = VisitorIdParamSchema.parse(req.params);
    const patch = VisitorPatchSchema.parse(req.body ?? {});
    const visitor = await repo.updateVisitor(req.db, id, patch);
    if (!visitor) throw new NotFoundError("Visitor not found");
    return reply.send(visitor);
  });
}
