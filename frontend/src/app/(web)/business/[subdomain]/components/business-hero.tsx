import Link from "next/link";
import { Briefcase, Building2, Globe, MapPin, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BusinessDetail } from "../../../search/types";

export function BusinessHero({ business }: Readonly<{ business: BusinessDetail }>) {
  const location = [business.city, business.country_name].filter(Boolean).join(", ");

  const stats = [
    { icon: Briefcase, label: "Service", count: business.services.length },
    { icon: MapPin, label: "Location", count: business.branches.length },
    { icon: Users, label: "Team member", count: business.members.length },
  ].filter((s) => s.count > 0);

  return (
    <section className="container max-w-6xl mx-auto px-4 pt-6">
      <p className="text-xs text-muted-foreground pb-3">
        <Link href="/" className="hover:text-primary">Home</Link> /{" "}
        <Link href="/search" className="hover:text-primary">Search</Link> / {business.business_name}
      </p>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="relative h-40 sm:h-48">
          {business.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={business.cover_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,color-mix(in_oklab,var(--color-primary)_35%,transparent),transparent_55%),radial-gradient(circle_at_85%_75%,color-mix(in_oklab,var(--color-primary)_25%,transparent),transparent_50%)] bg-primary/90" />
          )}
        </div>

        <div className="px-6 pb-6">
          {/* Logo and details sit in the same row, pulled up so the logo overlaps the cover — the details
              column gets its own top padding to align its text next to the taller logo box. */}
          <div className="flex flex-col items-start gap-4 -mt-14 sm:flex-row">
            <div className="h-28 w-28 shrink-0 overflow-hidden rounded-lg border-4 border-card bg-card shadow-sm">
              {business.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={business.logo_url} alt={business.business_name} className="h-full w-full object-contain p-2" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-primary to-primary/70">
                  <Building2 className="h-8 w-8 text-primary-foreground" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0 pt-2 sm:pt-10">
              <div className="flex items-start justify-between gap-4">
                <div>
                  {business.category_name && (
                    <Badge className="mb-1.5 bg-primary/10 text-[11px] font-medium text-primary border-primary/20">
                      {business.category_name}
                    </Badge>
                  )}
                  <h1 className="text-xl sm:text-2xl font-bold leading-tight tracking-tight text-foreground">{business.business_name}</h1>
                  {location && (
                    <span className="mt-1.5 flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />{location}
                    </span>
                  )}
                </div>

                {business.website && (
                  <a href={business.website} target="_blank" rel="noopener noreferrer" className="shrink-0">
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <Globe className="h-3.5 w-3.5" />Website
                    </Button>
                  </a>
                )}
              </div>
            </div>
          </div>

          {stats.length > 0 && (
            <div className="flex items-center gap-6 pt-4">
              {stats.map(({ icon: Icon, label, count }) => (
                <div key={label} className="flex items-center gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <p className="text-sm text-foreground">
                    <span className="font-semibold">{count}</span>{" "}
                    <span className="text-muted-foreground">{label}{count === 1 ? "" : "s"}</span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
