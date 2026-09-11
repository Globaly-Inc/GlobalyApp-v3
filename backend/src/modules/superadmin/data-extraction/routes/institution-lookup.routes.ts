// "Find Missing Details" — targeted lookup for empty extraction_institution_overview
// fields only (e.g. "what is Harvard's official phone number"). Read-only: the admin
// applies any result via the existing save-and-learn endpoint, same as any manual edit.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as service from "../services/institution-lookup.service.js";
import * as campusService from "../services/campus-lookup.service.js";

const JobIdParamSchema = z.object({ id: z.string().uuid() });
const CampusIdParamSchema = z.object({ id: z.string().uuid() });

export async function institutionLookupRoutes(app: FastifyInstance) {
  app.post("/jobs/:id/find-missing-institution-details", async (req, reply) => {
    const { id } = JobIdParamSchema.parse(req.params);
    return reply.send(await service.findMissingOverviewFields(id));
  });

  // Geocodes the campus's existing address to backfill postcode/map link only —
  // companion to the institution lookup above, not text-extraction based.
  app.post("/campuses/:id/find-missing-details", async (req, reply) => {
    const { id } = CampusIdParamSchema.parse(req.params);
    return reply.send(await campusService.findMissingCampusFields(id));
  });
}
