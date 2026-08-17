// Google Places proxy — address autocomplete + details (lat/lng, city/state/postcode) for the business
// location form. Key stays server-side; the frontend only ever sees predictions/results.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../../../../config.js";
import { AppError } from "../../../../shared/errors.js";

const AutocompleteQuery = z.object({
  input: z.string().min(1),
  country: z.string().length(2).optional(), // ISO2 — restricts suggestions to the selected country
});

const PlaceIdParam = z.object({ placeId: z.string().min(1) });

type GoogleAddressComponent = { long_name: string; short_name: string; types: string[] };

function requireApiKey(): string {
  if (!config.GOOGLE_MAPS_API_KEY) {
    throw new AppError("Address lookup isn't configured — set GOOGLE_MAPS_API_KEY on the server.", 503, "PLACES_UNAVAILABLE");
  }
  return config.GOOGLE_MAPS_API_KEY;
}

function pickComponent(components: GoogleAddressComponent[], type: string): string | null {
  return components.find((c) => c.types.includes(type))?.long_name ?? null;
}

export async function adminPlacesRoutes(app: FastifyInstance) {
  app.get("/places/autocomplete", async (req, reply) => {
    const { input, country } = AutocompleteQuery.parse(req.query);
    const apiKey = requireApiKey();

    const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
    url.searchParams.set("input", input);
    url.searchParams.set("key", apiKey);
    if (country) url.searchParams.set("components", `country:${country.toLowerCase()}`);

    const res = await fetch(url);
    const body = (await res.json()) as { status: string; error_message?: string; predictions?: { place_id: string; description: string }[] };
    if (body.status !== "OK" && body.status !== "ZERO_RESULTS") {
      throw new AppError(body.error_message ?? `Places autocomplete failed: ${body.status}`, 502, "PLACES_API_ERROR");
    }

    return reply.send({
      predictions: (body.predictions ?? []).map((p) => ({ placeId: p.place_id, description: p.description })),
    });
  });

  app.get("/places/:placeId/details", async (req, reply) => {
    const { placeId } = PlaceIdParam.parse(req.params);
    const apiKey = requireApiKey();

    const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
    url.searchParams.set("place_id", placeId);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("fields", "formatted_address,geometry,address_component");

    const res = await fetch(url);
    const body = (await res.json()) as {
      status: string;
      error_message?: string;
      result?: { formatted_address: string; geometry: { location: { lat: number; lng: number } }; address_components: GoogleAddressComponent[] };
    };
    if (body.status !== "OK" || !body.result) {
      throw new AppError(body.error_message ?? `Place details failed: ${body.status}`, 502, "PLACES_API_ERROR");
    }

    const { result } = body;
    return reply.send({
      address: result.formatted_address,
      latitude: result.geometry.location.lat,
      longitude: result.geometry.location.lng,
      city: pickComponent(result.address_components, "locality"),
      state: pickComponent(result.address_components, "administrative_area_level_1"),
      postcode: pickComponent(result.address_components, "postal_code"),
    });
  });
}
