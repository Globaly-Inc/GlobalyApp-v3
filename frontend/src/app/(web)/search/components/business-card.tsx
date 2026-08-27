import Link from "next/link";
import { Building2, Heart, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SearchBusiness } from "../types";

export function BusinessCard({ business }: Readonly<{ business: SearchBusiness }>) {
  const location = [business.city, business.country_name].filter(Boolean).join(", ");
  // Education agents and migration agents are always real businesses (hence a subdomain); the
  // Visa Services tab also lists scraped catalog providers, which only have a slug.
  const profileHref = business.subdomain
    ? `/business/${business.subdomain}`
    : `/visa-service/${business.slug}`;

  return (
    <div className="group relative bg-card border border-border rounded-xl hover:shadow-md hover:border-primary/40 transition-all overflow-hidden">
      <Link href={profileHref} className="absolute inset-0 z-0" aria-label={business.business_name} />
      <div className="flex flex-col sm:flex-row pointer-events-none">
        {/* ── Left: info ──────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 p-4">
          <div className="flex gap-3">
            <div className="w-14 h-14 rounded-lg border border-border bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
              {business.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={business.logo_url} alt={business.business_name} className="w-full h-full object-contain p-1" />
              ) : (
                <Building2 className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug text-[15px]">
                  {business.business_name}
                </h3>
                <div className="flex items-center gap-1.5 flex-shrink-0 pointer-events-auto">
                  {business.status === "verified" && (
                    <Badge className="text-xs bg-secondary text-secondary-foreground border-secondary">Verified</Badge>
                  )}
                  <button type="button" aria-label="Save" className="text-muted-foreground hover:text-primary">
                    <Heart className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {location && <p className="text-xs text-muted-foreground mt-0.5">{location}</p>}
              {business.city && (
                <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                  <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <Badge variant="secondary" className="text-xs px-2 py-0 font-normal rounded-full">{business.city}</Badge>
                </div>
              )}
            </div>
          </div>

          {business.category_name && (
            <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
              <div className="flex flex-col gap-0.5 min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide leading-none">Type</p>
                <p className="text-xs font-medium text-foreground truncate">{business.category_name}</p>
              </div>
            </div>
          )}

          {business.description && (
            <p className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground truncate">{business.description}</p>
          )}
        </div>

        {/* ── Right: CTAs ──────────────────────────────────────────────── */}
        <div className="w-full sm:w-44 sm:flex-shrink-0 border-t sm:border-t-0 sm:border-l border-border bg-muted/30 p-5 flex flex-col justify-center gap-4">
          <p className="text-xs text-muted-foreground italic">Contact for details</p>
          <div className="flex flex-col gap-2 pointer-events-auto">
            <Link href="/auth/sign-up?redirect=/search">
              <Button size="sm" className="w-full text-xs h-9">Contact</Button>
            </Link>
            <Link href={profileHref}>
              <Button size="sm" variant="outline" className="w-full text-xs h-9 text-muted-foreground font-normal">View Profile</Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
