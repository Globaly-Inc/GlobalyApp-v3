// Self-service twin of superadmin's service-media.routes.ts — same generic uploaded_files +
// GCS storage pattern, scoped by auth context (no :id URL param) instead of an admin-supplied id,
// and branched on org type the same way services.routes.ts is.

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireBusinessOrInstitutionContext } from "../../../core/plugins/auth.plugin.js";
import * as storage from "../../../shared/storage/storageService.js";
import * as filesRepo from "../../../shared/storage/files.repository.js";
import { NotFoundError } from "../../../shared/errors.js";
import * as service from "../../superadmin/platform/business-services/services/business-services.service.js";

const SubIdParam = z.object({ subId: z.string().uuid() });
const FileIdParam = z.object({ subId: z.string().uuid(), fileId: z.coerce.number().int().positive() });
const MAX_MEDIA_FILES = 10;

function orgScopedId(req: FastifyRequest): number {
  return Number(req.auth.orgType === "institution" ? req.institution!.id : req.business!.id);
}

export async function businessServiceMediaRoutes(app: FastifyInstance) {
  app.get("/services/:subId/media", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { subId } = SubIdParam.parse(req.params);
    const id = orgScopedId(req);
    if (req.auth.orgType === "institution") await service.requireInstitutionServiceForRead(id, subId);
    else await service.requireServiceForRead(id, subId);

    const files = await filesRepo.listFilesByEntity("service", subId, "media");
    const withUrls = await Promise.all(files.map(async (f) => ({
      id: f.id, original_name: f.original_name, mime_type: f.mime_type, size_bytes: f.size_bytes,
      url: await storage.getSignedViewUrl(f.storage_path),
    })));
    return reply.send({ files: withUrls });
  });

  app.post("/services/:subId/media", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { subId } = SubIdParam.parse(req.params);
    const id = orgScopedId(req);
    if (req.auth.orgType === "institution") await service.requireInstitutionServiceForUpload(id, subId);
    else await service.requireServiceForUpload(id, subId);

    const existing = await filesRepo.listFilesByEntity("service", subId, "media");
    if (existing.length >= MAX_MEDIA_FILES) throw new NotFoundError(`Media limit reached (max ${MAX_MEDIA_FILES} files)`);

    const file = await req.file();
    if (!file) throw new NotFoundError("No file uploaded");

    const buffer = await file.toBuffer();
    storage.validateFile(file.mimetype, buffer.length);

    const storagePath = storage.buildPath("public/services", subId, "media", file.filename);
    await storage.uploadFile(storagePath, buffer, file.mimetype);

    const record = await filesRepo.insertFile({
      uploaded_by: Number(req.auth.sub),
      entity_type: "service",
      entity_id: subId,
      category: "media",
      original_name: file.filename,
      storage_path: storagePath,
      mime_type: file.mimetype,
      size_bytes: buffer.length,
    });

    return reply.status(201).send({
      id: record.id, original_name: record.original_name, mime_type: record.mime_type,
      size_bytes: record.size_bytes, url: await storage.getSignedViewUrl(record.storage_path),
    });
  });

  app.delete("/services/:subId/media/:fileId", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { subId, fileId } = FileIdParam.parse(req.params);
    const id = orgScopedId(req);
    if (req.auth.orgType === "institution") await service.requireInstitutionServiceForRead(id, subId);
    else await service.requireServiceForRead(id, subId);

    const file = await filesRepo.findFileById(fileId);
    if (!file || file.entity_type !== "service" || file.entity_id !== subId) throw new NotFoundError("File not found");

    await storage.deleteFile(file.storage_path).catch(() => {});
    await filesRepo.deleteFileRecord(fileId);

    return reply.status(204).send();
  });
}
