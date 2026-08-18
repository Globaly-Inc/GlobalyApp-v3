// Enquiries routes — creation + get-by-id (Phase 4). Any authenticated platform user
// (student) can create; only the owning student can read their own enquiry.
// Matching/distribution/list/close endpoints are later phases.

import type { FastifyInstance } from "fastify";
import * as service from "../services/enquiries.service.js";
import { CreateEnquirySchema, EnquiryIdParamSchema, ListEnquiriesQuerySchema } from "../schemas/enquiries.schema.js";
import { ForbiddenError } from "../../../shared/errors.js";

export async function enquiriesRoutes(app: FastifyInstance) {
  app.post("/enquiries", async (req, reply) => {
    const input = CreateEnquirySchema.parse(req.body);
    const enquiry = await service.createEnquiry(Number(req.auth.sub), input);
    return reply.status(201).send(enquiry);
  });

  app.get("/enquiries", async (req, reply) => {
    const { page, limit, status } = ListEnquiriesQuerySchema.parse(req.query);
    const result = await service.listEnquiriesForStudent(Number(req.auth.sub), { page, limit }, status);
    return reply.send(result);
  });

  app.get("/enquiries/:id", async (req, reply) => {
    const { id } = EnquiryIdParamSchema.parse(req.params);
    const enquiry = await service.getEnquiryById(id);
    // Owner-or-admin: student can only read their own; admins bypass (mirrors
    // files.routes.ts's inline entity_id-ownership check pattern).
    if (req.auth.type !== "admin" && enquiry.student_id !== Number(req.auth.sub)) {
      throw new ForbiddenError("Not your enquiry");
    }
    return reply.send(enquiry);
  });
}
