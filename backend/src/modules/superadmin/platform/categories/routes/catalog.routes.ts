// Catalog routes — degree levels, areas of study, tests, fee types,
// accreditations, and issuing organizations.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../../../../../config.js";
import { BadRequestError } from "../../../../../shared/errors.js";
import { buildPaginatedResponse, paginationToOffset, PaginationSchema } from "../../../../../shared/pagination.js";
import * as storage from "../../../../../shared/storage/storageService.js";
import {
  AccreditationInputSchema, FeeTypeInputSchema, IdParamSchema,
  IssuingOrgInputSchema, LookupInputSchema, ReviewInputSchema, TestInputSchema,
} from "../schemas/categories.schema.js";
import * as service from "../services/categories.service.js";

const IssuingOrgListQuery = PaginationSchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().min(1).optional(),
});

const TEST_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"]);

export async function catalogRoutes(app: FastifyInstance) {
  // ── Degree Levels, Areas of Study & Tests ──
  // One list/create/update shape over three lookup tables. Tests carry two extra columns
  // (category, image_url); nothing else about the CRUD differs, so they ride the same definition.
  for (const { path, table, create, patch } of [
    { path: "degree-levels", table: "degree_levels", create: LookupInputSchema, patch: LookupInputSchema.partial() },
    { path: "areas-of-study", table: "areas_of_study", create: LookupInputSchema, patch: LookupInputSchema.partial() },
    { path: "tests", table: "tests", create: TestInputSchema, patch: TestInputSchema.partial() },
  ] as const) {
    app.get(`/${path}`, async (req, reply) => {
      const pagination = PaginationSchema.parse(req.query);
      const { limit, offset } = paginationToOffset(pagination);
      const [rows, total] = await Promise.all([
        service.listLookup(table, limit, offset),
        service.countLookup(table),
      ]);
      return reply.send(buildPaginatedResponse(rows, total, pagination));
    });

    app.post(`/${path}`, async (req, reply) => {
      const data = create.parse(req.body);
      return reply.status(201).send(await service.createLookup(table, data));
    });

    app.patch(`/${path}/:id`, async (req, reply) => {
      const { id } = IdParamSchema.parse(req.params);
      const data = patch.parse(req.body);
      const row = await service.updateLookup(table, id, data);
      return reply.send(row);
    });
  }

  /**
   * Test logo upload. The row itself is saved as JSON like every other lookup, so the dialog
   * uploads the picked file here first and stores the returned URL — rather than turning the
   * whole tests CRUD into multipart for one optional field.
   *
   * Written under `public/` because these logos are read by unauthenticated course pages.
   */
  app.post("/tests/image", async (req, reply) => {
    const file = await req.file();
    if (!file) throw new BadRequestError("No file uploaded");

    const buffer = await file.toBuffer();
    storage.validateFile(file.mimetype, buffer.length, TEST_IMAGE_MIME_TYPES);

    const storagePath = storage.buildPath("public/tests", file.filename);
    await storage.uploadFile(storagePath, buffer, file.mimetype);

    return reply.send({ image_url: `https://storage.googleapis.com/${config.GCS_BUCKET_NAME}/${storagePath}` });
  });

  // ── Fee Types ──

  app.get("/fee-types", async (req, reply) => {
    const pagination = PaginationSchema.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const [rows, total] = await Promise.all([
      service.listFeeTypes(limit, offset),
      service.countFeeTypes(),
    ]);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  app.post("/fee-types", async (req, reply) => {
    const data = FeeTypeInputSchema.parse(req.body);
    const row = await service.createFeeType(data);
    return reply.status(201).send(row);
  });

  app.patch("/fee-types/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const data = FeeTypeInputSchema.partial().parse(req.body);
    const row = await service.updateFeeType(id, data);
    return reply.send(row);
  });

  app.post("/fee-types/:id/review", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const { decision } = ReviewInputSchema.parse(req.body);
    const row = await service.reviewFeeType(id, decision, Number(req.auth.sub));
    return reply.send(row);
  });

  app.delete("/fee-types/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    await service.deleteFeeType(id);
    return reply.status(204).send();
  });

  // ── Issuing Organizations ──

  app.get("/issuing-organizations", async (req, reply) => {
    const { search, ...pagination } = IssuingOrgListQuery.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const [rows, total] = await Promise.all([
      service.listIssuingOrganizations(limit, offset, search),
      service.countIssuingOrganizations(search),
    ]);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  app.post("/issuing-organizations", async (req, reply) => {
    const data = IssuingOrgInputSchema.parse(req.body);
    return reply.status(201).send(await service.createIssuingOrganization(data));
  });

  app.patch("/issuing-organizations/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const data = IssuingOrgInputSchema.partial().parse(req.body);
    const row = await service.updateIssuingOrganization(id, data);
    return reply.send(row);
  });

  // ── Accreditations ──

  app.get("/accreditations", async (req, reply) => {
    const pagination = PaginationSchema.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const [rows, total] = await Promise.all([
      service.listAccreditations(limit, offset),
      service.countAccreditations(),
    ]);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  app.post("/accreditations", async (req, reply) => {
    const data = AccreditationInputSchema.parse(req.body);
    const row = await service.createAccreditation(data);
    return reply.status(201).send(row);
  });

  app.patch("/accreditations/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const data = AccreditationInputSchema.partial().parse(req.body);
    const row = await service.updateAccreditation(id, data);
    return reply.send(row);
  });

  app.post("/accreditations/:id/review", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const { decision } = ReviewInputSchema.parse(req.body);
    const row = await service.reviewAccreditation(id, decision, Number(req.auth.sub));
    return reply.send(row);
  });

  app.delete("/accreditations/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    await service.deleteAccreditation(id);
    return reply.status(204).send();
  });
}
