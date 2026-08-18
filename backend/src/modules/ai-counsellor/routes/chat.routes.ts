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
import * as embedService from "../services/embed.service.js";
import * as storage from "../../../shared/storage/storageService.js";
import { resolveScope } from "../services/scope.js";
import { assertProviderConfigured } from "../services/provider.js";
import { NotFoundError, BadRequestError } from "../../../shared/errors.js";

export async function chatRoutes(app: FastifyInstance) {
  // POST /attachments — upload a file, returns the storage path to send with a message
  app.post("/attachments", async (req, reply) => {
    const userId = Number(req.auth.sub);
    const file = await req.file();
    if (!file) throw new BadRequestError("No file uploaded");

    const buffer = await file.toBuffer();
    storage.validateFile(file.mimetype, buffer.length);

    const storagePath = storage.buildPath("ai-chat", String(userId), "attachments", file.filename);
    await storage.uploadFile(storagePath, buffer, file.mimetype);

    return reply.status(201).send({
      storage_path: storagePath,
      filename: file.filename,
      mime_type: file.mimetype,
      size: buffer.length,
    });
  });

  // POST /messages — SSE streaming chat.
  //
  // Order matters and is the fail-closed contract: auth (plugin) → zod → scope →
  // embed pre-flight → credit gate → provider availability → only then a single SSE
  // byte. A platform with no model key answers 503 with normal HTTP headers, never
  // an empty stream.
  app.post("/messages", async (req, reply) => {
    const input = SendMessageSchema.parse(req.body ?? {});
    const scope = resolveScope(req);

    // Embed mode (x-embed-key): scope RAG to the business and bill its own monthly
    // quota rather than the caller's wallet. resolveActiveConfig IS the embed
    // pre-flight — it refuses an inactive or spent-out config (403/429) before the
    // provider is reached, which is the same fail-closed shape as the wallet gate.
    const embedKey = req.headers["x-embed-key"] as string | undefined;
    const embed = embedKey
      ? await embedService.buildEmbedContext(await embedService.resolveActiveConfig(embedKey))
      : undefined;

    // Wallet gate for every turn the embed quota does not cover. Never disabled:
    // this is the only thing between an empty wallet and a paid model call.
    if (!embed) await creditService.assertSpendable(scope);
    assertProviderConfigured();

    await chatService.handleMessage({
      scope,
      sessionId: input.session_id,
      content: input.content,
      attachments: input.attachments,
      embed,
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
