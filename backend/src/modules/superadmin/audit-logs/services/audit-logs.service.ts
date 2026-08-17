// Audit-log service — pagination envelope + not-found mapping.

import { NotFoundError } from "../../../../shared/errors.js";
import { buildPaginatedResponse, paginationToOffset } from "../../../../shared/pagination.js";
import * as repo from "../repositories/audit-logs.repository.js";
import type { AuditLogQuery } from "../schemas/audit-logs.schema.js";

export async function listAuditLogs(query: AuditLogQuery) {
  const { page, limit, ...filters } = query;
  const offset = paginationToOffset({ page, limit }).offset;

  const [rows, total] = await Promise.all([
    repo.listAuditLogs(filters, limit, offset),
    repo.countAuditLogs(filters),
  ]);

  return buildPaginatedResponse(rows, total, { page, limit });
}

export async function getAuditLog(id: string) {
  const row = await repo.findAuditLogById(id);
  if (!row) throw new NotFoundError("Audit log not found");
  return row;
}
