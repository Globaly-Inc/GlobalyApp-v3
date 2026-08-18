// The signed-in user's ambassador surface. Registered under /api/v3/me/ambassador
// inside the server's protected scope, so req.auth is already verified.
//
// The caller is always Number(req.auth.sub). No handler here reads a user id
// from the path or body — that is the whole ownership story.

import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  ApplySchema,
  ConnectOnboardingSchema,
  CreateInquirySchema,
  IdParamSchema,
  RequestPayoutSchema,
  SendMessageSchema,
  ThreadIdParamSchema,
  UpdateAmbassadorProfileSchema,
  UpdateInquiryStatusSchema,
} from "../schemas/ambassadors.schema.js";
import * as me from "../services/me.service.js";
import * as chat from "../services/chat.service.js";
import * as payouts from "../services/payouts.service.js";
import * as engagement from "../services/engagement.service.js";

function userId(req: FastifyRequest): number {
  return Number(req.auth.sub);
}

export async function meAmbassadorRoutes(app: FastifyInstance) {
  // ── Profile ───────────────────────────────────────────────────────────────
  app.get("/profile", async (req, reply) => reply.send(await me.getProfile(userId(req))));

  app.patch("/profile", async (req, reply) => {
    const body = UpdateAmbassadorProfileSchema.parse(req.body);
    return reply.send(await me.updateProfile(userId(req), body));
  });

  // ── Inquiry queue ─────────────────────────────────────────────────────────
  app.get("/inquiries", async (req, reply) => reply.send(await me.listInquiries(userId(req))));

  app.get("/inquiries/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const { inquiry } = await chat.getInquiryForParticipant(userId(req), id);
    return reply.send(inquiry);
  });

  app.patch("/inquiries/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const { status } = UpdateInquiryStatusSchema.parse(req.body);
    return reply.send(await me.setInquiryStatus(userId(req), id, status));
  });

  // A prospective student opens an inquiry. Matching happens server-side.
  app.post("/inquiries", async (req, reply) => {
    const body = CreateInquirySchema.parse(req.body);
    return reply.code(201).send(await engagement.createInquiry(userId(req), body));
  });

  // ── Chat ──────────────────────────────────────────────────────────────────
  app.post("/inquiries/:id/thread", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await chat.openThread(userId(req), id));
  });

  app.get("/threads/:threadId/messages", async (req, reply) => {
    const { threadId } = ThreadIdParamSchema.parse(req.params);
    return reply.send(await chat.listMessages(userId(req), threadId));
  });

  app.post("/threads/:threadId/messages", async (req, reply) => {
    const { threadId } = ThreadIdParamSchema.parse(req.params);
    const { message_text } = SendMessageSchema.parse(req.body);
    return reply.code(201).send(await chat.sendMessage(userId(req), threadId, message_text));
  });

  // ── Applications ──────────────────────────────────────────────────────────
  app.get("/applications", async (req, reply) =>
    reply.send(await me.listMyApplications(userId(req))),
  );

  app.post("/applications", async (req, reply) => {
    const body = ApplySchema.parse(req.body);
    return reply.code(201).send(await me.apply(userId(req), body));
  });

  // ── Money ─────────────────────────────────────────────────────────────────
  app.get("/earnings", async (req, reply) => reply.send(await me.getEarnings(userId(req))));

  // 503 until Stripe keys exist — see payouts.service.ts.
  app.post("/connect", async (req, reply) =>
    reply.send(await payouts.createConnectAccount(userId(req), req.auth.email)),
  );

  app.post("/connect/onboarding-link", async (req, reply) => {
    const { return_url } = ConnectOnboardingSchema.parse(req.body ?? {});
    return reply.send(await payouts.createOnboardingLink(userId(req), return_url));
  });

  app.post("/payouts", async (req, reply) => {
    const body = RequestPayoutSchema.parse(req.body);
    return reply.send(await payouts.requestPayout(userId(req), body));
  });
}
