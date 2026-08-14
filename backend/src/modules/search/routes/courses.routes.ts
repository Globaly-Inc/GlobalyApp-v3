import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { NotFoundError } from "../../../shared/errors.js";
import { buildPaginatedResponse, paginationToOffset } from "../../../shared/pagination.js";
import * as repo from "../repositories/courses.repository.js";
import { CourseListQuery } from "../schemas/search.schema.js";

const SlugParam = z.object({ slug: z.string().min(1) });

export async function searchCoursesRoutes(app: FastifyInstance) {
  app.get("/search/courses/filters", async (_req, reply) => {
    const options = await repo.listCourseFilterOptions();
    return reply.send(options);
  });

  app.get("/search/courses/:slug", async (req, reply) => {
    const { slug } = SlugParam.parse(req.params);
    const course = await repo.findPublicCourseBySlug(slug);
    if (!course) throw new NotFoundError("Course not found");
    return reply.send(course);
  });

  app.get("/search/courses", async (req, reply) => {
    const {
      country, degree_level, subject_area, search, fee_min, fee_max, currency, intake_year, sort, ...pagination
    } = CourseListQuery.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const filters = {
      country, degreeLevel: degree_level, subjectArea: subject_area, search,
      feeMin: fee_min, feeMax: fee_max, currency, intakeYear: intake_year,
    };
    const [rows, total] = await Promise.all([
      repo.listPublicCourses(filters, sort, limit, offset),
      repo.countPublicCourses(filters),
    ]);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });
}
