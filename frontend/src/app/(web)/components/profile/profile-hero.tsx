import { Building2, CheckCircle, Globe, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SocialIcon } from "../social-icon";
import { externalUrl } from "./profile-section";
import type { ProfileData } from "./profile-data";

const ICON_LINK =
  "flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground";

export function ProfileHero({ data }: Readonly<{ data: ProfileData }>) {
  const initials = data.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="relative h-44 select-none">
        {data.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-r from-primary/80 via-primary/60 to-primary/40" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20" />
      </div>

      {/* `relative` is load-bearing: the cover above is positioned, so without a stacking
          context of its own this row paints *under* the part of the cover it overlaps. */}
      <div className="relative px-6 py-6">
        {/* The logo overlaps the cover, so the details column carries its own top padding to
            line its text up beside the taller logo box. */}
        <div className="-mt-14 flex flex-col items-start gap-4 sm:flex-row">
          <div className="h-28 w-28 shrink-0 overflow-hidden rounded-lg border-4 border-background bg-muted shadow-lg">
            {data.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.logoUrl} alt={data.name} className="h-full w-full object-contain p-2" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary to-primary/70">
                <span className="text-3xl font-bold text-primary-foreground">{initials || "?"}</span>
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 pt-2 sm:pt-10">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 pt-0.5">
                {data.categoryLabel && (
                  <Badge variant="secondary" className="mb-1.5 gap-1.5">
                    <Building2 className="h-3 w-3" />{data.categoryLabel}
                  </Badge>
                )}
                <h1 className="text-2xl font-bold text-foreground">{data.name}</h1>
                {data.locationLabel && (
                  <span className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />{data.locationLabel}
                  </span>
                )}
                {data.verified && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="gap-1 text-xs">
                      <CheckCircle className="h-3 w-3 text-primary" />Verified
                    </Badge>
                  </div>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2 pt-1">
                {data.website && (
                  <a href={externalUrl(data.website)} target="_blank" rel="noopener noreferrer" aria-label="Website" className={ICON_LINK}>
                    <Globe className="h-4 w-4" />
                  </a>
                )}
                {data.socials.map((s) => (
                  <a key={s.name} href={externalUrl(s.url)} target="_blank" rel="noopener noreferrer" aria-label={s.name} className={ICON_LINK}>
                    <SocialIcon name={s.name} className="h-4 w-4" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
