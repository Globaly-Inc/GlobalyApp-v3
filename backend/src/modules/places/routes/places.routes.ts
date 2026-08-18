// Google Places proxy for self-service profile forms (business, personal) — any authenticated
// platform_user, unlike the admin-only equivalent under superadmin/platform/routes/places.routes.ts.
// Both wrap the same shared/google-places/placesService.ts.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { autocompletePlaces, getPlaceDetails } from "../../../shared/google-places/placesService.js";

const AutocompleteQuery = z.object({
  input: z.string().min(1),
  country: z.string().length(2).optional(), // ISO2 — restricts suggestions to the selected country
});

const PlaceIdParam = z.object({ placeId: z.string().min(1) });

export async function placesRoutes(app: FastifyInstance) {
  app.get("/autocomplete", async (req, reply) => {
    const { input, country } = AutocompleteQuery.parse(req.query);
    const predictions = await autocompletePlaces(input, country);
    return reply.send({ predictions });
  });

  app.get("/:placeId/details", async (req, reply) => {
    const { placeId } = PlaceIdParam.parse(req.params);
    const details = await getPlaceDetails(placeId);
    return reply.send(details);
  });
}
