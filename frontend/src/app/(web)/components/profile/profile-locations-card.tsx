"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, Mail, MapPin, Phone } from "lucide-react";
import { BusinessLocationMap } from "@/components/business-location-map";
import { ScrollRow } from "@/components/scroll-row";
import { ProfileSection } from "./profile-section";
import { joinParts, type ProfileLocation } from "./profile-data";

/**
 * The Locations card from V1: city filter chips, a horizontally scrolling card per location, and
 * a Google map underneath that pans to whichever card is selected. The map renders nothing when
 * NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is unset, so the list above it is always the source of truth.
 */
export function ProfileLocationsCard({
  locations, cityLink,
}: Readonly<{ locations: ProfileLocation[]; cityLink?: { name: string; href: string } | null }>) {
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (locations.length === 0) return null;

  const cityCounts = new Map<string, number>();
  for (const loc of locations) {
    const city = loc.city || "Other";
    cityCounts.set(city, (cityCounts.get(city) ?? 0) + 1);
  }

  const displayed = selectedCity ? locations.filter((l) => (l.city || "Other") === selectedCity) : locations;

  const chipClass = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
      active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
    }`;

  return (
    <ProfileSection icon={MapPin} title="Locations" count={locations.length}>
      <div className="space-y-4">
        {cityCounts.size > 1 && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { setSelectedCity(null); setSelectedId(null); }} className={chipClass(selectedCity === null)}>
              All ({locations.length})
            </button>
            {[...cityCounts].map(([city, count]) => (
              <button
                key={city}
                type="button"
                onClick={() => { setSelectedCity((prev) => (prev === city ? null : city)); setSelectedId(null); }}
                className={chipClass(city === selectedCity)}
              >
                {city} ({count})
              </button>
            ))}
          </div>
        )}

        <ScrollRow className="-mx-1" rowClassName="flex snap-x gap-3 px-1 pb-2">
          {displayed.map((loc) => (
            <button
              key={loc.id}
              type="button"
              onClick={() => setSelectedId((prev) => (prev === loc.id ? null : loc.id))}
              className={`min-w-[240px] max-w-[260px] shrink-0 snap-start space-y-2 rounded-lg border bg-muted/30 p-3.5 text-left transition-all ${
                selectedId === loc.id ? "border-primary ring-2 ring-primary" : "hover:border-primary/40"
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
                  <Building2 className="h-4 w-4 text-primary" />
                </div>
                <p className="truncate text-sm font-semibold text-foreground">{loc.name}</p>
              </div>
              {loc.address && (
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="line-clamp-2">{joinParts(loc.address, loc.state, loc.country)}</span>
                </div>
              )}
              {loc.email && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Mail className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{loc.email}</span>
                </div>
              )}
              {loc.phone && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Phone className="h-3.5 w-3.5 shrink-0" /><span>{loc.phone}</span>
                </div>
              )}
            </button>
          ))}
        </ScrollRow>

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

        {cityLink && (
          <p className="text-center">
            <Link href={cityLink.href} className="text-sm font-medium text-primary hover:underline">
              Explore the City of {cityLink.name} →
            </Link>
          </p>
        )}
      </div>
    </ProfileSection>
  );
}
