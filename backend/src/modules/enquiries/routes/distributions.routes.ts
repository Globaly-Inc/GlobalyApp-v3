// Distribution routes — the recipient's inbox: list, unlock, close, and chat.
//
// Scoping follows the existing convention (the org context resolves req.auth.orgId and sets
// req.db to the tenant-scoped Knex via tenant.plugin.ts) rather than an id in the URL. The
// recipient is a business OR an institution: an enquiry nobody represents falls back to the
// institution the course belongs to, and it works that lead in the same screens with the same
// paywall. `requireEnquiryPermission` is what differs between the two — see shared/recipient.ts.

import type { FastifyInstance } from "fastify";
import * as service from "../services/distributions.service.js";
import * as messagesService from "../services/messages.service.js";
import * as threadMembersService from "../services/thread-members.service.js";
import * as mediaService from "../services/message-media.service.js";
import {
  CloseDistributionSchema,
  DistributionIdParamSchema,
  EditEnquiryMessageSchema,
  ListDistributionsQuerySchema,
  MessageIdParamSchema,
  SendEnquiryMessageSchema,
  AddThreadMembersSchema,
  ThreadMemberParamsSchema,
  ThreadMemberRoleSchema,
  ThreadPhotoSchema,
  ThreadTitleSchema,
  ToggleReactionSchema,
} from "../schemas/distributions.schema.js";
import { requireBusinessOrInstitutionContext } from "../../../core/plugins/auth.plugin.js";
import { recipientFromRequest, requireEnquiryPermission } from "../shared/recipient.js";
import { BadRequestError } from "../../../shared/errors.js";

export async function distributionsRoutes(app: FastifyInstance) {
  app.get(
    "/enquiry-distributions",
    { preHandler: [requireBusinessOrInstitutionContext, requireEnquiryPermission("enquiries:view")] },
    async (req, reply) => {
      const { page, limit, status, search } = ListDistributionsQuerySchema.parse(req.query);
      // Sends { data, meta } like every other paginated list — the bare { data } it used to
      // return had no total, so the client could not know how many pages there were.
      return reply.send(
        await service.listForBusiness(req.db, recipientFromRequest(req), { page, limit }, { status, search }),
      );
    },
  );

  // Credit balance for the unlock paywall. Read-only, so it rides on
  // enquiries:view rather than needing its own permission.
  app.get(
    "/enquiry-distributions/credits",
    { preHandler: [requireBusinessOrInstitutionContext, requireEnquiryPermission("enquiries:view")] },
    async (req, reply) => reply.send(await service.getCreditBalance(recipientFromRequest(req))),
  );

  // 402 when credits are short, 409 once the enquiry's unlock cap is reached —
  // both mapped from the thrown AppError by error-handler.plugin.ts.
  app.post(
    "/enquiry-distributions/:id/unlock",
    { preHandler: [requireBusinessOrInstitutionContext, requireEnquiryPermission("enquiries:unlock")] },
    async (req, reply) => {
      const { id } = DistributionIdParamSchema.parse(req.params);
      const result = await service.unlock(recipientFromRequest(req), id, Number(req.auth.sub));
      return reply.send(result);
    },
  );

  /**
   * The student's full profile — what unlocking actually buys beyond a phone number.
   *
   * Rides on enquiries:view rather than a new permission: anyone who can see the inbox can see
   * the profile of a lead their org has already paid for. The paywall is the distribution's
   * `unlocked_at`, enforced in the service — 402 while locked, 404 for another org's id — so this
   * cannot be reached by calling the endpoint directly.
   */
  app.get(
    "/enquiry-distributions/:id/student-profile",
    { preHandler: [requireBusinessOrInstitutionContext, requireEnquiryPermission("enquiries:view")] },
    async (req, reply) => {
      const { id } = DistributionIdParamSchema.parse(req.params);
      const profile = await service.getStudentProfile(recipientFromRequest(req), id);
      return reply.send(profile);
    },
  );

  app.post(
    "/enquiry-distributions/:id/close",
    { preHandler: [requireBusinessOrInstitutionContext, requireEnquiryPermission("enquiries:respond")] },
    async (req, reply) => {
      const { id } = DistributionIdParamSchema.parse(req.params);
      const { close_reason } = CloseDistributionSchema.parse(req.body);
      const result = await service.close(recipientFromRequest(req), id, close_reason, Number(req.auth.sub));
      return reply.send(result);
    },
  );

  // ── Chat ──
  // No enquiries:* permission here, deliberately: THREAD MEMBERSHIP is the authorization. Every
  // service call below goes through assertBusinessParticipant (messages.service) or requireMember
  // (thread-members.service), and both 404 anyone who is not on the thread. A permission could
  // therefore only decide whether an agent may use chat at all — and since threads became Spaces
  // that decision belongs to whoever put them on the thread, not to their role.
  //
  // requireEnquiryPermission() with no arguments still resolves the tenant `agents` row, which is
  // what stops a colleague who was removed from the business keeping access to threads they are
  // still listed on. Note this is NOT what /close above does: closing is a lifecycle action on the
  // distribution, not a message in a thread, so it keeps enquiries:respond.
  //
  // 409 until the row is unlocked, and once closed.
  const chatGuard = { preHandler: [requireBusinessOrInstitutionContext, requireEnquiryPermission()] };

  // ── Thread membership ── the Space roster for one enquiry conversation.
  //
  // Reads are open to anyone on the thread: if you can work it you can see who else is on it.
  // Writes are additionally gated on being the thread's ADMIN, checked in the service —
  // membership says you may act on this thread, admin says you may change who else can.

  app.get("/enquiry-distributions/:id/members", chatGuard, async (req, reply) => {
    const { id } = DistributionIdParamSchema.parse(req.params);
    return reply.send(
      await threadMembersService.listMembers(id, recipientFromRequest(req), Number(req.auth.sub)),
    );
  });

  app.get("/enquiry-distributions/:id/member-candidates", chatGuard, async (req, reply) => {
    const { id } = DistributionIdParamSchema.parse(req.params);
    return reply.send({
      candidates: await threadMembersService.listCandidates(id, recipientFromRequest(req), Number(req.auth.sub)),
    });
  });

  app.post("/enquiry-distributions/:id/members", chatGuard, async (req, reply) => {
    const { id } = DistributionIdParamSchema.parse(req.params);
    const { user_ids } = AddThreadMembersSchema.parse(req.body);
    return reply.send(
      await threadMembersService.addMembers(id, recipientFromRequest(req), Number(req.auth.sub), user_ids),
    );
  });

  app.patch("/enquiry-distributions/:id/members/:userId", chatGuard, async (req, reply) => {
    const { id, userId } = ThreadMemberParamsSchema.parse(req.params);
    const { role } = ThreadMemberRoleSchema.parse(req.body);
    await threadMembersService.setRole(id, recipientFromRequest(req), Number(req.auth.sub), userId, role);
    return reply.status(204).send();
  });

  app.delete("/enquiry-distributions/:id/members/:userId", chatGuard, async (req, reply) => {
    const { id, userId } = ThreadMemberParamsSchema.parse(req.params);
    await threadMembersService.removeMember(id, recipientFromRequest(req), Number(req.auth.sub), userId);
    return reply.status(204).send();
  });

  // Renames the thread for everyone on it, the student included. Admin only, enforced in the
  // service — this changes what the conversation IS, not what is in it.
  app.patch("/enquiry-distributions/:id/title", chatGuard, async (req, reply) => {
    const { id } = DistributionIdParamSchema.parse(req.params);
    const { title } = ThreadTitleSchema.parse(req.body);
    return reply.send(await threadMembersService.renameThread(id, recipientFromRequest(req), Number(req.auth.sub), title));
  });

  // The thread's shared picture. Two-step: the bytes went up through the media endpoint above, this
  // stores the path it returned. Admin only, and the service re-checks the uploader.
  app.patch("/enquiry-distributions/:id/photo", chatGuard, async (req, reply) => {
    const { id } = DistributionIdParamSchema.parse(req.params);
    const { photo_path } = ThreadPhotoSchema.parse(req.body);
    return reply.send(await threadMembersService.setPhoto(id, recipientFromRequest(req), Number(req.auth.sub), photo_path));
  });

  // Leaving is your own membership, not member management, so it is not gated on being an admin —
  // the constraints that do apply live in the service. POST like /unlock and /close: an action on
  // the distribution rather than an edit to one of its sub-resources.
  app.post("/enquiry-distributions/:id/leave", chatGuard, async (req, reply) => {
    const { id } = DistributionIdParamSchema.parse(req.params);
    await threadMembersService.leave(id, recipientFromRequest(req), Number(req.auth.sub));
    return reply.status(204).send();
  });


  // Static segments BEFORE the dynamic :id ones, exactly as the student routes do:
  // /enquiry-distributions/:id parses its id as a uuid, so "messages" or "starred" would
  // 400 rather than fall through if the order were reversed.

  /** The chat inbox — every thread this business has, across all its unlocked leads. */
  app.get("/enquiry-distributions/messages", chatGuard, async (req, reply) => {
    const threads = await messagesService.listThreadsForBusiness(recipientFromRequest(req), Number(req.auth.sub));
    return reply.send({ threads });
  });

  app.get("/enquiry-distributions/messages/starred", chatGuard, async (req, reply) => {
    const messages = await messagesService.listStarredForBusiness(recipientFromRequest(req), Number(req.auth.sub));
    return reply.send({ messages });
  });

  app.post("/enquiry-distributions/messages/stars/:messageId", chatGuard, async (req, reply) => {
    const { messageId } = MessageIdParamSchema.parse(req.params);
    const is_starred = await messagesService.toggleStarAsBusiness(messageId, recipientFromRequest(req), Number(req.auth.sub));
    return reply.send({ is_starred });
  });

  app.post("/enquiry-distributions/messages/pins/:messageId", chatGuard, async (req, reply) => {
    const { messageId } = MessageIdParamSchema.parse(req.params);
    const is_pinned = await messagesService.togglePinAsBusiness(messageId, recipientFromRequest(req), Number(req.auth.sub));
    return reply.send({ is_pinned });
  });

  app.post("/enquiry-distributions/messages/reactions/:messageId", chatGuard, async (req, reply) => {
    const { messageId } = MessageIdParamSchema.parse(req.params);
    const { emoji } = ToggleReactionSchema.parse(req.body);
    const reacted = await messagesService.toggleReactionAsBusiness(
      messageId,
      recipientFromRequest(req),
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
    const messages = await messagesService.listRepliesForBusiness(messageId, recipientFromRequest(req), Number(req.auth.sub));
    return reply.send({ messages });
  });

  app.post("/enquiry-distributions/messages/threads/:messageId", chatGuard, async (req, reply) => {
    const { messageId } = MessageIdParamSchema.parse(req.params);
    const { body, attachments } = SendEnquiryMessageSchema.parse(req.body);
    const message = await messagesService.sendReplyAsBusiness(
      messageId,
      recipientFromRequest(req),
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
    const message = await messagesService.editAsBusiness(messageId, recipientFromRequest(req), Number(req.auth.sub), body);
    return reply.send(message);
  });

  app.delete("/enquiry-distributions/messages/:messageId", chatGuard, async (req, reply) => {
    const { messageId } = MessageIdParamSchema.parse(req.params);
    await messagesService.deleteAsBusiness(messageId, recipientFromRequest(req), Number(req.auth.sub));
    return reply.status(204).send();
  });

  // ── One thread ──
  app.get("/enquiry-distributions/:id/messages", chatGuard, async (req, reply) => {
    const { id } = DistributionIdParamSchema.parse(req.params);
    const messages = await messagesService.listForBusiness(id, recipientFromRequest(req), Number(req.auth.sub));
    return reply.send({ messages });
  });

  app.post("/enquiry-distributions/:id/messages", chatGuard, async (req, reply) => {
    const { id } = DistributionIdParamSchema.parse(req.params);
    const { body, attachments } = SendEnquiryMessageSchema.parse(req.body);
    const message = await messagesService.sendAsBusiness(
      id,
      recipientFromRequest(req),
      Number(req.auth.sub),
      body,
      attachments ?? [],
    );
    return reply.send(message);
  });

  app.post("/enquiry-distributions/:id/messages/read", chatGuard, async (req, reply) => {
    const { id } = DistributionIdParamSchema.parse(req.params);
    await messagesService.markReadAsBusiness(id, recipientFromRequest(req), Number(req.auth.sub));
    return reply.status(204).send();
  });

  app.post("/enquiry-distributions/:id/messages/favorite", chatGuard, async (req, reply) => {
    const { id } = DistributionIdParamSchema.parse(req.params);
    const is_favorite = await messagesService.toggleFavoriteAsBusiness(
      id,
      recipientFromRequest(req),
      Number(req.auth.sub),
    );
    return reply.send({ is_favorite });
  });
}
