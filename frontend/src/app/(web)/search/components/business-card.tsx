import Link from "next/link";
import { Building2, MapPin, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { safeUrl } from "@/lib/safe-url";
import { profileHref } from "../../profiles/api";
import type { OrgKind } from "../../profiles/types";
import type { SearchBusiness } from "../types";

export function BusinessCard({
  business,
  kind = null,
}: Readonly<{ business: SearchBusiness; kind?: OrgKind | null }>) {
  const location = [business.city, business.country_name].filter(Boolean).join(", ");
  // Only orgs the profile API actually serves get a link. Visa-service listings have no
  // public profile kind, so their cards stay unlinked rather than pointing at a 404.
  const href = kind && business.slug ? profileHref(kind, business.slug) : null;
  // business.website and logo_url are stored values rendered into href/src.
  const website = safeUrl(business.website);
  const logo = safeUrl(business.logo_url);
  const title = <h3 className="font-semibold text-foreground leading-snug text-[15px] line-clamp-2">{business.business_name}</h3>;

  return (
    <div className="bg-card border border-border rounded-xl hover:shadow-md transition-shadow overflow-hidden">
      <div className="flex flex-col sm:flex-row">
        <div className="flex-1 min-w-0 p-4">
          <div className="flex gap-3">
            <div className="w-14 h-14 rounded-lg border border-border bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt={business.business_name} className="w-full h-full object-contain p-1" />
              ) : (
                <Building2 className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              {href ? <Link href={href} className="hover:text-primary">{title}</Link> : title}
              {location && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                  <MapPin className="h-3 w-3 flex-shrink-0" />
                  {location}
                </p>
              )}
            </div>
          </div>

          {business.description && (
            <p className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground truncate">{business.description}</p>
          )}
        </div>

        <div className="w-full sm:w-44 sm:flex-shrink-0 border-t sm:border-t-0 sm:border-l border-border bg-muted/30 p-5 flex flex-col justify-center gap-2">
          {website ? (
            <Link href={website} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" className="w-full text-xs h-9 gap-1.5">
                <Globe className="h-3.5 w-3.5" />Visit Website
              </Button>
            </Link>
          ) : (
            <p className="text-xs text-muted-foreground italic text-center">No website listed</p>
          )}
          {href ? (
            <Link href={href}>
              <Button size="sm" className="w-full text-xs h-9">View Profile</Button>
            </Link>
          ) : (
            <Link href="/auth/sign-up?redirect=/search">
              <Button size="sm" className="w-full text-xs h-9">Contact</Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
