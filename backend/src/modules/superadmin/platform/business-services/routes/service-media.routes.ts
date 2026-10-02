// Service media routes — upload/list/delete images, videos & PDFs for a business/institution
// service, reused from the generic uploaded_files table + GCS storage service (same pattern as
// businessFileRoutes).

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as storage from "../../../../../shared/storage/storageService.js";
import * as filesRepo from "../../../../../shared/storage/files.repository.js";
import { NotFoundError } from "../../../../../shared/errors.js";
import * as platformRepo from "../../platform.repository.js";
import * as service from "../services/business-services.service.js";

const IdParam = z.object({ id: z.coerce.number().int().positive(), subId: z.string().uuid() });
const FileIdParam = z.object({ id: z.coerce.number().int().positive(), subId: z.string().uuid(), fileId: z.coerce.number().int().positive() });
const MAX_MEDIA_FILES = 10;

export async function serviceMediaRoutes(app: FastifyInstance) {
  for (const kind of ["business", "institution"] as const) {
    const base = kind === "business" ? "/businesses/:id/services/:subId/media" : "/institutions/:id/services/:subId/media";
    // requireRead confirms subId belongs to org id without provisioning a schema or materializing
    // a pre-seeded stand-in (GET/DELETE must stay side-effect-free); only the actual write below
    // uses requireUpload, which does the same ownership check but may materialize.
    const requireRead = kind === "business" ? service.requireServiceForRead : service.requireInstitutionServiceForRead;
    const requireUpload = kind === "business" ? service.requireServiceForUpload : service.requireInstitutionServiceForUpload;

    app.get(base, async (req, reply) => {
      const { id, subId } = IdParam.parse(req.params);
      await requireRead(id, subId);
      const files = await filesRepo.listFilesByEntity("service", subId, "media");
      const withUrls = await Promise.all(files.map(async (f) => ({
        id: f.id, original_name: f.original_name, mime_type: f.mime_type, size_bytes: f.size_bytes,
        url: await storage.getSignedViewUrl(f.storage_path),
      })));
      return reply.send({ files: withUrls });
    });

    app.post(base, async (req, reply) => {
      const { id, subId } = IdParam.parse(req.params);
      await requireUpload(id, subId);

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

      await platformRepo.logAdminAction(Number(req.auth.sub), "SERVICE_MEDIA_UPLOADED", kind, undefined, { [`${kind}_id`]: id });

      return reply.status(201).send({
        id: record.id, original_name: record.original_name, mime_type: record.mime_type,
        size_bytes: record.size_bytes, url: await storage.getSignedViewUrl(record.storage_path),
      });
    });

    app.delete(`${base}/:fileId`, async (req, reply) => {
      const { id, subId, fileId } = FileIdParam.parse(req.params);
      await requireRead(id, subId);

      const file = await filesRepo.findFileById(fileId);
      if (!file || file.entity_type !== "service" || file.entity_id !== subId) throw new NotFoundError("File not found");

      await storage.deleteFile(file.storage_path).catch(() => {});
      await filesRepo.deleteFileRecord(fileId);

      return reply.status(204).send();
    });
  }
}
