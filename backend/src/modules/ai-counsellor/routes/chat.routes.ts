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
import * as sessionsRepo from "../repositories/sessions.repository.js";
import * as creditService from "../services/credit.service.js";
import * as embedService from "../services/embed.service.js";
import { NotFoundError, ForbiddenError, PaymentRequiredError } from "../../../shared/errors.js";

export async function chatRoutes(app: FastifyInstance) {
  // POST /messages — SSE streaming chat
  app.post("/messages", async (req, reply) => {
    const userId = Number(req.auth.sub);
    const input = SendMessageSchema.parse(req.body ?? {});

    // Phase 3: embed mode — scope to the business, bill its monthly quota
    const embedKey = req.headers["x-embed-key"] as string | undefined;
    const embed = embedKey
      ? await embedService.buildEmbedContext(await embedService.resolveActiveConfig(embedKey))
      : undefined;

    // Phase 2: credit gate (user wallet) — embed messages are business-paid
    if (!embed) {
      const hasCredits = await creditService.checkBalance(userId);
      if (!hasCredits) throw new PaymentRequiredError();
    }

    await chatService.handleMessage({
      userId,
      sessionId: input.session_id,
      content: input.content,
      attachments: input.attachments,
      embed,
      reply,
    });
    // ponytail: SSE response written directly to reply.raw by chatService — do not call reply.send()
  });

  // GET /sessions — list user's sessions
  app.get("/sessions", async (req, reply) => {
    const query = ListSessionsQuerySchema.parse(req.query ?? {});
    const sessions = await sessionService.listSessions(
      Number(req.auth.sub),
      query.include_archived,
    );
    return reply.send({ sessions });
  });

  // GET /sessions/:id/messages — load messages for a session
  app.get("/sessions/:id/messages", async (req, reply) => {
    const { id } = SessionIdParamSchema.parse(req.params);
    const userId = Number(req.auth.sub);

    const session = await sessionsRepo.findById(id);
    if (!session) throw new NotFoundError("Session not found");
    if (session.platform_user_id !== userId) throw new ForbiddenError("Not your session");

    const messages = await messagesRepo.findBySession(id, { limit: 100 });
    return reply.send({ messages });
  });

  // PATCH /sessions/:id — update title, archive, or soft-delete
  app.patch("/sessions/:id", async (req, reply) => {
    const { id } = SessionIdParamSchema.parse(req.params);
    const patch = UpdateSessionSchema.parse(req.body ?? {});
    const updated = await sessionService.updateSession(id, Number(req.auth.sub), patch);
    return reply.send(updated);
  });

  // PATCH /messages/:id/feedback — thumbs up/down
  app.patch("/messages/:id/feedback", async (req, reply) => {
    const { id } = MessageIdParamSchema.parse(req.params);
    const { feedback } = FeedbackSchema.parse(req.body ?? {});
    await messagesRepo.updateFeedback(id, feedback);
    return reply.send({ ok: true });
  });
}
