// Supporting routes — maps V2 endpoints E8-E10, RR1-RR3, SL1.

import type { FastifyInstance } from "fastify";
import * as service from "../services/supporting.service.js";
import { UuidParamSchema } from "../schemas/jobs.schema.js";
import {
  UpsertSiteProfileSchema,
  SiteProfileQuerySchema,
  PatchLessonSchema,
  LessonsQuerySchema,
  SaveAndLearnSchema,
} from "../schemas/supporting.schema.js";
import { resolveAdminId as adminId } from "../shared/admin-id.js";

export async function supportingRoutes(app: FastifyInstance) {

  // ── Site profiles ──

  // RR1: GET /site-profiles
  app.get("/site-profiles", async (req, reply) => {
    const query = SiteProfileQuerySchema.parse(req.query);
    return reply.send(await service.listSiteProfiles(query));
  });

  // RR2: GET /jobs/:id/site-profile
  app.get("/jobs/:id/site-profile", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.getJobSiteProfile(id));
  });

  // E8: PUT /site-profiles
  app.put("/site-profiles", async (req, reply) => {
    const input = UpsertSiteProfileSchema.parse(req.body);
    return reply.send(await service.upsertSiteProfile(input, await adminId(req)));
  });

  // ── Lessons ──

  // RR3: GET /lessons
  app.get("/lessons", async (req, reply) => {
    const query = LessonsQuerySchema.parse(req.query);
    return reply.send(
      await service.listLessons({
        domain: query.domain,
        step: query.step,
        scope: query.scope,
        activeOnly: query.active_only,
        limit: query.limit,
      }),
    );
  });

  // E9: PATCH /lessons/:id
  app.patch("/lessons/:id", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    const { is_active } = PatchLessonSchema.parse(req.body);
    return reply.send(await service.patchLesson(id, is_active, await adminId(req)));
  });

  // E10: DELETE /lessons/:id
  app.delete("/lessons/:id", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.deleteLesson(id, await adminId(req)));
  });

  // ── Save and learn ──

  // SL1: POST /save-and-learn
  app.post("/save-and-learn", async (req, reply) => {
    const input = SaveAndLearnSchema.parse(req.body);
    return reply.send(await service.saveAndLearn(input, await adminId(req)));
  });
}
