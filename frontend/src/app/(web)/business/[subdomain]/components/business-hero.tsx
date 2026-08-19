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
    <section className="border-b border-border">
      <div className="relative h-40 sm:h-52 overflow-hidden">
        {business.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={business.cover_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,color-mix(in_oklab,var(--color-primary)_35%,transparent),transparent_55%),radial-gradient(circle_at_85%_75%,color-mix(in_oklab,var(--color-primary)_25%,transparent),transparent_50%)] bg-primary/90" />
        )}
      </div>

      <div className="container max-w-6xl mx-auto px-4">
        <p className="text-xs text-muted-foreground pt-3">
          <Link href="/" className="hover:text-primary">Home</Link> /{" "}
          <Link href="/search" className="hover:text-primary">Search</Link> / {business.business_name}
        </p>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 pb-6">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border border-border bg-card shadow-sm flex items-center justify-center flex-shrink-0 overflow-hidden">
              {business.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={business.logo_url} alt={business.business_name} className="w-full h-full object-cover" />
              ) : (
                <Building2 className="h-8 w-8 text-primary" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                {business.category_name && (
                  <Badge className="bg-primary/10 text-primary border-primary/20 gap-1">
                    <Building2 className="h-3 w-3" />{business.category_name}
                  </Badge>
                )}
                {location && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />{location}
                  </span>
                )}
              </div>
              <h1 className="text-2xl md:text-4xl font-bold tracking-tight text-foreground">{business.business_name}</h1>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {business.website && (
              <a href={business.website} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Globe className="h-3.5 w-3.5" />Website
                </Button>
              </a>
            )}
          </div>
        </div>

        {stats.length > 0 && (
          <div className="flex items-center gap-6 pb-6 -mt-2">
            {stats.map(({ icon: Icon, label, count }) => (
              <div key={label} className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
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
    </section>
  );
}
