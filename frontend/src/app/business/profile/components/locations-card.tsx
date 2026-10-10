"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { BusinessLocationMap } from "@/components/business-location-map";
import { joinParts, type ProfileLocation } from "@/app/(web)/components/profile/profile-data";
import { ProfileCard } from "./profile-card";
import { LocationTile } from "./location-tile";

/** Enough to show the head office and a few branches before the list asks to be expanded. */
const COLLAPSED_COUNT = 4;

/**
 * The portal's Locations card: city filter chips, a responsive grid of location tiles, and the
 * map underneath re-pointing to the selected tile. The public profile keeps its own
 * `<ProfileLocationsCard>` (horizontal scroll row); this is the business portal's redesign of it.
 */
export function LocationsCard({
  locations, primaryId, badge, onEditLocation,
}: Readonly<{
  locations: ProfileLocation[];
  /** The head office — the business's own address. */
  primaryId: string;
  badge?: React.ReactNode;
  onEditLocation?: (id: string) => void;
}>) {
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const cityCounts = new Map<string, number>();
  for (const loc of locations) {
    const city = loc.city || "Other";
    cityCounts.set(city, (cityCounts.get(city) ?? 0) + 1);
  }

  const displayed = selectedCity ? locations.filter((l) => (l.city || "Other") === selectedCity) : locations;
  const shown = expanded ? displayed : displayed.slice(0, COLLAPSED_COUNT);

  const pickCity = (city: string | null) => {
    setSelectedCity((prev) => (prev === city ? null : city));
    setSelectedId(null);
  };

  const chipClass = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
      active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground",
    );

  return (
    <ProfileCard id="profile-locations" icon={MapPin} title="Locations" count={locations.length} badge={badge}>
      <div className="flex flex-col gap-3">
        {cityCounts.size > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button type="button" aria-pressed={selectedCity === null} onClick={() => pickCity(null)} className={chipClass(selectedCity === null)}>
              All ({locations.length})
            </button>
            {[...cityCounts].map(([city, count]) => (
              <button key={city} type="button" aria-pressed={city === selectedCity} onClick={() => pickCity(city)} className={chipClass(city === selectedCity)}>
                {city} ({count})
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2.5">
          {shown.map((loc, i) => (
            <LocationTile
              key={loc.id}
              location={loc}
              index={i}
              primary={loc.id === primaryId}
              selected={selectedId === loc.id}
              onSelect={() => setSelectedId((prev) => (prev === loc.id ? null : loc.id))}
              onEdit={onEditLocation && loc.editable !== false ? () => onEditLocation(loc.id) : undefined}
            />
          ))}
        </div>

        {displayed.length > COLLAPSED_COUNT && (
          <button type="button" onClick={() => setExpanded((v) => !v)} className="w-fit text-[12.5px] font-semibold text-primary hover:underline">
            {expanded ? "Show fewer" : `Show all ${displayed.length} locations`}
          </button>
        )}

        <BusinessLocationMap
          selectedId={selectedId}
          locations={displayed.map((l) => ({
            id: l.id,
            name: l.name,
            address: joinParts(l.address, l.city, l.state, l.country),
            latitude: l.latitude,
            longitude: l.longitude,
          }))}
        />
      </div>
    </ProfileCard>
  );
}
