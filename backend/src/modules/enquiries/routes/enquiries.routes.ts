// Student-facing enquiry routes. Parent registers under /api/v3/enquiries inside
// the authenticated scope, so req.auth is always present.
//
// The student is always req.auth.sub — no route here reads an owner id from the
// body or the path.

import type { FastifyInstance } from "fastify";
import {
  CreateEnquirySchema,
  IdParamSchema,
  ListMyEnquiriesQuerySchema,
} from "../schemas/enquiries.schema.js";
import * as service from "../services/enquiries.service.js";

export async function enquiriesRoutes(app: FastifyInstance) {
  app.post("/", async (req, reply) => {
    const input = CreateEnquirySchema.parse(req.body);
    const result = await service.createEnquiry(Number(req.auth.sub), input);
    return reply.status(201).send(result);
  });

  app.get("/", async (req, reply) => {
    const query = ListMyEnquiriesQuerySchema.parse(req.query ?? {});
    return reply.send(await service.listMyEnquiries(Number(req.auth.sub), query));
  });

  app.get("/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await service.getMyEnquiry(Number(req.auth.sub), id));
  });
}
