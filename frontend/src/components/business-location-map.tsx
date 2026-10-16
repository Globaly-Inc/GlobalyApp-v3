"use client";

import { useEffect, useState } from "react";

// Keyless OpenStreetMap embed (`openstreetmap.org/export/embed.html`): no API key, no billing, no
// SDK script, and the iframe paints its own OSM attribution, which is the licence condition. It
// shows one pin at a time — the selected location, or the first — so selecting a card swaps the
// iframe src, which stands in for panning.
//
// The one thing OSM does not do that Google's `?q=` did: resolve a place NAME. The embed takes a
// bounding box and a marker, i.e. numbers, so a row with no coordinates is geocoded once through
// Nominatim and cached. A row that already carries lat/lng (business locations do) never touches
// the network at all.
//
// ponytail: single pin only — the keyed Maps JS SDK version (multi-marker, fitBounds, backend
// geocode) lived here until Sep 2026; recover it from git history if all-pins-at-once matters.
// ponytail: Nominatim is rate-limited (1 req/s, no bulk use) and we call it from the visitor's
// browser. That is fine at a map per conversation and cached per place; if the widget ever draws
// maps in volume, geocode server-side instead and store lat/lng on the branch row — the component
// already prefers coordinates whenever the row has them.

export type MapLocation = {
  id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
};

/** The promise itself is the cache entry, so two cards pointing at the same city share one request.
 *  Only an answer is kept (coordinates, or `null` for "Nominatim knows no such place"); a network
 *  error or a refused request evicts itself so the next mount retries instead of losing that city
 *  until reload. */
const geocoded = new Map<string, Promise<[number, number] | null>>();

// ponytail: one request per 1.1s, globally, by handing each lookup the next free timestamp —
// Nominatim's limit is 1 req/s and a thread with several campus maps mounts them all at once.
let nextSlot = 0;
function waitForSlot(): Promise<void> {
  const at = Math.max(Date.now(), nextSlot);
  nextSlot = at + 1100;
  return new Promise((resolve) => setTimeout(resolve, at - Date.now()));
}

function geocode(query: string): Promise<[number, number] | null> {
  const key = query.trim().toLowerCase();
  let hit = geocoded.get(key);
  if (!hit) {
    hit = waitForSlot()
      .then(() => fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`))
      .then((r) => {
        if (!r.ok) throw new Error(`nominatim ${r.status}`);
        return r.json();
      })
      .then((j) => {
        const first = Array.isArray(j) ? j[0] : null;
        const lat = Number(first?.lat);
        const lon = Number(first?.lon);
        return Number.isFinite(lat) && Number.isFinite(lon) ? ([lat, lon] as [number, number]) : null;
      })
      .catch(() => {
        geocoded.delete(key);
        return null;
      });
    geocoded.set(key, hit);
  }
  return hit;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The box to frame a point in, standing in for the `z=` the Google embed took.
 *
 * One 256px tile spans 360/2^zoom degrees of longitude and the map is roughly a tile and a half
 * wide, so the two zooms the callers use keep their old meaning: 14 frames a street, 11 frames a
 * city. Latitude is scaled by the box's aspect ratio AND by cos(lat), because a degree of
 * longitude shrinks towards the poles — without it a Nordic campus comes out visibly stretched.
 */
export function bboxFor(lat: number, lon: number, zoom: number): string {
  const lonSpan = (360 / 2 ** zoom) * 1.5;
  const latSpan = lonSpan * 0.6 * Math.cos((clamp(lat, -89, 89) * Math.PI) / 180);
  return [
    clamp(lon - lonSpan / 2, -180, 180),
    clamp(lat - latSpan / 2, -90, 90),
    clamp(lon + lonSpan / 2, -180, 180),
    clamp(lat + latSpan / 2, -90, 90),
  ]
    .map((n) => n.toFixed(5))
    .join(",");
}

export function BusinessLocationMap({
  locations,
  selectedId,
  zoom = 14,
  className = "h-72 w-full",
}: Readonly<{
  locations: MapLocation[];
  selectedId?: string | null;
  /** Lower is wider. 14 frames a street, 11 frames a city — the widget's campus map uses 11, which
   *  is as precise as a reply is allowed to be about where an institution sits. */
  zoom?: number;
  /** The widget panel is 380px wide; h-72 is roughly half its height. */
  className?: string;
}>) {
  const loc = locations.find((l) => l.id === selectedId) ?? locations[0];
  const hasPoint = loc?.latitude != null && loc?.longitude != null;
  const query = hasPoint ? null : (loc?.address ?? loc?.name ?? null);
  const [geo, setGeo] = useState<[number, number] | null | undefined>(undefined);

  useEffect(() => {
    if (!query) return;
    setGeo(undefined);
    let live = true;
    void geocode(query).then((p) => {
      if (live) setGeo(p);
    });
    return () => {
      live = false;
    };
  }, [query]);

  if (!loc) return null;
  const point = hasPoint ? ([loc.latitude as number, loc.longitude as number] as const) : geo;
  // Nothing resolved: no map at all, rather than a confident pin in the wrong place.
  if (point === null) return null;
  if (!point) return <div className={`${className} animate-pulse rounded-lg border border-border bg-muted/40`} />;

  const [lat, lon] = point;
  return (
    <iframe
      title={`Map of ${loc.name}`}
      src={`https://www.openstreetmap.org/export/embed.html?bbox=${bboxFor(lat, lon, zoom)}&layer=mapnik&marker=${lat},${lon}`}
      className={`${className} rounded-lg border border-border`}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
    />
  );
}
