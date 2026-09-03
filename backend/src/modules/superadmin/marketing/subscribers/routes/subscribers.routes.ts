import type { FastifyInstance } from "fastify";
import { ForbiddenError } from "../../../../../shared/errors.js";
import { buildPaginatedResponse, paginationToOffset } from "../../../../../shared/pagination.js";
import { SubscriberListQuery } from "../schemas/subscribers.schema.js";
import * as service from "../services/subscribers.service.js";
import * as repo from "../repositories/subscribers.repository.js";

function requireSuperAdmin(role?: string) {
  if (role !== "super_admin") throw new ForbiddenError("Only super_admin can manage subscribers");
}

export async function subscriberRoutes(app: FastifyInstance) {
  app.get("/", async (req, reply) => {
    requireSuperAdmin(req.auth.role);
    const { search, type, ...pagination } = SubscriberListQuery.parse(req.query);
    const filters = { search, type };
    const { limit, offset } = paginationToOffset(pagination);

    const [rows, total] = await Promise.all([
      service.listSubscribers(limit, offset, filters),
      service.countSubscribers(filters),
    ]);

    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  // CSV export endpoint
  app.get("/export.csv", async (req, reply) => {
    requireSuperAdmin(req.auth.role);
    const { search, type } = SubscriberListQuery.parse(req.query);
    const filters = { search, type };

    // Fetch all records without pagination for CSV
    const rows = await service.listSubscribers(10000, 0, filters);

    // Build CSV
    const csvLines = [repo.buildCsvHeader()];
    rows.forEach((row: any) => {
      csvLines.push(repo.buildCsvRow(row));
    });
    const csv = csvLines.join("\n");

    reply.header("content-type", "text/csv");
    reply.header("content-disposition", `attachment; filename="subscribers-${Date.now()}.csv"`);
    return reply.send(csv);
  });
}
