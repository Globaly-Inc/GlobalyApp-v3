// Cross-business oversight. Deliberately has no business-id scoping: the caller is
// an admin (requireAdmin, checked in the route), and the whole point of this
// surface is the view a tenant-scoped query cannot produce.

import { buildPaginatedResponse, paginationToOffset } from "../../../shared/pagination.js";
import * as appRepo from "../repositories/applications.repository.js";
import * as jobRepo from "../repositories/jobs.repository.js";
import { toJob } from "./jobs.service.js";
import type { AdminJobsQueryInput } from "../schemas/jobs.schema.js";

export async function list(query: AdminJobsQueryInput) {
  const { limit, offset } = paginationToOffset(query);
  const filters = {
    business_id: query.business_id,
    status: query.status,
    job_type: query.job_type,
    category: query.category,
    q: query.q,
  };
  const [rows, total] = await Promise.all([
    jobRepo.list(filters, limit, offset),
    jobRepo.count(filters),
  ]);
  return buildPaginatedResponse(rows.map(toJob), total, query);
}

export async function stats() {
  const [byStatus, applications] = await Promise.all([
    jobRepo.statusCounts(),
    appRepo.adminStats(),
  ]);
  const at = (status: string) => byStatus[status] ?? 0;
  return {
    jobs: {
      total: Object.values(byStatus).reduce((sum, n) => sum + n, 0),
      draft: at("draft"),
      open: at("open"),
      closed: at("closed"),
      expired: at("expired"),
    },
    applications,
  };
}
