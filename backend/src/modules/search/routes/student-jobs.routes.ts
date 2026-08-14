import type { FastifyInstance } from "fastify";
import { buildPaginatedResponse, paginationToOffset } from "../../../shared/pagination.js";
import * as repo from "../repositories/student-jobs.repository.js";
import { JobListQuery } from "../schemas/search.schema.js";

export async function studentJobsRoutes(app: FastifyInstance) {
  app.get("/students/jobs", async (req, reply) => {
    const { country, job_type, is_remote, search, ...pagination } = JobListQuery.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const filters = { country, jobType: job_type, isRemote: is_remote, search };
    const [rows, total] = await Promise.all([
      repo.listPublicJobs(filters, limit, offset),
      repo.countPublicJobs(filters),
    ]);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });
}
