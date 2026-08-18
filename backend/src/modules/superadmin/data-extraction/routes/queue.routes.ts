// Extraction queue routes — maps V2 endpoints C1-C9, RJ4.

import type { FastifyInstance } from "fastify";
import * as service from "../services/queue.service.js";
import { QueueUuidParamSchema, QueueJobParamSchema, QueueStatusQuerySchema } from "../schemas/queue.schema.js";
import { resolveAdminId as adminId } from "../shared/admin-id.js";

export async function queueRoutes(app: FastifyInstance) {

  // RJ4: GET /jobs/:id/queue
  app.get("/jobs/:id/queue", async (req, reply) => {
    const { id } = QueueJobParamSchema.parse(req.params);
    const { status } = QueueStatusQuerySchema.parse(req.query);
    return reply.send(await service.listQueue(id, status));
  });

  // C1: POST /queue/:id/ignore
  app.post("/queue/:id/ignore", async (req, reply) => {
    const { id } = QueueUuidParamSchema.parse(req.params);
    return reply.send(await service.ignoreQueueItem(id, await adminId(req)));
  });

  // C2: POST /queue/:id/retry
  app.post("/queue/:id/retry", async (req, reply) => {
    const { id } = QueueUuidParamSchema.parse(req.params);
    return reply.send(await service.retryQueueItem(id, await adminId(req)));
  });

  // C3: POST /queue/:id/pause
  app.post("/queue/:id/pause", async (req, reply) => {
    const { id } = QueueUuidParamSchema.parse(req.params);
    return reply.send(await service.pauseQueueItem(id, await adminId(req)));
  });

  // C4: POST /queue/:id/stop
  app.post("/queue/:id/stop", async (req, reply) => {
    const { id } = QueueUuidParamSchema.parse(req.params);
    return reply.send(await service.stopQueueItem(id, await adminId(req)));
  });

  // C5: POST /queue/:id/resume
  app.post("/queue/:id/resume", async (req, reply) => {
    const { id } = QueueUuidParamSchema.parse(req.params);
    return reply.send(await service.resumeQueueItem(id, await adminId(req)));
  });

  // C6: DELETE /queue/:id
  app.delete("/queue/:id", async (req, reply) => {
    const { id } = QueueUuidParamSchema.parse(req.params);
    return reply.send(await service.deleteQueueItem(id, await adminId(req)));
  });

  // C7: POST /jobs/:id/queue/pause-all
  app.post("/jobs/:id/queue/pause-all", async (req, reply) => {
    const { id } = QueueJobParamSchema.parse(req.params);
    return reply.send(await service.pauseAllPendingQueue(id, await adminId(req)));
  });

  // C8: POST /jobs/:id/stop-all
  app.post("/jobs/:id/stop-all", async (req, reply) => {
    const { id } = QueueJobParamSchema.parse(req.params);
    return reply.send(await service.stopAll(id, await adminId(req)));
  });

  // C9: POST /jobs/:id/reset-pipeline
  app.post("/jobs/:id/reset-pipeline", async (req, reply) => {
    const { id } = QueueJobParamSchema.parse(req.params);
    return reply.send(await service.resetPipeline(id, await adminId(req)));
  });
}
