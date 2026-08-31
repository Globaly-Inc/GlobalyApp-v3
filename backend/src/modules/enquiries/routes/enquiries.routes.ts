// Enquiries routes — creation + get-by-id (Phase 4). Any authenticated platform user
// (student) can create; only the owning student can read their own enquiry.
// Matching/distribution/list/close endpoints are later phases.

import type { FastifyInstance } from "fastify";
import * as service from "../services/enquiries.service.js";
import * as eligibilityService from "../services/eligibility.service.js";
import * as messagesService from "../services/messages.service.js";
import * as mediaService from "../services/message-media.service.js";
import {
  CourseIdParamSchema,
  CreateEnquirySchema,
  EnquiryIdParamSchema,
  ListEnquiriesQuerySchema,
} from "../schemas/enquiries.schema.js";
import {
  DistributionIdParamSchema,
  MessageIdParamSchema,
  EditEnquiryMessageSchema,
  SendEnquiryMessageSchema,
  ToggleReactionSchema,
} from "../schemas/distributions.schema.js";
import { BadRequestError, ForbiddenError } from "../../../shared/errors.js";

export async function enquiriesRoutes(app: FastifyInstance) {
  app.post("/enquiries", async (req, reply) => {
    const input = CreateEnquirySchema.parse(req.body);
    const enquiry = await service.createEnquiry(Number(req.auth.sub), input);
    return reply.status(201).send(enquiry);
  });

  app.get("/enquiries", async (req, reply) => {
    const { page, limit, status } = ListEnquiriesQuerySchema.parse(req.query);
    const result = await service.listEnquiriesForStudent(Number(req.auth.sub), { page, limit }, status);
    return reply.send(result);
  });

  // Before /enquiries/:id — that one parses its id as a uuid, so "eligibility" would 400 rather
  // than fall through if the order were reversed.
  app.get("/enquiries/eligibility/:courseId", async (req, reply) => {
    const { courseId } = CourseIdParamSchema.parse(req.params);
    return reply.send(await eligibilityService.getVerdict(Number(req.auth.sub), courseId));
  });

  app.get("/enquiries/:id", async (req, reply) => {
    const { id } = EnquiryIdParamSchema.parse(req.params);
    const enquiry = await service.getEnquiryById(id);
    // Owner-or-admin: student can only read their own; admins bypass (mirrors
    // files.routes.ts's inline entity_id-ownership check pattern).
    if (req.auth.type !== "admin" && enquiry.student_id !== Number(req.auth.sub)) {
      throw new ForbiddenError("Not your enquiry");
    }
    return reply.send(enquiry);
  });

  // ── Chat (student side) ──
  // Addressed by distribution, not enquiry: an enquiry has one thread per unlocking
  // business. A separate prefix from /enquiry-distributions because that one is behind
  // requireBusinessContext — the student has no org context. Ownership is checked in
  // the service, which 404s rather than 403s for a thread that isn't theirs.

  // The chat inbox — every thread this student has, across all their enquiries.
  app.get("/enquiry-messages", async (req, reply) => {
    const threads = await messagesService.listThreadsForStudent(Number(req.auth.sub));
    return reply.send({ threads });
  });

  // Static before dynamic — /enquiry-messages/:id parses its id as a uuid, so
  // "starred" would 400 rather than fall through if the order were reversed.
  app.get("/enquiry-messages/starred", async (req, reply) => {
    const messages = await messagesService.listStarredForStudent(Number(req.auth.sub));
    return reply.send({ messages });
  });

  app.post("/enquiry-messages/stars/:messageId", async (req, reply) => {
    const { messageId } = MessageIdParamSchema.parse(req.params);
    const is_starred = await messagesService.toggleStarAsStudent(messageId, Number(req.auth.sub));
    return reply.send({ is_starred });
  });

  // Upload first, then send the returned storage_path with the message — keeps sending a
  // small JSON request and lets the composer preview the real uploaded object. Same
  // two-step flow as POST /media in the feed module.
  app.post("/enquiry-messages/media", async (req, reply) => {
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
  app.get("/enquiry-messages/threads/:messageId", async (req, reply) => {
    const { messageId } = MessageIdParamSchema.parse(req.params);
    const messages = await messagesService.listRepliesForStudent(messageId, Number(req.auth.sub));
    return reply.send({ messages });
  });

  app.post("/enquiry-messages/threads/:messageId", async (req, reply) => {
    const { messageId } = MessageIdParamSchema.parse(req.params);
    const { body, attachments } = SendEnquiryMessageSchema.parse(req.body);
    const message = await messagesService.sendReplyAsStudent(
      messageId,
      Number(req.auth.sub),
      body,
      attachments ?? [],
    );
    return reply.send(message);
  });

  // ── Edit / delete one message (sender only, enforced in the service) ──
  app.patch("/enquiry-messages/messages/:messageId", async (req, reply) => {
    const { messageId } = MessageIdParamSchema.parse(req.params);
    const { body } = EditEnquiryMessageSchema.parse(req.body);
    const message = await messagesService.editAsStudent(messageId, Number(req.auth.sub), body);
    return reply.send(message);
  });

  app.delete("/enquiry-messages/messages/:messageId", async (req, reply) => {
    const { messageId } = MessageIdParamSchema.parse(req.params);
    await messagesService.deleteAsStudent(messageId, Number(req.auth.sub));
    return reply.status(204).send();
  });

  app.post("/enquiry-messages/reactions/:messageId", async (req, reply) => {
    const { messageId } = MessageIdParamSchema.parse(req.params);
    const { emoji } = ToggleReactionSchema.parse(req.body);
    const reacted = await messagesService.toggleReactionAsStudent(messageId, Number(req.auth.sub), emoji);
    return reply.send({ emoji, reacted });
  });

  app.post("/enquiry-messages/pins/:messageId", async (req, reply) => {
    const { messageId } = MessageIdParamSchema.parse(req.params);
    const is_pinned = await messagesService.togglePinAsStudent(messageId, Number(req.auth.sub));
    return reply.send({ is_pinned });
  });

  app.get("/enquiry-messages/:id", async (req, reply) => {
    const { id } = DistributionIdParamSchema.parse(req.params);
    const messages = await messagesService.listForStudent(id, Number(req.auth.sub));
    return reply.send({ messages });
  });

  app.post("/enquiry-messages/:id", async (req, reply) => {
    const { id } = DistributionIdParamSchema.parse(req.params);
    const { body, attachments } = SendEnquiryMessageSchema.parse(req.body);
    const message = await messagesService.sendAsStudent(id, Number(req.auth.sub), body, attachments ?? []);
    return reply.send(message);
  });

  // Read state and Favorites are per viewer, so both are POST-toggle/POST-mark rather
  // than PATCHes on the distribution — nothing about the shared row changes.
  app.post("/enquiry-messages/:id/read", async (req, reply) => {
    const { id } = DistributionIdParamSchema.parse(req.params);
    await messagesService.markReadAsStudent(id, Number(req.auth.sub));
    return reply.status(204).send();
  });

  app.post("/enquiry-messages/:id/favorite", async (req, reply) => {
    const { id } = DistributionIdParamSchema.parse(req.params);
    const is_favorite = await messagesService.toggleFavoriteAsStudent(id, Number(req.auth.sub));
    return reply.send({ is_favorite });
  });
}
