// Platform user file routes — upload profile photo, documents; download/preview/delete.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as storage from "../../../shared/storage/storageService.js";
import * as filesRepo from "../../../shared/storage/files.repository.js";
import * as userRepo from "../repositories/platform-users.repository.js";
import { NotFoundError, ForbiddenError } from "../../../shared/errors.js";

const FileIdParam = z.object({ id: z.string().uuid() });
const CategoryQuery = z.object({ category: z.string().optional() });

export async function platformUserFileRoutes(app: FastifyInstance) {

  // ── Upload file (multipart) ──
  // POST /me/files?category=profile|document
  app.post("/me/files", async (req, reply) => {
    const userId = Number(req.auth.sub);
    const user = await userRepo.findById(userId);
    if (!user) throw new NotFoundError("User not found");

    const { category } = CategoryQuery.parse(req.query);
    const fileCategory = category || "document";

    const file = await req.file();
    if (!file) throw new NotFoundError("No file uploaded");

    const buffer = await file.toBuffer();
    storage.validateFile(file.mimetype, buffer.length);

    const storagePath = storage.buildPath("platform-users", user.uuid, fileCategory, file.filename);
    await storage.uploadFile(storagePath, buffer, file.mimetype);

    const record = await filesRepo.insertFile({
      uploaded_by: userId,
      entity_type: "platform_user",
      entity_id: user.uuid,
      category: fileCategory,
      original_name: file.filename,
      storage_path: storagePath,
      mime_type: file.mimetype,
      size_bytes: buffer.length,
    });

    // If profile photo, update photo_url on platform_users
    if (fileCategory === "profile") {
      await userRepo.updateUser(userId, { photo_url: storagePath });
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

  // ── List my files ──
  // GET /me/files?category=profile|document
  app.get("/me/files", async (req, reply) => {
    const userId = Number(req.auth.sub);
    const user = await userRepo.findById(userId);
    if (!user) throw new NotFoundError("User not found");

    const { category } = CategoryQuery.parse(req.query);
    const files = await filesRepo.listFilesByEntity("platform_user", user.uuid, category);

    return reply.send({ files });
  });

  // ── Get signed view URL (preview) ──
  // GET /me/files/:id/view
  app.get("/me/files/:id/view", async (req, reply) => {
    const { id } = FileIdParam.parse(req.params);
    const file = await filesRepo.findFileById(id);
    if (!file) throw new NotFoundError("File not found");

    const user = await userRepo.findById(Number(req.auth.sub));
    if (file.entity_id !== user?.uuid) throw new ForbiddenError("Not your file");

    const url = await storage.getSignedViewUrl(file.storage_path);
    return reply.send({ url });
  });

  // ── Get signed download URL ──
  // GET /me/files/:id/download
  app.get("/me/files/:id/download", async (req, reply) => {
    const { id } = FileIdParam.parse(req.params);
    const file = await filesRepo.findFileById(id);
    if (!file) throw new NotFoundError("File not found");

    const user = await userRepo.findById(Number(req.auth.sub));
    if (file.entity_id !== user?.uuid) throw new ForbiddenError("Not your file");

    const url = await storage.getSignedDownloadUrl(file.storage_path, file.original_name);
    return reply.send({ url });
  });

  // ── Delete file ──
  // DELETE /me/files/:id
  app.delete("/me/files/:id", async (req, reply) => {
    const { id } = FileIdParam.parse(req.params);
    const file = await filesRepo.findFileById(id);
    if (!file) throw new NotFoundError("File not found");

    const user = await userRepo.findById(Number(req.auth.sub));
    if (file.entity_id !== user?.uuid) throw new ForbiddenError("Not your file");

    await storage.deleteFile(file.storage_path);
    await filesRepo.deleteFileRecord(id);

    // Clear photo_url if deleting profile photo
    if (file.category === "profile") {
      await userRepo.updateUser(Number(req.auth.sub), { photo_url: null });
    }

    return reply.status(204).send();
  });
}
