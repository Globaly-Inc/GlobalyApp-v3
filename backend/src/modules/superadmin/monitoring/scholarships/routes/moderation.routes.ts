// Scholarship moderation verbs. Registered alongside the CRUD routes under
// /api/v3/admin/monitoring/scholarships, behind the parent monitoring module's
// super_admin / data_admin gate.

import type { FastifyInstance } from "fastify";

import * as platformRepo from "../../../platform/platform.repository.js";
import {
  ApproveSchema,
  FeatureSchema,
  IdParamSchema,
  PublishSchema,
  RejectSchema,
} from "../schemas/scholarships.schema.js";
import * as moderation from "../services/moderation.service.js";

export async function scholarshipModerationRoutes(app: FastifyInstance) {
  app.get("/stats", async (_req, reply) => {
    return reply.send(await moderation.stats());
  });

  app.post("/:id/approve", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const { publish } = ApproveSchema.parse(req.body ?? {});
    const row = await moderation.approve(id, publish, Number(req.auth.sub));
    await platformRepo.logAdminAction(
      Number(req.auth.sub),
      "SCHOLARSHIP_APPROVED",
      "scholarship",
      undefined,
      { scholarship_id: id, published: publish },
    );
    return reply.send(row);
  });

  app.post("/:id/reject", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const { note } = RejectSchema.parse(req.body ?? {});
    const row = await moderation.reject(id, note, Number(req.auth.sub));
    await platformRepo.logAdminAction(
      Number(req.auth.sub),
      "SCHOLARSHIP_REJECTED",
      "scholarship",
      undefined,
      { scholarship_id: id, note: note ?? null },
    );
    return reply.send(row);
  });

  app.patch("/:id/publish", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const { is_published } = PublishSchema.parse(req.body);
    const row = await moderation.setPublished(id, is_published);
    await platformRepo.logAdminAction(
      Number(req.auth.sub),
      is_published ? "SCHOLARSHIP_PUBLISHED" : "SCHOLARSHIP_UNPUBLISHED",
      "scholarship",
      undefined,
      { scholarship_id: id },
    );
    return reply.send(row);
  });

  app.patch("/:id/feature", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const { is_featured } = FeatureSchema.parse(req.body);
    const row = await moderation.setFeatured(id, is_featured);
    await platformRepo.logAdminAction(
      Number(req.auth.sub),
      "SCHOLARSHIP_FEATURED",
      "scholarship",
      undefined,
      { scholarship_id: id, is_featured },
    );
    return reply.send(row);
  });
}
