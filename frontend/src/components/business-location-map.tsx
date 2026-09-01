"use client";

// Google Maps JS SDK loaded client-side — rendering tiles is the one part that cannot happen
// server-side, so NEXT_PUBLIC_GOOGLE_MAPS_API_KEY reaches the browser and needs the Maps JavaScript
// API activated on the Cloud project. Addresses are resolved through our own backend instead (see
// geocode() below), so the browser key never needs the Geocoding API. Renders a marker per location
// and fits bounds to all of them (or centers on the selected one). Ported from V1's inline map logic
// in BusinessProfilePage's locations card.
//
// No `@types/google.maps` dependency — this is a small, self-contained wrapper around a global
// script, not worth a devDependency for a handful of loosely-typed calls.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    google?: any;
    /** Google calls this when it rejects the key, instead of throwing — see the failure effect below. */
    gm_authFailure?: () => void;
  }
}

export type MapLocation = {
  id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
};

let loaderPromise: Promise<void> | null = null;

// Address → lat/lng runs on our backend (server-side key, cached there), so the public Maps JS key
// never needs the Geocoding API enabled and the same address isn't re-billed on every page view.
const API_BASE = `${(process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "")}/api/v3`;

async function geocode(address: string): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const res = await fetch(`${API_BASE}/search/geocode?address=${encodeURIComponent(address)}`);
    return res.ok ? await res.json() : null;
  } catch {
    return null; // a missing pin is not worth breaking the card over
  }
}

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (window.google?.maps) return Promise.resolve();
  loaderPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });
  return loaderPromise;
}

export function BusinessLocationMap({
  locations,
  selectedId,
}: Readonly<{ locations: MapLocation[]; selectedId?: string | null }>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    // Silent absence is indistinguishable from a broken map — say so once, in dev only.
    if (!apiKey && process.env.NODE_ENV !== "production") {
      console.warn("[map] NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set — the locations map will not render.");
    }
    if (!apiKey || !containerRef.current) return;
    let cancelled = false;
    // A rejected key (API not activated, billing off, referrer blocked) is not a load error: the
    // script loads fine and Google paints its own grey "Something went wrong" panel into our div.
    // This is the documented hook for catching that, so we can show our own fallback instead.
    window.gm_authFailure = () => {
      console.error("[map] Google rejected the Maps JavaScript API key — check the console error above (ApiNotActivatedMapError / BillingNotEnabledMapError / RefererNotAllowedMapError).");
      setFailed(true);
    };
    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !containerRef.current) return;
        mapRef.current = new window.google.maps.Map(containerRef.current, {
          center: { lat: 20, lng: 0 },
          zoom: 2,
        });
        setReady(true);
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const google = window.google;
    const bounds = new google.maps.LatLngBounds();
    const seen = new Set(locations.map((l) => l.id));

    for (const [id, marker] of markersRef.current) {
      if (!seen.has(id)) {
        marker.setMap(null);
        markersRef.current.delete(id);
      }
    }

    for (const loc of locations) {
      const placeMarker = (lat: number, lng: number) => {
        const position = { lat, lng };
        let marker = markersRef.current.get(loc.id);
        if (marker) {
          marker.setPosition(position);
        } else {
          marker = new google.maps.Marker({ position, map: mapRef.current, title: loc.name });
          markersRef.current.set(loc.id, marker);
        }
        bounds.extend(position);
        // fitBounds on a single point zooms to maximum, so one location gets a fixed neighbourhood
        // zoom instead; two or more frame the whole set (the multi-campus look).
        if (markersRef.current.size === 1) {
          mapRef.current.setCenter(position);
          mapRef.current.setZoom(14);
        } else {
          mapRef.current.fitBounds(bounds, 48);
        }
      };

      if (loc.latitude != null && loc.longitude != null) {
        placeMarker(loc.latitude, loc.longitude);
      } else if (loc.address) {
        void geocode(loc.address).then((coords) => {
          if (coords) placeMarker(coords.latitude, coords.longitude);
        });
      }
    }
  }, [ready, locations]);

  useEffect(() => {
    if (!ready || !selectedId || !mapRef.current) return;
    const marker = markersRef.current.get(selectedId);
    if (marker) {
      mapRef.current.panTo(marker.getPosition());
      mapRef.current.setZoom(14);
    }
  }, [ready, selectedId]);

  // Nothing to fall back to when there is no key at all — the location list above stands alone.
  if (!apiKey) return null;

  // Google's own error panel is unreadable to a visitor, and it has already been painted into the
  // container by the time we get here, so the container is dropped and replaced with a link that
  // needs no API key, no billing and no activation.
  // Google has already painted its own grey error panel into the container by now, so the container
  // is dropped and replaced with a link that needs no key.
  if (failed) {
    const withAddress = locations.find((l) => l.address);
    return (
      <div className="flex h-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-muted/30 px-4 text-center">
        <p className="text-xs text-muted-foreground">Map unavailable right now.</p>
        {withAddress?.address && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(withAddress.address)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-primary hover:underline"
          >
            Open in Google Maps →
          </a>
        )}
      </div>
    );
  }

  return <div ref={containerRef} className="h-72 w-full rounded-lg border border-border" />;
}
