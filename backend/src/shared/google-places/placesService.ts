// Google Places proxy — address autocomplete + details (lat/lng, city/state/postcode). Key stays
// server-side; callers (admin business form, business/personal self-service profiles) only ever
// see predictions/results.

import { config } from "../../config.js";
import { AppError } from "../errors.js";

type GoogleAddressComponent = { long_name: string; short_name: string; types: string[] };

export type PlaceSuggestion = { placeId: string; description: string };
export type PlaceDetails = {
  address: string;
  latitude: number;
  longitude: number;
  city: string | null;
  state: string | null;
  postcode: string | null;
};

function requireApiKey(): string {
  if (!config.GOOGLE_MAPS_API_KEY) {
    throw new AppError("Address lookup isn't configured — set GOOGLE_MAPS_API_KEY on the server.", 503, "PLACES_UNAVAILABLE");
  }
  return config.GOOGLE_MAPS_API_KEY;
}

function pickComponent(components: GoogleAddressComponent[], type: string): string | null {
  return components.find((c) => c.types.includes(type))?.long_name ?? null;
}

export async function autocompletePlaces(input: string, countryIso2?: string): Promise<PlaceSuggestion[]> {
  const apiKey = requireApiKey();

  const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
  url.searchParams.set("input", input);
  url.searchParams.set("key", apiKey);
  if (countryIso2) url.searchParams.set("components", `country:${countryIso2.toLowerCase()}`);

  const res = await fetch(url);
  const body = (await res.json()) as { status: string; error_message?: string; predictions?: { place_id: string; description: string }[] };
  if (body.status !== "OK" && body.status !== "ZERO_RESULTS") {
    throw new AppError(body.error_message ?? `Places autocomplete failed: ${body.status}`, 502, "PLACES_API_ERROR");
  }

  return (body.predictions ?? []).map((p) => ({ placeId: p.place_id, description: p.description }));
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
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
  return {
    address: result.formatted_address,
    latitude: result.geometry.location.lat,
    longitude: result.geometry.location.lng,
    city: pickComponent(result.address_components, "locality"),
    state: pickComponent(result.address_components, "administrative_area_level_1"),
    postcode: pickComponent(result.address_components, "postal_code"),
  };
}
