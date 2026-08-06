// Agent file routes — profile photo upload/download/preview/delete.
// Files are stored under <db_name>/agents/<agent_uuid>/<category>/

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { masterKnex } from "../../../core/db/master-pool.js";
import * as storage from "../../../shared/storage/storageService.js";
import * as filesRepo from "../../../shared/storage/files.repository.js";
import { NotFoundError, ForbiddenError } from "../../../shared/errors.js";
import type { BusinessRecord } from "../../../core/types.js";

const FileIdParam = z.object({ id: z.string().uuid() });
const CategoryQuery = z.object({ category: z.string().optional() });

export async function agentFileRoutes(app: FastifyInstance) {

  // ── Upload file ──
  // POST /me/files?category=profile|document
  app.post("/me/files", async (req, reply) => {
    const agentId = Number(req.auth.sub);
    const orgId = req.auth.orgId!;

    const business = await masterKnex<BusinessRecord>("businesses").where({ id: orgId }).first();
    if (!business) throw new NotFoundError("Business not found");

    const agent = await req.db("agents").where({ id: agentId }).first();
    if (!agent) throw new NotFoundError("Agent not found");

    const { category } = CategoryQuery.parse(req.query);
    const fileCategory = category || "profile";

    const file = await req.file();
    if (!file) throw new NotFoundError("No file uploaded");

    const buffer = await file.toBuffer();
    storage.validateFile(file.mimetype, buffer.length);

    // Path: <db_name>/agents/<agent_uuid>/profile/<timestamp>-<rand>.<ext>
    const agentUuid = agent.uuid ?? agent.id.toString();
    const storagePath = storage.buildPath(business.db_name, "agents", agentUuid, fileCategory, file.filename);
    await storage.uploadFile(storagePath, buffer, file.mimetype);

    const record = await filesRepo.insertFile({
      uploaded_by: agentId,
      entity_type: "agent",
      entity_id: agentUuid,
      category: fileCategory,
      original_name: file.filename,
      storage_path: storagePath,
      mime_type: file.mimetype,
      size_bytes: buffer.length,
    });

    if (fileCategory === "profile") {
      await req.db("agents").where({ id: agentId }).update({ photo_url: storagePath });
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
  app.get("/me/files", async (req, reply) => {
    const agent = await req.db("agents").where({ id: Number(req.auth.sub) }).first();
    if (!agent) throw new NotFoundError("Agent not found");

    const { category } = CategoryQuery.parse(req.query);
    const agentUuid = agent.uuid ?? agent.id.toString();
    const files = await filesRepo.listFilesByEntity("agent", agentUuid, category);
    return reply.send({ files });
  });

  // ── View (preview) ──
  app.get("/me/files/:id/view", async (req, reply) => {
    const file = await getOwnFile(req);
    const url = await storage.getSignedViewUrl(file.storage_path);
    return reply.send({ url });
  });

  // ── Download ──
  app.get("/me/files/:id/download", async (req, reply) => {
    const file = await getOwnFile(req);
    const url = await storage.getSignedDownloadUrl(file.storage_path, file.original_name);
    return reply.send({ url });
  });

  // ── Delete ──
  app.delete("/me/files/:id", async (req, reply) => {
    const file = await getOwnFile(req);

    await storage.deleteFile(file.storage_path);
    await filesRepo.deleteFileRecord(file.id);

    if (file.category === "profile") {
      await req.db("agents").where({ id: Number(req.auth.sub) }).update({ photo_url: null });
    }

    return reply.status(204).send();
  });
}

async function getOwnFile(req: any) {
  const { id } = FileIdParam.parse(req.params);
  const file = await filesRepo.findFileById(id);
  if (!file) throw new NotFoundError("File not found");

  const agent = await req.db("agents").where({ id: Number(req.auth.sub) }).first();
  const agentUuid = agent?.uuid ?? agent?.id?.toString();
  if (file.entity_id !== agentUuid) throw new ForbiddenError("Not your file");

  return file;
}
