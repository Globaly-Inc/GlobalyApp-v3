"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, Mail, MapPin, Pencil, Phone } from "lucide-react";
import { BusinessLocationMap } from "@/components/business-location-map";
import { ScrollRow } from "@/components/scroll-row";
import { ProfileSection } from "./profile-section";
import { joinParts, type ProfileLocation } from "./profile-data";

/**
 * The Locations card from V1: city filter chips, a horizontally scrolling card per location, and
 * a keyless Google embed map underneath that re-points to whichever card is selected.
 */
export function ProfileLocationsCard({
  locations, cityLink, badge, onEditLocation,
}: Readonly<{
  locations: ProfileLocation[];
  cityLink?: { name: string; href: string } | null;
  /** Rendered beside the title — the business portal passes its privacy toggle here. */
  badge?: React.ReactNode;
  /**
   * When set, each card gets a pencil on hover that calls this with the location's id. Omitted on
   * the public profile pages, which have nothing to edit — so they render exactly as before.
   */
  onEditLocation?: (id: string) => void;
}>) {
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
    <ProfileSection icon={MapPin} title="Locations" count={locations.length} badge={badge}>
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

        {/* ScrollRow always reserves a chevron gutter on each side (`SCROLL_ROW_GUTTER`), which would
            inset these cards from the map and chips below. Pulling the rail out by exactly one gutter
            puts the row's *content* back on the card's padding edge, with the chevrons sitting in the
            padding. The selected ring is `ring-inset` so it needs no bleed room of its own. */}
        <ScrollRow className="-mx-[1.125rem]" rowClassName="flex snap-x gap-3 pb-2">
          {displayed.map((loc) => (
            // The pencil can't live inside the selecting button — nested buttons are invalid and the
            // inner click would never reach it. It sits over the card instead, in a `relative` wrapper
            // that owns the hover group.
            <div key={loc.id} className="group/loc relative min-w-[240px] max-w-[260px] shrink-0 snap-start">
            <button
              type="button"
              onClick={() => setSelectedId((prev) => (prev === loc.id ? null : loc.id))}
              className={`w-full space-y-2 rounded-lg border bg-muted/30 p-3.5 text-left transition-all ${
                selectedId === loc.id ? "border-primary ring-2 ring-primary ring-inset" : "hover:border-primary/40"
              }`}
            >
              {/* Every row shares one `w-8` icon column so the name and the detail lines start on the
                  same text edge — the icons centre under the logo tile rather than each row setting
                  its own indent from its own icon width. */}
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
                  <Building2 className="h-4 w-4 text-primary" />
                </span>
                <p className={`truncate text-sm font-semibold text-foreground ${onEditLocation ? "pr-7" : ""}`}>{loc.name}</p>
              </div>
              {loc.address && (
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="flex w-8 shrink-0 justify-center"><MapPin className="mt-0.5 h-3.5 w-3.5" /></span>
                  <span className="line-clamp-2">{joinParts(loc.address, loc.state, loc.country)}</span>
                </div>
              )}
              {loc.email && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex w-8 shrink-0 justify-center"><Mail className="h-3.5 w-3.5" /></span>
                  <span className="truncate">{loc.email}</span>
                </div>
              )}
              {loc.phone && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex w-8 shrink-0 justify-center"><Phone className="h-3.5 w-3.5" /></span>
                  <span className="truncate">{loc.phone}</span>
                </div>
              )}
            </button>

            {onEditLocation && (
              <button
                type="button"
                onClick={() => onEditLocation(loc.id)}
                aria-label={`Edit ${loc.name}`}
                className="absolute right-2 top-2 flex size-7 cursor-pointer items-center justify-center rounded-md border border-border bg-background text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/loc:opacity-100"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            </div>
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
