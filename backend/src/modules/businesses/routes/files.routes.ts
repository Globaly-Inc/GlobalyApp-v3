// Business file routes — upload logo, cover, gallery, documents; download/preview/delete.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as storage from "../../../shared/storage/storageService.js";
import * as filesRepo from "../../../shared/storage/files.repository.js";
import * as bizRepo from "../repositories/businesses.repository.js";
import { NotFoundError } from "../../../shared/errors.js";

const FileIdParam = z.object({ id: z.string().uuid() });
const CategoryQuery = z.object({ category: z.string().optional() });

export async function businessFileRoutes(app: FastifyInstance) {

  // ── Upload file ──
  // POST /me/files?category=logo|cover|gallery|document
  app.post("/me/files", async (req, reply) => {
    const orgId = req.auth.orgId!;
    const userId = Number(req.auth.sub);

    const { category } = CategoryQuery.parse(req.query);
    const fileCategory = category || "document";

    const file = await req.file();
    if (!file) throw new NotFoundError("No file uploaded");

    const buffer = await file.toBuffer();
    storage.validateFile(file.mimetype, buffer.length);

    const storagePath = storage.buildPath("businesses", orgId, fileCategory, file.filename);
    await storage.uploadFile(storagePath, buffer, file.mimetype);

    const record = await filesRepo.insertFile({
      uploaded_by: userId,
      entity_type: "business",
      entity_id: orgId,
      category: fileCategory,
      original_name: file.filename,
      storage_path: storagePath,
      mime_type: file.mimetype,
      size_bytes: buffer.length,
    });

    // Update the corresponding URL column on the businesses table
    if (fileCategory === "logo" || fileCategory === "cover") {
      const col = fileCategory === "logo" ? "logo_url" : "cover_url";
      await bizRepo.updateBusinessProfile(orgId, { [col]: storagePath });
    }

    return reply.status(201).send({
      id: record.id,
      original_name: record.original_name,
      storage_path: record.storage_path,
      mime_type: record.mime_type,
      size_bytes: record.size_bytes,
      category: record.category,
    });
  });

  // ── List files ──
  app.get("/me/files", async (req, reply) => {
    const { category } = CategoryQuery.parse(req.query);
    const files = await filesRepo.listFilesByEntity("business", req.auth.orgId!, category);
    return reply.send({ files });
  });

  // ── View (preview) ──
  app.get("/me/files/:id/view", async (req, reply) => {
    const { id } = FileIdParam.parse(req.params);
    const file = await filesRepo.findFileById(id);
    if (!file || file.entity_id !== req.auth.orgId!) throw new NotFoundError("File not found");

    const url = await storage.getSignedViewUrl(file.storage_path);
    return reply.send({ url });
  });

  // ── Download ──
  app.get("/me/files/:id/download", async (req, reply) => {
    const { id } = FileIdParam.parse(req.params);
    const file = await filesRepo.findFileById(id);
    if (!file || file.entity_id !== req.auth.orgId!) throw new NotFoundError("File not found");

    const url = await storage.getSignedDownloadUrl(file.storage_path, file.original_name);
    return reply.send({ url });
  });

  // ── Delete ──
  app.delete("/me/files/:id", async (req, reply) => {
    const { id } = FileIdParam.parse(req.params);
    const file = await filesRepo.findFileById(id);
    if (!file || file.entity_id !== req.auth.orgId!) throw new NotFoundError("File not found");

    await storage.deleteFile(file.storage_path);
    await filesRepo.deleteFileRecord(id);

    if (file.category === "logo") await bizRepo.updateBusinessProfile(req.auth.orgId!, { logo_url: null });
    if (file.category === "cover") await bizRepo.updateBusinessProfile(req.auth.orgId!, { cover_url: null });

    return reply.status(204).send();
  });
}
