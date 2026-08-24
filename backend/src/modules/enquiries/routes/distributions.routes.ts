// Distribution routes — the business inbox: list, unlock, close, and chat. Business
// scoping follows the existing convention (requireBusinessContext resolves
// req.auth.orgId and sets req.db to the tenant-scoped Knex via tenant.plugin.ts,
// requirePermission gates the action) rather than a :businessId URL param.

import type { FastifyInstance } from "fastify";
import * as service from "../services/distributions.service.js";
import * as messagesService from "../services/messages.service.js";
import * as mediaService from "../services/message-media.service.js";
import {
  CloseDistributionSchema,
  DistributionIdParamSchema,
  EditEnquiryMessageSchema,
  ListDistributionsQuerySchema,
  MessageIdParamSchema,
  SendEnquiryMessageSchema,
  ToggleReactionSchema,
} from "../schemas/distributions.schema.js";
import { requireBusinessContext, requirePermission } from "../../../core/plugins/auth.plugin.js";
import { BadRequestError } from "../../../shared/errors.js";

export async function distributionsRoutes(app: FastifyInstance) {
  app.get(
    "/enquiry-distributions",
    { preHandler: [requireBusinessContext, requirePermission("enquiries:view")] },
    async (req, reply) => {
      const query = ListDistributionsQuerySchema.parse(req.query);
      const distributions = await service.listForBusiness(req.db, query);
      return reply.send({ data: distributions });
    },
  );

  // Credit balance for the unlock paywall. Read-only, so it rides on
  // enquiries:view rather than needing its own permission.
  app.get(
    "/enquiry-distributions/credits",
    { preHandler: [requireBusinessContext, requirePermission("enquiries:view")] },
    async (req, reply) => reply.send(service.getCreditBalance()),
  );

  // 402 when credits are short, 409 once the enquiry's unlock cap is reached —
  // both mapped from the thrown AppError by error-handler.plugin.ts.
  app.post(
    "/enquiry-distributions/:id/unlock",
    { preHandler: [requireBusinessContext, requirePermission("enquiries:unlock")] },
    async (req, reply) => {
      const { id } = DistributionIdParamSchema.parse(req.params);
      const result = await service.unlock(req.businessId, id, Number(req.auth.sub));
      return reply.send(result);
    },
  );

  app.post(
    "/enquiry-distributions/:id/close",
    { preHandler: [requireBusinessContext, requirePermission("enquiries:respond")] },
    async (req, reply) => {
      const { id } = DistributionIdParamSchema.parse(req.params);
      const { close_reason } = CloseDistributionSchema.parse(req.body);
      const result = await service.close(req.businessId, id, close_reason, Number(req.auth.sub));
      return reply.send(result);
    },
  );

  // ── Chat ──
  // Reuses enquiries:respond, the same permission as close: both are "act on a lead
  // that was distributed to us". 409 until the row is unlocked, and once closed.

  // Every chat route below carries the same preHandler pair, so it is named once.
  const chatGuard = { preHandler: [requireBusinessContext, requirePermission("enquiries:respond")] };

  // Static segments BEFORE the dynamic :id ones, exactly as the student routes do:
  // /enquiry-distributions/:id parses its id as a uuid, so "messages" or "starred" would
  // 400 rather than fall through if the order were reversed.

  /** The chat inbox — every thread this business has, across all its unlocked leads. */
  app.get("/enquiry-distributions/messages", chatGuard, async (req, reply) => {
    const threads = await messagesService.listThreadsForBusiness(req.businessId, Number(req.auth.sub));
    return reply.send({ threads });
  });

  app.get("/enquiry-distributions/messages/starred", chatGuard, async (req, reply) => {
    const messages = await messagesService.listStarredForBusiness(req.businessId, Number(req.auth.sub));
    return reply.send({ messages });
  });

  app.post("/enquiry-distributions/messages/stars/:messageId", chatGuard, async (req, reply) => {
    const { messageId } = MessageIdParamSchema.parse(req.params);
    const is_starred = await messagesService.toggleStarAsBusiness(messageId, req.businessId, Number(req.auth.sub));
    return reply.send({ is_starred });
  });

  app.post("/enquiry-distributions/messages/pins/:messageId", chatGuard, async (req, reply) => {
    const { messageId } = MessageIdParamSchema.parse(req.params);
    const is_pinned = await messagesService.togglePinAsBusiness(messageId, req.businessId, Number(req.auth.sub));
    return reply.send({ is_pinned });
  });

  app.post("/enquiry-distributions/messages/reactions/:messageId", chatGuard, async (req, reply) => {
    const { messageId } = MessageIdParamSchema.parse(req.params);
    const { emoji } = ToggleReactionSchema.parse(req.body);
    const reacted = await messagesService.toggleReactionAsBusiness(
      messageId,
      req.businessId,
      Number(req.auth.sub),
      emoji,
    );
    return reply.send({ reacted });
  });

  // Upload first, then send the returned storage_path with the message — same two-step
  // flow as the student side, and the same media service owns the file.
  app.post("/enquiry-distributions/messages/media", chatGuard, async (req, reply) => {
    const file = await req.file();
    if (!file) throw new BadRequestError("No file uploaded");
    const uploaded = await mediaService.upload({
      userId: Number(req.auth.sub),
      filename: file.filename,
      mimeType: file.mimetype,
      buffer: await file.toBuffer(),
    });
    return reply.status(201).send(uploaded);
  });

  // ── Threads ── one level deep; replying to a reply anchors to its parent.
  app.get("/enquiry-distributions/messages/threads/:messageId", chatGuard, async (req, reply) => {
    const { messageId } = MessageIdParamSchema.parse(req.params);
    const messages = await messagesService.listRepliesForBusiness(messageId, req.businessId, Number(req.auth.sub));
    return reply.send({ messages });
  });

  app.post("/enquiry-distributions/messages/threads/:messageId", chatGuard, async (req, reply) => {
    const { messageId } = MessageIdParamSchema.parse(req.params);
    const { body, attachments } = SendEnquiryMessageSchema.parse(req.body);
    const message = await messagesService.sendReplyAsBusiness(
      messageId,
      req.businessId,
      Number(req.auth.sub),
      body,
      attachments ?? [],
    );
    return reply.send(message);
  });

  // ── Edit / delete one message (sender only, enforced in the service) ──
  app.patch("/enquiry-distributions/messages/:messageId", chatGuard, async (req, reply) => {
    const { messageId } = MessageIdParamSchema.parse(req.params);
    const { body } = EditEnquiryMessageSchema.parse(req.body);
    const message = await messagesService.editAsBusiness(messageId, req.businessId, Number(req.auth.sub), body);
    return reply.send(message);
  });

  app.delete("/enquiry-distributions/messages/:messageId", chatGuard, async (req, reply) => {
    const { messageId } = MessageIdParamSchema.parse(req.params);
    await messagesService.deleteAsBusiness(messageId, req.businessId, Number(req.auth.sub));
    return reply.status(204).send();
  });

  // ── One thread ──
  app.get("/enquiry-distributions/:id/messages", chatGuard, async (req, reply) => {
    const { id } = DistributionIdParamSchema.parse(req.params);
    const messages = await messagesService.listForBusiness(id, req.businessId, Number(req.auth.sub));
    return reply.send({ messages });
  });

  app.post("/enquiry-distributions/:id/messages", chatGuard, async (req, reply) => {
    const { id } = DistributionIdParamSchema.parse(req.params);
    const { body, attachments } = SendEnquiryMessageSchema.parse(req.body);
    const message = await messagesService.sendAsBusiness(
      id,
      req.businessId,
      Number(req.auth.sub),
      body,
      attachments ?? [],
    );
    return reply.send(message);
  });

  app.post("/enquiry-distributions/:id/messages/read", chatGuard, async (req, reply) => {
    const { id } = DistributionIdParamSchema.parse(req.params);
    await messagesService.markReadAsBusiness(id, req.businessId, Number(req.auth.sub));
    return reply.status(204).send();
  });

  app.post("/enquiry-distributions/:id/messages/favorite", chatGuard, async (req, reply) => {
    const { id } = DistributionIdParamSchema.parse(req.params);
    const is_favorite = await messagesService.toggleFavoriteAsBusiness(
      id,
      req.businessId,
      Number(req.auth.sub),
    );
    return reply.send({ is_favorite });
  });
}
