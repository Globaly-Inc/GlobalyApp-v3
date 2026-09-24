"use client";

import { useState } from "react";
import { Building2, Globe, Handshake, Mail, MapPin, Phone } from "lucide-react";
import { ProfileSection, externalUrl } from "../../../components/profile/profile-section";
import { joinParts } from "../../../components/profile/profile-data";
import type { InstitutionRepresentative } from "../../../search/types";

/**
 * The agencies appointed to recruit for this institution, scraped alongside its campuses.
 * Country chips because the one thing a student wants here is "who represents them near me".
 *
 * The list scrolls inside a fixed-height box rather than growing the card — a big catalog lists
 * hundreds of agents, and the sections below it should stay where they are.
 */
export function InstitutionRepresentatives({ representatives }: Readonly<{ representatives: InstitutionRepresentative[] }>) {
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);

  if (representatives.length === 0) return null;

  const countryCounts = new Map<string, number>();
  for (const rep of representatives) {
    const country = rep.country || "Other";
    countryCounts.set(country, (countryCounts.get(country) ?? 0) + 1);
  }

  const filtered = selectedCountry
    ? representatives.filter((r) => (r.country || "Other") === selectedCountry)
    : representatives;

  const chipClass = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
      active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
    }`;

  return (
    <ProfileSection icon={Handshake} title="Representatives" count={representatives.length}>
      <div className="space-y-4">
        {countryCounts.size > 1 && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setSelectedCountry(null)} className={chipClass(selectedCountry === null)}>
              All ({representatives.length})
            </button>
            {[...countryCounts].sort((a, b) => b[1] - a[1]).map(([country, count]) => (
              <button
                key={country}
                type="button"
                onClick={() => setSelectedCountry((prev) => (prev === country ? null : country))}
                className={chipClass(country === selectedCountry)}
              >
                {country} ({count})
              </button>
            ))}
          </div>
        )}

        <div className="grid max-h-[26rem] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
          {filtered.map((rep) => (
            <div key={rep.id} className="h-fit space-y-2 rounded-lg border border-border bg-muted/30 p-3.5">
              <div className="flex items-center gap-2">
                {rep.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={rep.logo_url} alt="" className="h-8 w-8 shrink-0 rounded-md bg-background object-contain" />
                ) : (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
                    <Building2 className="h-4 w-4 text-primary" />
                  </div>
                )}
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{rep.name || "Unnamed agency"}</p>
              </div>

              {joinParts(rep.city, rep.state, rep.country) && (
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="line-clamp-2">{joinParts(rep.address, rep.city, rep.state, rep.country)}</span>
                </p>
              )}
              {rep.email && (
                <a href={`mailto:${rep.email}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{rep.email}</span>
                </a>
              )}
              {rep.phone && (
                <a href={`tel:${rep.phone}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary">
                  <Phone className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{rep.phone}</span>
                </a>
              )}
              {rep.website && (
                <a
                  href={externalUrl(rep.website)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
                >
                  <Globe className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{rep.website.replace(/^https?:\/\//i, "")}</span>
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </ProfileSection>
  );
}
