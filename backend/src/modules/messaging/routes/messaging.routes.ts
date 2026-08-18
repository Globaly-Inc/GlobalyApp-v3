import type { FastifyInstance } from "fastify";

import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
import { PaginationSchema } from "../../../shared/pagination.js";
import {
  ConversationIdParamSchema,
  HistoryQuerySchema,
  InviteParticipantSchema,
  SendMessageSchema,
  StartConversationSchema,
  StreamQuerySchema,
} from "../schemas/messaging.schema.js";
import * as messagingService from "../services/messaging.service.js";
import { streamConversation } from "../services/stream.service.js";
import * as messagesRepo from "../repositories/messages.repository.js";

export async function messagingRoutes(app: FastifyInstance) {
  const callerId = (req: { auth: { sub: string } }) => Number(req.auth.sub);

  // GET /conversations — the caller's threads, newest activity first, with unread counts.
  app.get("/conversations", async (req, reply) => {
    const pagination = PaginationSchema.parse(req.query ?? {});
    return reply.send(await messagingService.listConversations(callerId(req), pagination));
  });

  // POST /conversations — start a thread (V1 start-chat). Business side only.
  app.post("/conversations", { preHandler: requireBusinessContext }, async (req, reply) => {
    const input = StartConversationSchema.parse(req.body ?? {});
    const result = await messagingService.startConversation(input, {
      platformUserId: callerId(req),
      business: req.business!,
      tenantDb: req.db,
    });
    return reply.status(result.existing ? 200 : 201).send(result);
  });

  // GET /conversations/:id — detail, participants, and one page of history.
  app.get("/conversations/:id", async (req, reply) => {
    const { id } = ConversationIdParamSchema.parse(req.params);
    const query = HistoryQuerySchema.parse(req.query ?? {});
    return reply.send(await messagingService.getConversation(id, callerId(req), query));
  });

  // POST /conversations/:id/messages — send. sender is always the caller, never the body.
  app.post("/conversations/:id/messages", async (req, reply) => {
    const { id } = ConversationIdParamSchema.parse(req.params);
    const input = SendMessageSchema.parse(req.body ?? {});
    const message = await messagingService.sendMessage(id, callerId(req), input);
    return reply.status(201).send({ message });
  });

  // POST /conversations/:id/participants — invite a team member (V1 invite-chat-participant).
  app.post("/conversations/:id/participants", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { id } = ConversationIdParamSchema.parse(req.params);
    const { invitee_user_id } = InviteParticipantSchema.parse(req.body ?? {});
    const participant = await messagingService.inviteParticipant(id, invitee_user_id, {
      platformUserId: callerId(req),
      business: req.business!,
      tenantDb: req.db,
    });
    return reply.status(201).send({ participant });
  });

  // POST /conversations/:id/read — move the caller's read watermark to the newest message.
  app.post("/conversations/:id/read", async (req, reply) => {
    const { id } = ConversationIdParamSchema.parse(req.params);
    return reply.send(await messagingService.markRead(id, callerId(req)));
  });

  // GET /conversations/:id/stream — SSE. The participant check runs BEFORE the hijack, so
  // a non-participant still gets a normal JSON 404 instead of an opened stream.
  app.get("/conversations/:id/stream", async (req, reply) => {
    const { id } = ConversationIdParamSchema.parse(req.params);
    const { since_id } = StreamQuerySchema.parse(req.query ?? {});
    await messagingService.requireParticipant(id, callerId(req));

    // No cursor supplied = only what arrives from now on; history comes from GET :id.
    const cursor = since_id ?? (await messagesRepo.maxId(id));
    streamConversation(req, reply, id, cursor);
  });
}
