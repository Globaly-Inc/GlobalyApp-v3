import type { FastifyInstance } from "fastify";
import {
  SendMessageSchema,
  SessionIdParamSchema,
  MessageIdParamSchema,
  UpdateSessionSchema,
  FeedbackSchema,
  ListSessionsQuerySchema,
} from "../schemas/chat.schema.js";
import * as chatService from "../services/chat.service.js";
import * as sessionService from "../services/session.service.js";
import * as messagesRepo from "../repositories/messages.repository.js";
import * as creditService from "../services/credit.service.js";
import { resolveScope } from "../services/scope.js";
import { assertProviderConfigured } from "../services/provider.js";
import { NotFoundError } from "../../../shared/errors.js";

export async function chatRoutes(app: FastifyInstance) {
  // POST /messages — SSE streaming chat.
  //
  // Order matters and is the fail-closed contract: auth (plugin) → zod → scope →
  // credit gate → provider availability → only then a single SSE byte. A platform
  // with no model key answers 503 with normal HTTP headers, never an empty stream.
  app.post("/messages", async (req, reply) => {
    const input = SendMessageSchema.parse(req.body ?? {});
    const scope = resolveScope(req);

    await creditService.assertSpendable(scope);
    assertProviderConfigured();

    await chatService.handleMessage({
      scope,
      sessionId: input.session_id,
      content: input.content,
      attachments: input.attachments,
      reply,
    });
    // ponytail: SSE response written directly to reply.raw by chatService — do not call reply.send()
  });

  // GET /sessions — list the sessions this scope owns
  app.get("/sessions", async (req, reply) => {
    const query = ListSessionsQuerySchema.parse(req.query ?? {});
    const sessions = await sessionService.listSessions(resolveScope(req), query.include_archived);
    return reply.send({ sessions });
  });

  // GET /sessions/:id/messages — load messages for a session
  app.get("/sessions/:id/messages", async (req, reply) => {
    const { id } = SessionIdParamSchema.parse(req.params);
    await sessionService.getSession(id, resolveScope(req));

    const messages = await messagesRepo.findBySession(id, { limit: 100 });
    return reply.send({ messages });
  });

  // PATCH /sessions/:id — update title, archive, or soft-delete
  app.patch("/sessions/:id", async (req, reply) => {
    const { id } = SessionIdParamSchema.parse(req.params);
    const patch = UpdateSessionSchema.parse(req.body ?? {});
    const updated = await sessionService.updateSession(id, resolveScope(req), patch);
    return reply.send(updated);
  });

  // PATCH /messages/:id/feedback — thumbs up/down
  app.patch("/messages/:id/feedback", async (req, reply) => {
    const { id } = MessageIdParamSchema.parse(req.params);
    const { feedback } = FeedbackSchema.parse(req.body ?? {});
    // The session guard is what stops a caller rating someone else's message.
    const message = await messagesRepo.findById(id);
    if (!message) throw new NotFoundError("Message not found");
    await sessionService.getSession(message.session_id, resolveScope(req));
    await messagesRepo.updateFeedback(id, feedback);
    return reply.send({ ok: true });
  });
}
