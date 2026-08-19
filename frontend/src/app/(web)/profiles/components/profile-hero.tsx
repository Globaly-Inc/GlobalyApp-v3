import Link from "next/link";
import { Building2, Globe, MapPin, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OrgProfile } from "../types";

const BREADCRUMB = {
  institution: { label: "Institutions", href: "/search?tab=institutions" },
  agent: { label: "Agents", href: "/search?tab=education-agencies" },
} as const;

// The profile API returns cover_url/logo_url straight out of the column, and for
// GCS-hosted uploads that is a bare object key ("v1/avatars/covers/..."), not a URL —
// nothing signs it on the way out. Rendering the key as a src is a guaranteed broken
// image, so only absolute URLs are shown until the API signs them.
const displayable = (url: string | null) => (url && /^https?:\/\//.test(url) ? url : null);

export function ProfileHero({ org }: Readonly<{ org: OrgProfile }>) {
  const location = [org.city, org.state, org.country?.name].filter(Boolean).join(", ");
  const crumb = BREADCRUMB[org.kind];
  const cover = displayable(org.cover_url);
  const logo = displayable(org.logo_url);

  return (
    <section className="border-b border-border bg-muted/30">
      {cover && (
        <div className="relative h-40 w-full overflow-hidden md:h-56">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        </div>
      )}

      <div className="container mx-auto max-w-5xl px-4 py-6">
        <p className="mb-4 text-xs text-muted-foreground">
          <Link href="/" className="hover:text-foreground">Home</Link>
          {" / "}
          <Link href={crumb.href} className="hover:text-foreground">{crumb.label}</Link>
          {" / "}
          {org.name}
        </p>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-background">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt={org.name} className="h-full w-full object-contain p-1.5" />
            ) : (
              <Building2 className="h-8 w-8 text-muted-foreground" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground md:text-3xl">{org.name}</h1>
              {org.is_verified && (
                <Badge className="gap-1 bg-primary/10 text-primary border border-primary/20">
                  <ShieldCheck className="h-3 w-3" /> Verified
                </Badge>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {location && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />{location}
                </span>
              )}
              {org.category && <span>{org.category.name}</span>}
            </div>
          </div>

          <div className="flex flex-shrink-0 flex-col gap-2 sm:w-44">
            <Button size="sm" render={<Link href={`/auth/sign-up?redirect=/${org.kind === "agent" ? "agents" : "institutions"}/${org.slug}`} />}>
              Contact
            </Button>
            {org.website && (
              <Button size="sm" variant="outline" className="gap-1.5" render={<Link href={org.website} target="_blank" rel="noopener noreferrer" />}>
                <Globe className="h-3.5 w-3.5" /> Visit Website
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
