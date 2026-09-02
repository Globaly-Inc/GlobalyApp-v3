// Public geocoding proxy for the locations map on the detail pages. The map itself renders in the
// browser (Maps JS needs a public key — no way around that), but address → lat/lng runs here so the
// server-side GOOGLE_MAPS_API_KEY does the billable work and the answer is cached across visitors.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { geocodeAddress } from "../../../shared/google-places/placesService.js";

const GeocodeQuery = z.object({ address: z.string().min(3).max(300) });

export async function searchGeocodeRoutes(app: FastifyInstance) {
  app.get("/search/geocode", {
    // Unauthenticated and it spends our Google quota, so tighter than the global 600/min — but one
    // page view is one call per location (Melbourne Polytechnic alone has 7), and repeats are served
    // from the process cache without touching Google, so 30 was throttling normal browsing.
    config: { rateLimit: { max: 150, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const { address } = GeocodeQuery.parse(req.query);
    // null (address not found) is a normal answer, not an error — the marker is simply skipped.
    return reply.send(await geocodeAddress(address));
  });
}
