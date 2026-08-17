// Curated-content routes: visa entries, FAQs, country guides, verification queue.

import type { FastifyInstance, FastifyRequest } from "fastify";
import * as service from "../services/content.service.js";
import type { ContentKind } from "../repositories/content.repository.js";
import {
  CreateFaqSchema, CreateGuideSchema, CreateVisaSchema,
  ListQuerySchema, PatchFaqSchema, PatchGuideSchema, PatchVisaSchema,
  QueueQuerySchema, RejectQueueItemSchema, UuidParamSchema,
} from "../schemas/content.schema.js";

const adminId = (req: FastifyRequest) => Number(req.auth!.sub);

// The three content tabs are the same four routes over a different table and schema
// pair, so they are registered from one table rather than written out three times.
const KINDS: { kind: ContentKind; path: string; create: typeof CreateVisaSchema | typeof CreateFaqSchema | typeof CreateGuideSchema; patch: typeof PatchVisaSchema | typeof PatchFaqSchema | typeof PatchGuideSchema }[] = [
  { kind: "visa", path: "/visa", create: CreateVisaSchema, patch: PatchVisaSchema },
  { kind: "faqs", path: "/faqs", create: CreateFaqSchema, patch: PatchFaqSchema },
  { kind: "guides", path: "/country-guides", create: CreateGuideSchema, patch: PatchGuideSchema },
];

export async function contentRoutes(app: FastifyInstance) {
  app.get("/overview", async (_req, reply) => reply.send(await service.overview()));

  for (const { kind, path, create, patch } of KINDS) {
    app.get(path, async (req, reply) =>
      reply.send(await service.listContent(kind, ListQuerySchema.parse(req.query))),
    );

    app.post(path, async (req, reply) =>
      reply.status(201).send(await service.createContent(kind, create.parse(req.body), adminId(req))),
    );

    app.patch(`${path}/:id`, async (req, reply) => {
      const { id } = UuidParamSchema.parse(req.params);
      return reply.send(await service.updateContent(kind, id, patch.parse(req.body), adminId(req)));
    });

    app.delete(`${path}/:id`, async (req, reply) => {
      const { id } = UuidParamSchema.parse(req.params);
      return reply.send(await service.deleteContent(kind, id, adminId(req)));
    });
  }

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
