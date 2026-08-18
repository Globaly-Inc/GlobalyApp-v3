// Curated-content routes: visa entries, FAQs, country guides, verification queue.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeAny } from "zod";
import * as service from "../services/content.service.js";
import type { ContentKind } from "../repositories/content.repository.js";
import {
  CreateFaqSchema, CreateGuideSchema, CreateVisaSchema,
  ListQuerySchema, PatchFaqSchema, PatchGuideSchema, PatchVisaSchema,
  QueueQuerySchema, RejectQueueItemSchema, UuidParamSchema,
} from "../schemas/content.schema.js";

const adminId = (req: FastifyRequest) => Number(req.auth!.sub);

/**
 * The three content tabs are the same four handlers over a different table and
 * schema pair, so the bodies are built once per kind. The paths themselves stay
 * written out as literals below: scripts/check-api-contract.mjs reads the route
 * table statically, and a path assembled from a loop variable is invisible to it.
 */
function handlersFor(kind: ContentKind, create: ZodTypeAny, patch: ZodTypeAny) {
  return {
    list: async (req: FastifyRequest, reply: FastifyReply) =>
      reply.send(await service.listContent(kind, ListQuerySchema.parse(req.query))),

    create: async (req: FastifyRequest, reply: FastifyReply) =>
      reply.status(201).send(await service.createContent(kind, create.parse(req.body), adminId(req))),

    patch: async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = UuidParamSchema.parse(req.params);
      return reply.send(await service.updateContent(kind, id, patch.parse(req.body), adminId(req)));
    },

    remove: async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = UuidParamSchema.parse(req.params);
      return reply.send(await service.deleteContent(kind, id, adminId(req)));
    },
  };
}

export async function contentRoutes(app: FastifyInstance) {
  app.get("/overview", async (_req, reply) => reply.send(await service.overview()));

  // ── Visa ──
  const visa = handlersFor("visa", CreateVisaSchema, PatchVisaSchema);
  app.get("/visa", visa.list);
  app.post("/visa", visa.create);
  app.patch("/visa/:id", visa.patch);
  app.delete("/visa/:id", visa.remove);

  // ── FAQs ──
  const faqs = handlersFor("faqs", CreateFaqSchema, PatchFaqSchema);
  app.get("/faqs", faqs.list);
  app.post("/faqs", faqs.create);
  app.patch("/faqs/:id", faqs.patch);
  app.delete("/faqs/:id", faqs.remove);

  // ── Country guides ──
  const guides = handlersFor("guides", CreateGuideSchema, PatchGuideSchema);
  app.get("/country-guides", guides.list);
  app.post("/country-guides", guides.create);
  app.patch("/country-guides/:id", guides.patch);
  app.delete("/country-guides/:id", guides.remove);

  // ── Verification queue ──

  app.get("/verification-queue", async (req, reply) =>
    reply.send(await service.listQueue(QueueQuerySchema.parse(req.query))),
  );

  app.post("/verification-queue/:id/approve", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.reviewQueueItem(id, "verified", adminId(req)));
  });

  app.post("/verification-queue/:id/reject", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    const { rejection_reason } = RejectQueueItemSchema.parse(req.body);
    return reply.send(await service.reviewQueueItem(id, "rejected", adminId(req), rejection_reason));
  });
}
