// Guides admin routes — CRUD + multipart uploads. Upload flow copied from
// countries.routes.ts: a "data" JSON part plus named file parts in one multipart request.

import type { FastifyInstance, FastifyRequest } from "fastify";
import { NotFoundError } from "../../../../../shared/errors.js";
import { buildPaginatedResponse, paginationToOffset } from "../../../../../shared/pagination.js";
import * as storage from "../../../../../shared/storage/storageService.js";
import { config } from "../../../../../config.js";
import * as repo from "../../../platform/platform.repository.js";
import { GuideInputSchema, GuideListQuery, IdParamSchema } from "../schemas/guides.schema.js";
import * as service from "../services/guides.service.js";

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const PDF_MIME_TYPES = new Set(["application/pdf"]);

interface FilePart {
  buffer: Buffer;
  mimetype: string;
  filename: string;
}

function allowedTypesFor(fieldname: string): Set<string> {
  if (fieldname === "background_video") return VIDEO_MIME_TYPES;
  if (fieldname === "pdf") return PDF_MIME_TYPES;
  return IMAGE_MIME_TYPES;
}

async function readGuideMultipart(req: FastifyRequest): Promise<{ data: Record<string, unknown>; files: Record<string, FilePart> }> {
  const files: Record<string, FilePart> = {};
  let data: Record<string, unknown> = {};
  for await (const part of req.parts()) {
    if (part.type === "file") {
      const buffer = await part.toBuffer();
      storage.validateFile(part.mimetype, buffer.length, allowedTypesFor(part.fieldname));
      files[part.fieldname] = { buffer, mimetype: part.mimetype, filename: part.filename };
    } else if (part.fieldname === "data") {
      data = JSON.parse(part.value as string);
    }
  }
  return { data, files };
}

async function uploadPublicAsset(file: FilePart, prefix: string): Promise<string> {
  const storagePath = storage.buildPath("guides", prefix, file.filename);
  await storage.uploadFile(storagePath, file.buffer, file.mimetype);
  return `https://storage.googleapis.com/${config.GCS_BUCKET_NAME}/${storagePath}`;
}

/** The PDF is never public — store only the relative path, no bucket URL (see storageService). */
async function uploadPrivateAsset(file: FilePart, prefix: string): Promise<string> {
  const storagePath = storage.buildPath("guides", prefix, file.filename);
  await storage.uploadFile(storagePath, file.buffer, file.mimetype);
  return storagePath;
}

async function resolveGuideUploads(data: Record<string, unknown>, files: Record<string, FilePart>) {
  if (files.background_image) {
    data.background_image_url = await uploadPublicAsset(files.background_image, "backgrounds");
    data.background_video_url = null;
  }
  if (files.background_video) {
    data.background_video_url = await uploadPublicAsset(files.background_video, "backgrounds");
    data.background_image_url = null;
  }
  if (files.pdf_cover_image) data.pdf_cover_image_url = await uploadPublicAsset(files.pdf_cover_image, "covers");
  if (files.pdf) data.pdf_url = await uploadPrivateAsset(files.pdf, "pdfs");
  return data;
}

function withLeadCount(row: Record<string, unknown>) {
  return { ...row, lead_count: Number(row.lead_count) };
}

export async function guidesRoutes(app: FastifyInstance) {
  app.get("/", async (req, reply) => {
    const { search, is_published, ...pagination } = GuideListQuery.parse(req.query);
    const filters = { search, is_published };
    const { limit, offset } = paginationToOffset(pagination);
    const [rows, total] = await Promise.all([
      service.listGuides(limit, offset, filters),
      service.countGuides(filters),
    ]);
    return reply.send(buildPaginatedResponse(rows.map(withLeadCount), total, pagination));
  });

  app.get("/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const guide = await service.findGuideById(id);
    if (!guide) throw new NotFoundError("Guide not found");
    return reply.send(guide);
  });

  app.post("/", async (req, reply) => {
    const { data: raw, files } = await readGuideMultipart(req);
    const data = GuideInputSchema.parse(await resolveGuideUploads(raw, files));
    const guide = await service.createGuide(data);
    await repo.logAdminAction(Number(req.auth.sub), "GUIDE_CREATED", "guide", undefined, { guide_id: guide.id, title: guide.title });
    return reply.status(201).send(guide);
  });

  app.patch("/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const { data: raw, files } = await readGuideMultipart(req);
    const data = GuideInputSchema.partial().parse(await resolveGuideUploads(raw, files));
    const guide = await service.updateGuide(id, data);
    await repo.logAdminAction(Number(req.auth.sub), "GUIDE_UPDATED", "guide", undefined, { guide_id: id, fields: Object.keys(data) });
    return reply.send(guide);
  });

  app.delete("/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    await service.deleteGuide(id);
    await repo.logAdminAction(Number(req.auth.sub), "GUIDE_DELETED", "guide", undefined, { guide_id: id });
    return reply.status(204).send();
  });
}
