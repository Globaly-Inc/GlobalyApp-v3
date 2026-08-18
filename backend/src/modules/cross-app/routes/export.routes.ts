// Outbound GlobalyAI feed (§3.4: V1's export-courses, "Bearer-authed RAG feed").

import type { FastifyInstance } from "fastify";

import * as repo from "../repositories/export.repository.js";
import { ExportQuerySchema } from "../schemas/ingest.schema.js";
import { assertExportAuthorized } from "../shared/sync-auth.js";

export async function exportRoutes(app: FastifyInstance) {
  /**
   * GET /export/courses — paginated live-catalogue feed.
   *
   * `?since=<ISO>` for incremental sync, `?page`/`?limit` (10..500, default 200).
   *
   * COURSES are the paged entity and institutions are derived from the page. V1
   * paged INSTITUTIONS and then pulled their courses with a bare `.limit(2000)`,
   * so any institution set whose courses exceeded 2000 rows was silently truncated
   * while `next_page` still said null — the consumer had no way to know it had an
   * incomplete catalogue. §1.6: legacy bugs are not the spec.
   */
  app.get(
    "/export/courses",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      assertExportAuthorized(req.headers as Record<string, unknown>);

      const { since, page, limit } = ExportQuerySchema.parse(req.query ?? {});
      const offset = (page - 1) * limit;

      const courses = await repo.listCourses({ since, limit, offset });
      const institutions = await repo.listOrgsForCourses(courses);
      const totalCourses = await repo.countCourses(since);

      return reply.send({
        institutions,
        courses,
        total_courses: totalCourses,
        total_institutions: institutions.length,
        page,
        limit,
        next_page: offset + courses.length < totalCourses ? page + 1 : null,
        since: since ?? null,
        exported_at: new Date().toISOString(),
      });
    },
  );
}
