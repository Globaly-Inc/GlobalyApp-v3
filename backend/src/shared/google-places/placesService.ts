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

export type GeocodeResult = {
  formattedAddress: string;
  latitude: number;
  longitude: number;
  postcode: string | null;
  mapLink: string;
};

/** Looks up a raw address string directly (no place_id / autocomplete round-trip needed) —
 * used to backfill postcode/map link for a record that already has a street address but
 * was never geocoded (e.g. one written by the extraction pipeline from page text alone). */
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const apiKey = requireApiKey();

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", apiKey);

  const res = await fetch(url);
  const body = (await res.json()) as {
    status: string;
    error_message?: string;
    results?: { formatted_address: string; geometry: { location: { lat: number; lng: number } }; address_components: GoogleAddressComponent[] }[];
  };
  if (body.status === "ZERO_RESULTS") return null;
  if (body.status !== "OK" || !body.results?.[0]) {
    throw new AppError(body.error_message ?? `Geocoding failed: ${body.status}`, 502, "PLACES_API_ERROR");
  }

  const result = body.results[0];
  return {
    formattedAddress: result.formatted_address,
    latitude: result.geometry.location.lat,
    longitude: result.geometry.location.lng,
    postcode: pickComponent(result.address_components, "postal_code"),
    mapLink: `https://www.google.com/maps/search/?api=1&query=${result.geometry.location.lat},${result.geometry.location.lng}`,
  };
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
