// Quality validator routes. Wave G8 — §3.4 "Quality validator: MISSING".

import type { FastifyInstance } from "fastify";

import * as service from "../services/quality.service.js";
import { resolveAdminId as adminId } from "../shared/admin-id.js";
import { UuidParamSchema } from "../schemas/jobs.schema.js";

export async function qualityRoutes(app: FastifyInstance) {
  // POST /jobs/:id/validate-quality — 503 when no LLM key is configured, but only
  // after the deterministic flags have been written. See services/quality.service.ts.
  app.post("/jobs/:id/validate-quality", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.validateJobQuality(id, await adminId(req)));
  });

  // GET /jobs/:id/quality-flags — reads without needing a key, and says so when the
  // judgement half is still pending rather than implying the batch is clean.
  app.get("/jobs/:id/quality-flags", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.listQualityFlags(id));
  });
}
