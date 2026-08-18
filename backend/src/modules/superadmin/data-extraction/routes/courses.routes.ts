// Extraction courses routes — maps V2 endpoints RC1-RC5, C15, E5-E7.

import type { FastifyInstance } from "fastify";
import * as service from "../services/courses.service.js";
import { UuidParamSchema, JobIdParamSchema } from "../schemas/jobs.schema.js";
import { CreateCourseSchema, PatchCourseSchema, CourseAccreditationLinkSchema, BulkVerifyCoursesSchema } from "../schemas/courses.schema.js";
import { z } from "zod";

const CourseAccredParamSchema = z.object({
  courseId: z.string().uuid(),
  accreditationId: z.string().uuid(),
});

export async function coursesRoutes(app: FastifyInstance) {
  const adminId = (req: any) => Number(req.auth.sub);

  // RC1: GET /jobs/:id/courses
  app.get("/jobs/:id/courses", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.listCourses(id));
  });

  // RC2: GET /jobs/:id/course-links
  app.get("/jobs/:id/course-links", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.getCourseLinks(id));
  });

  // C15: POST /jobs/:jobId/courses
  app.post("/jobs/:jobId/courses", async (req, reply) => {
    const { jobId } = JobIdParamSchema.parse(req.params);
    const input = CreateCourseSchema.parse(req.body);
    return reply.send(await service.createCourse(jobId, input, adminId(req)));
  });

  // RC3: PATCH /courses/:id
  app.patch("/courses/:id", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    const input = PatchCourseSchema.parse(req.body);
    return reply.send(await service.patchCourse(id, input, adminId(req)));
  });

  // Bulk approve/flag — replaces N single approve/reject calls from the review UI.
  app.post("/courses/bulk-verify", async (req, reply) => {
    const { ids, approve } = BulkVerifyCoursesSchema.parse(req.body);
    return reply.send(await service.bulkVerifyCourses(ids, approve, adminId(req)));
  });

  // RC4: POST /courses/:id/approve
  app.post("/courses/:id/approve", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.approveCourse(id, adminId(req)));
  });

  // RC5: POST /courses/:id/reject
  app.post("/courses/:id/reject", async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params);
    return reply.send(await service.rejectCourse(id, adminId(req)));
  });

  // E5: GET /courses/:courseId/accreditation-links
  app.get("/courses/:courseId/accreditation-links", async (req, reply) => {
    const { courseId } = z.object({ courseId: z.string().uuid() }).parse(req.params);
    return reply.send(await service.getAccreditationLinks(courseId));
  });

  // E6: POST /courses/:courseId/accreditation-links
  app.post("/courses/:courseId/accreditation-links", async (req, reply) => {
    const { courseId } = z.object({ courseId: z.string().uuid() }).parse(req.params);
    const body = CourseAccreditationLinkSchema.parse(req.body);
    return reply.status(201).send(
      await service.linkAccreditation(courseId, body.job_id, body.accreditation_id, adminId(req)),
    );
  });

  // E7: DELETE /courses/:courseId/accreditation-links/:accreditationId
  app.delete("/courses/:courseId/accreditation-links/:accreditationId", async (req, reply) => {
    const { courseId, accreditationId } = CourseAccredParamSchema.parse(req.params);
    return reply.send(await service.unlinkAccreditation(courseId, accreditationId, adminId(req)));
  });
}
