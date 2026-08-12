// Catalog routes — degree levels, areas of study, fee types,
// accreditations, and issuing organizations.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildPaginatedResponse, paginationToOffset, PaginationSchema } from "../../../../../shared/pagination.js";
import {
  AccreditationInputSchema, FeeTypeInputSchema, IdParamSchema,
  IssuingOrgInputSchema, LookupInputSchema, ReviewInputSchema,
} from "../schemas/categories.schema.js";
import * as service from "../services/categories.service.js";

const IssuingOrgListQuery = PaginationSchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().min(1).optional(),
});

export async function catalogRoutes(app: FastifyInstance) {
  // ── Degree Levels & Areas of Study ──
  // Same columns and same behaviour, so both mount from one definition.
  for (const [path, table] of [
    ["degree-levels", "degree_levels"],
    ["areas-of-study", "areas_of_study"],
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
      const data = LookupInputSchema.parse(req.body);
      return reply.status(201).send(await service.createLookup(table, data));
    });

    app.patch(`/${path}/:id`, async (req, reply) => {
      const { id } = IdParamSchema.parse(req.params);
      const data = LookupInputSchema.partial().parse(req.body);
      const row = await service.updateLookup(table, id, data);
      return reply.send(row);
    });
  }

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
