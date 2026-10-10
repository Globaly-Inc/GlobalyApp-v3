"use client";

import { useRef } from "react";
import { Camera, Globe, Link2, Loader2, MapPin, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CoverLogoEditor } from "@/components/cover-logo-editor";
import { DynamicIcon } from "@/components/dynamic-icon";
import { CroppedFileInput, type CroppedFileInputHandle } from "@/components/cropped-file-input";
import { SocialIcon, socialNameForUrl, type SocialName } from "@/app/(web)/components/social-icon";
import { externalUrl } from "@/app/(web)/components/profile/profile-section";
import type { BusinessProfile, SocialLinks } from "@/app/business/apis/types";
import type { Country } from "@/app/geo/apis";
import { businessLocationLine, businessTypeLabel } from "../utils";

/**
 * V1's hero card (`BusinessProfilePage`'s Hero + `ProfileHero` on the public side): a cover with a
 * one-time sheen, a rounded logo overlapping it by half, then category badge / name / location stacked beside the
 * logo with the social links as bordered circles on the far right.
 *
 * Kept as the portal's own component rather than reusing `<ProfileHero>` because every surface
 * here is editable — the cover and logo open croppers, and the pencil opens the social links dialog.
 */

// `SocialLinks` carries twelve platforms; the header renders whichever are set, in V1's order.
const SOCIALS: { key: keyof SocialLinks; name: SocialName }[] = [
  { key: "linkedin_url", name: "linkedin" },
  { key: "facebook_url", name: "facebook" },
  { key: "instagram_url", name: "instagram" },
  { key: "twitter_url", name: "twitter" },
  { key: "youtube_url", name: "youtube" },
  { key: "tiktok_url", name: "tiktok" },
  { key: "whatsapp_url", name: "whatsapp" },
  { key: "threads_url", name: "threads" },
  { key: "messenger_url", name: "messenger" },
  { key: "telegram_url", name: "telegram" },
  { key: "line_url", name: "line" },
  { key: "viber_url", name: "viber" },
];

const ICON_LINK =
  "flex size-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-[color,border-color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/5 hover:text-primary";

// CoverLogoEditor owns the "Edit cover" button; restyle it from outside as a light pill that
// firms up when the hero is hovered or the button is focused.
const COVER_EDITOR =
  "h-44 sm:h-48 [&>button]:rounded-full [&>button]:bg-background/85 [&>button]:shadow-sm [&>button]:backdrop-blur [&>button]:opacity-80 [&>button]:transition-opacity group-hover/hero:[&>button]:opacity-100 [&>button:focus-visible]:opacity-100";

export function ProfileHeaderCard({
  profile,
  countries,
  previewMode,
  onCoverFile,
  coverUploading,
  onLogoFile,
  logoUploading,
  onEditSocials,
}: Readonly<{
  profile: BusinessProfile;
  countries: Country[];
  previewMode: boolean;
  onCoverFile: (file: File) => void;
  coverUploading: boolean;
  onLogoFile: (file: File) => void;
  logoUploading: boolean;
  onEditSocials: () => void;
}>) {
  const logoPickerRef = useRef<CroppedFileInputHandle>(null);
  const initials = profile.business_name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  // The owner-chosen category is the real answer ("Education Consultancy"); `business_type` is the
  // coarse platform bucket behind it, and only stands in for a profile that has no category yet.
  const categoryLabel = profile.business_category_name ?? businessTypeLabel(profile.business_type);
  const locationLabel = businessLocationLine(profile, countries);
  const socials = SOCIALS.filter((s) => profile[s.key]);

  const logoImage = profile.logo_url ? (
    // eslint-disable-next-line @next/next/no-img-element -- signed storage URL, not a static asset
    <img src={profile.logo_url} alt={profile.business_name} className="h-full w-full object-contain p-2" />
  ) : (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary to-primary/70">
      <span className="text-3xl font-bold text-primary-foreground">{initials || "?"}</span>
    </div>
  );

  const logoBox =
    "animate-pop-in relative block size-24 shrink-0 overflow-hidden rounded-2xl border-4 border-background bg-muted shadow-lg";

  return (
    <div id="profile-hero" className="group/hero scroll-mt-24 overflow-hidden rounded-2xl border border-border bg-card">
      <div className="relative">
        {previewMode ? (
          <div className="relative h-44 select-none sm:h-48">
            {profile.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed storage URL, not a static asset
              <img src={profile.cover_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-r from-primary/80 via-primary/60 to-primary/40" />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20" />
          </div>
        ) : (
          <CoverLogoEditor
            className={COVER_EDITOR}
            coverUrl={profile.cover_url}
            onCoverFile={onCoverFile}
            coverUploading={coverUploading}
            logoUrl={profile.logo_url}
            logoFallback={initials || "B"}
            onLogoFile={onLogoFile}
            hideLogo
          />
        )}
        {/* One light pass across the cover on mount; pointer-events-none keeps "Edit cover" clickable. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="animate-sheen absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
        </div>
      </div>

      {/* `relative` is load-bearing: the cover above is positioned, so without a stacking context
          of its own this row paints *under* the part of the cover the logo overlaps. */}
      <div className="relative flex flex-col gap-3 px-5 pb-5 sm:flex-row sm:gap-5 sm:px-6">
        <div className="-mt-12 shrink-0">
          {previewMode ? (
            <div className={logoBox}>{logoImage}</div>
          ) : (
            <button type="button" className={`group cursor-pointer ${logoBox}`} onClick={() => logoPickerRef.current?.pick()} aria-label="Change logo">
              {logoImage}
              <span
                className={`absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/55 text-xs font-semibold text-white transition-opacity ${logoUploading ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"}`}
              >
                {logoUploading ? <Loader2 className="size-5 animate-spin" /> : <><Camera className="size-4" />Change</>}
              </span>
            </button>
          )}
          <CroppedFileInput ref={logoPickerRef} cropShape="square" onCropped={onLogoFile} isSaving={logoUploading} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:pt-4">
          <div className="flex min-w-0 flex-col items-start gap-1.5">
            {categoryLabel && (
              <Badge variant="secondary" className="gap-1.5">
                <DynamicIcon name={profile.business_category_icon} fallback="Building2" className="h-3 w-3" />
                {categoryLabel}
              </Badge>
            )}
            <h1 className="font-heading text-2xl leading-tight font-bold text-foreground">{profile.business_name}</h1>
            {locationLabel && (
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" />{locationLabel}
              </span>
            )}
          </div>

          {/* V1 faded the edit pencil in only when the social row is hovered, so the icons
              read as links first and an editable field second. */}
          <div className="group/social flex shrink-0 flex-wrap items-center gap-1.5">
            {!previewMode && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="opacity-0 transition-opacity group-hover/social:opacity-100 focus-visible:opacity-100"
                onClick={onEditSocials}
                aria-label="Edit social links"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            {profile.website && (
              <a href={externalUrl(profile.website)} target="_blank" rel="noopener noreferrer" aria-label="Website" className={ICON_LINK}>
                <Globe className="h-4 w-4" />
              </a>
            )}
            {socials.map((s) => (
              <a key={s.key} href={externalUrl(profile[s.key]!)} target="_blank" rel="noopener noreferrer" aria-label={s.name} className={ICON_LINK}>
                <SocialIcon name={s.name} className="h-4 w-4" />
              </a>
            ))}
            {/* Its brand icon when we have one (TikTok, Threads…), else a link glyph; the label on hover. */}
            {(profile.other_social_links ?? []).map((l) => {
              const brand = socialNameForUrl(l.url);
              return (
                <a key={l.url} href={externalUrl(l.url)} target="_blank" rel="noopener noreferrer" aria-label={l.label} title={l.label} className={ICON_LINK}>
                  {brand ? <SocialIcon name={brand} className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                </a>
              );
            })}
          </div>
        </div>
      </div>

    </div>
  );
}
