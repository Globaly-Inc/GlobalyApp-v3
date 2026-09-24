// Institution logo/cover upload — the institution twin of businesses' POST /me/files.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as storage from "../../../shared/storage/storageService.js";
import * as filesRepo from "../../../shared/storage/files.repository.js";
import * as repo from "../repositories/platform-users.repository.js";
import { ForbiddenError, NotFoundError } from "../../../shared/errors.js";
import { requireInstitutionContext } from "../../../core/plugins/auth.plugin.js";

const CategoryQuery = z.object({ category: z.enum(["logo", "cover", "gallery"]) });

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

    if (category === "logo" || category === "cover") {
      await repo.updateInstitution(req.institutionId, { [category === "logo" ? "logo_url" : "cover_url"]: storagePath });
    } else {
      const col = file.mimetype.startsWith("video/") ? "video_urls" : "gallery_images";
      await repo.appendInstitutionMedia(req.institutionId, col, storagePath);
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

  // ── Delete a gallery/video item by its resolved URL (frontend only has the signed URL, not the file id) ──
  const DeleteMediaBody = z.object({ url: z.string(), type: z.enum(["gallery", "video"]) });
  app.delete("/me/media", { preHandler: requireInstitutionContext }, async (req, reply) => {
    const { url, type } = DeleteMediaBody.parse(req.body);
    const storagePath = storage.toStoragePath(url);
    const col = type === "video" ? "video_urls" : "gallery_images";

    // The client only has the resolved (signed) URL, not a file id scoped to this org — without this
    // check, any authenticated institution could pass another org's gallery URL and delete their object.
    const ownPrefix = `public/institutions/${req.auth.orgId!}/gallery/`;
    if (!storagePath.startsWith(ownPrefix)) throw new ForbiddenError("Not your media");

    await storage.deleteFile(storagePath).catch(() => {});
    await repo.removeInstitutionMedia(req.institutionId, col, storagePath);

    return reply.status(204).send();
  });
}
