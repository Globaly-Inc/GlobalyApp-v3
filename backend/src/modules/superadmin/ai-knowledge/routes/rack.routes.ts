// Knowledge Rack routes: categories, sources, documents, crawl dispatch.

import type { MultipartFields } from "@fastify/multipart";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { BadRequestError } from "../../../../shared/errors.js";
import * as service from "../services/rack.service.js";
import { UuidParamSchema } from "../schemas/content.schema.js";
import {
  CrawlSourceSchema, CreateCategorySchema, CreateSourceSchema, DocumentQuerySchema,
  PatchCategorySchema, PatchSourceSchema, SourceQuerySchema, UploadSourceSchema,
} from "../schemas/rack.schema.js";

const adminId = (req: FastifyRequest) => Number(req.auth!.sub);

/** Multipart text fields arrive as { type: "field", value } — flatten for Zod. */
function textFields(fields: MultipartFields): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, field] of Object.entries(fields)) {
    const one = Array.isArray(field) ? field[0] : field;
    if (one?.type === "field" && typeof one.value === "string") out[key] = one.value;
  }
  return out;
}

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

  // Multipart: text fields must precede the file part so they are parsed by the
  // time req.file() resolves — the frontend FormData is built in that order.
  app.post("/sources/upload", async (req, reply) => {
    const file = await req.file();
    if (!file) throw new BadRequestError("No file uploaded");
    const buffer = await file.toBuffer();
    const input = UploadSourceSchema.parse(textFields(file.fields));
    return reply.status(201).send(
      await service.uploadSource(input, { name: file.filename, buffer }, adminId(req)),
    );
  });

  app.post("/sources/:id/verify", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.verifySource(id, adminId(req)));
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
