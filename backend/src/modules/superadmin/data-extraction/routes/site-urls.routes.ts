// Site URL list and snapshot listing — the admin's view into steps 1, 2 and 4 of the chain.

import type { FastifyInstance } from "fastify";
import * as service from "../services/site-urls.service.js";
import { UuidParamSchema } from "../schemas/jobs.schema.js";
import {
  ListSiteUrlsQuerySchema, PatchSiteUrlSchema, BulkExcludeSchema, ListSnapshotsQuerySchema, SnapshotParamSchema,
} from "../schemas/site-urls.schema.js";

export async function siteUrlsRoutes(app: FastifyInstance) {
  const adminId = (req: any) => Number(req.auth.sub);

  // GET /jobs/:id/site-urls?page=&limit=&role=&excluded=&q=
  app.get("/jobs/:id/site-urls", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    const query = ListSiteUrlsQuerySchema.parse(req.query);
    return reply.send(await service.listSiteUrls(id, query));
  });

  // PATCH /site-urls/:id { excluded?, role? }
  app.patch("/site-urls/:id", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    const input = PatchSiteUrlSchema.parse(req.body);
    return reply.send(await service.patchSiteUrl(id, input, adminId(req)));
  });

  // POST /jobs/:id/site-urls/bulk-exclude { ids, excluded }
  app.post("/jobs/:id/site-urls/bulk-exclude", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    const input = BulkExcludeSchema.parse(req.body);
    return reply.send(await service.bulkExclude(id, input, adminId(req)));
  });

  // GET /jobs/:id/snapshots?page=&limit=&q=
  app.get("/jobs/:id/snapshots", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    const query = ListSnapshotsQuerySchema.parse(req.query);
    return reply.send(await service.listSnapshots(id, query));
  });

  // GET /jobs/:id/snapshots/:pageId — the stored markdown
  app.get("/jobs/:id/snapshots/:pageId", async (req, reply) => {
    const { id, pageId } = SnapshotParamSchema.parse(req.params);
    return reply.send(await service.getSnapshotMarkdown(id, pageId));
  });
}
