// Inbound cross-app webhook (§3.4: V1's receive-institution-data).

import type { FastifyInstance } from "fastify";

import { IngestInstitutionSchema } from "../schemas/ingest.schema.js";
import * as ingestService from "../services/ingest.service.js";
import { assertIngestAuthorized } from "../shared/sync-auth.js";

export async function ingestRoutes(app: FastifyInstance) {
  /**
   * POST /institutions — an external system pushes an institution + its courses.
   *
   * Lands in extraction staging with job status "review". Nothing here reaches the
   * live catalogue without a human promoting it; see services/ingest.service.ts.
   */
  app.post(
    "/institutions",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      assertIngestAuthorized(req.headers as Record<string, unknown>);

      const payload = IngestInstitutionSchema.parse(req.body ?? {});
      const summary = await ingestService.ingest(payload);

      return reply.send({ success: true, ...summary });
    },
  );
}
