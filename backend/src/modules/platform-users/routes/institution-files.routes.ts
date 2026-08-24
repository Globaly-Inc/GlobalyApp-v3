// Institution logo/cover upload — the institution twin of businesses' POST /me/files.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as storage from "../../../shared/storage/storageService.js";
import * as filesRepo from "../../../shared/storage/files.repository.js";
import * as repo from "../repositories/platform-users.repository.js";
import { NotFoundError } from "../../../shared/errors.js";
import { requireInstitutionContext } from "../../../core/plugins/auth.plugin.js";

const CategoryQuery = z.object({ category: z.enum(["logo", "cover"]) });

export async function institutionFileRoutes(app: FastifyInstance) {
  app.post("/me/files", { preHandler: requireInstitutionContext }, async (req, reply) => {
    const orgId = req.auth.orgId!;
    const userId = Number(req.auth.sub);

    const { category } = CategoryQuery.parse(req.query);

    const file = await req.file();
    if (!file) throw new NotFoundError("No file uploaded");

    const buffer = await file.toBuffer();
    storage.validateFile(file.mimetype, buffer.length);

    const storagePath = storage.buildPath("public/institutions", orgId, category, file.filename);
    await storage.uploadFile(storagePath, buffer, file.mimetype);

    const record = await filesRepo.insertFile({
      uploaded_by: userId,
      entity_type: "institution",
      entity_id: orgId,
      category,
      original_name: file.filename,
      storage_path: storagePath,
      mime_type: file.mimetype,
      size_bytes: buffer.length,
    });

    await repo.updateInstitution(req.institutionId, { [category === "logo" ? "logo_url" : "cover_url"]: storagePath });

    return reply.status(201).send({
      id: record.id,
      original_name: record.original_name,
      storage_path: record.storage_path,
      mime_type: record.mime_type,
      size_bytes: record.size_bytes,
      category: record.category,
    });
  });
}
