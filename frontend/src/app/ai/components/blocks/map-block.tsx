"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { BusinessLocationMap } from "@/components/business-location-map";
import { cn } from "@/lib/utils";
import type { ResponseBlock } from "../../apis/types";

type MapBlockProps = { block: Extract<ResponseBlock, { type: "map" }> };

/**
 * The campuses a reply just mentioned, on a map.
 *
 * Reuses the portal's `BusinessLocationMap` — a keyless OpenStreetMap `export/embed.html` iframe,
 * so no API key, no billing and no SDK script. Zoom 11 frames a city: the server only ever sends
 * city/state/country, so a tighter zoom would promise a precision the query does not carry (owner
 * decision, 2026-10-08 — a widget reply names a place, never a street address).
 *
 * The OpenStreetMap link sits OUTSIDE the iframe on purpose. Our widget is itself an
 * iframe on someone else's site, so this is a nested one: a host page with `frame-src 'self'`
 * kills it silently — no error, no event, just an empty box. The link is what survives that.
 *
 * Campus chips switch the pin locally. They deliberately do NOT go through `onAction`: on a
 * message block that sends a turn, and nobody expects looking at the other campus to cost a reply.
 */
export function MapBlock({ block }: MapBlockProps) {
  const [selectedId, setSelectedId] = useState(block.locations[0]?.id ?? null);
  const selected = block.locations.find((l) => l.id === selectedId) ?? block.locations[0];
  if (!selected) return null;

  return (
    <div className="flex w-full flex-col gap-1.5">
      {block.locations.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {block.locations.map((loc) => (
            <button
              key={loc.id}
              type="button"
              onClick={() => setSelectedId(loc.id)}
              aria-pressed={loc.id === selected.id}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                loc.id === selected.id
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-muted/50 text-muted-foreground hover:border-primary/50 hover:text-foreground",
              )}
            >
              {loc.label}
            </button>
          ))}
        </div>
      )}

      <BusinessLocationMap
        locations={[{ id: selected.id, name: selected.name, address: selected.query, latitude: null, longitude: null }]}
        selectedId={selected.id}
        zoom={11}
        className="h-40 w-full"
      />

      <a
        href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(selected.query)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        <MapPin className="size-3.5" />
        {selected.name} on OpenStreetMap
      </a>
    </div>
  );
}
