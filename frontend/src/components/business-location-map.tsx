"use client";

// Google Maps JS SDK loaded client-side (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY — distinct from the
// backend's server-proxied Places key). Renders a marker per location, geocoding any location
// missing lat/lng, and fits bounds to all markers (or centers on the selected one). Ported from
// V1's inline map logic in BusinessProfilePage's locations card.
//
// No `@types/google.maps` dependency — this is a small, self-contained wrapper around a global
// script, not worth a devDependency for a handful of loosely-typed calls.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    google?: any;
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

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (window.google?.maps) return Promise.resolve();
  loaderPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geocoding`;
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
    if (!apiKey || !containerRef.current) return;
    let cancelled = false;
    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !containerRef.current) return;
        mapRef.current = new window.google.maps.Map(containerRef.current, {
          center: { lat: 20, lng: 0 },
          zoom: 2,
          mapId: "business-location-map",
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
    const geocoder = new google.maps.Geocoder();
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
        if (markersRef.current.size > 0) mapRef.current.fitBounds(bounds);
      };

      if (loc.latitude != null && loc.longitude != null) {
        placeMarker(loc.latitude, loc.longitude);
      } else if (loc.address) {
        geocoder.geocode({ address: loc.address }, (results: any[], status: string) => {
          if (status === "OK" && results[0]) {
            const { lat, lng } = results[0].geometry.location;
            placeMarker(lat(), lng());
          }
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

  if (!apiKey || failed) return null; // graceful skip — the plain location list still renders above/below this

  return <div ref={containerRef} className="h-72 w-full rounded-lg border border-border" />;
}
