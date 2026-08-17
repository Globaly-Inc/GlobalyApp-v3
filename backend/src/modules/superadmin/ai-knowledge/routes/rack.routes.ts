// Knowledge Rack routes: categories, sources, documents, crawl dispatch.

import type { FastifyInstance, FastifyRequest } from "fastify";
import * as service from "../services/rack.service.js";
import { UuidParamSchema } from "../schemas/content.schema.js";
import {
  CrawlSourceSchema, CreateCategorySchema, CreateSourceSchema,
  DocumentQuerySchema, PatchCategorySchema, PatchSourceSchema, SourceQuerySchema,
} from "../schemas/rack.schema.js";

const adminId = (req: FastifyRequest) => Number(req.auth!.sub);

export async function rackRoutes(app: FastifyInstance) {
  app.get("/rack/overview", async (_req, reply) => reply.send(await service.overview()));

  // ── Categories ──

  app.get("/categories", async (_req, reply) => reply.send(await service.listCategories()));

  app.post("/categories", async (req, reply) =>
    reply.status(201).send(await service.createCategory(CreateCategorySchema.parse(req.body), adminId(req))),
  );

  app.patch("/categories/:id", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.updateCategory(id, PatchCategorySchema.parse(req.body), adminId(req)));
  });

  app.delete("/categories/:id", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.deleteCategory(id, adminId(req)));
  });

  // ── Sources ──

  app.get("/sources", async (req, reply) =>
    reply.send(await service.listSources(SourceQuerySchema.parse(req.query))),
  );

  app.post("/sources", async (req, reply) =>
    reply.status(201).send(await service.createSource(CreateSourceSchema.parse(req.body), adminId(req))),
  );

  app.patch("/sources/:id", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.updateSource(id, PatchSourceSchema.parse(req.body), adminId(req)));
  });

  app.delete("/sources/:id", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.deleteSource(id, adminId(req)));
  });

  app.post("/sources/:id/crawl", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    const { max_pages } = CrawlSourceSchema.parse(req.body ?? {});
    return reply.status(202).send(await service.crawlSource(id, max_pages, adminId(req)));
  });

  // ── Documents ──

  app.get("/documents", async (req, reply) =>
    reply.send(await service.listDocuments(DocumentQuerySchema.parse(req.query))),
  );

  app.get("/documents/:id", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.getDocument(id));
  });

  app.delete("/documents/:id", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.deleteDocument(id, adminId(req)));
  });
}
