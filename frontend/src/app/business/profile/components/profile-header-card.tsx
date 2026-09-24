"use client";

import { useRef } from "react";
import { Camera, Globe, Loader2, MapPin, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CoverLogoEditor } from "@/components/cover-logo-editor";
import { DynamicIcon } from "@/components/dynamic-icon";
import { CroppedFileInput, type CroppedFileInputHandle } from "@/components/cropped-file-input";
import { SocialIcon, type SocialName } from "@/app/(web)/components/social-icon";
import { externalUrl } from "@/app/(web)/components/profile/profile-section";
import type { BusinessProfile, SocialLinks } from "@/app/business/apis/types";
import type { Country } from "@/app/geo/apis";
import { businessLocationLine, businessTypeLabel } from "../utils";

/**
 * V1's hero card (`BusinessProfilePage`'s Hero + `ProfileHero` on the public side): a 176px cover,
 * a square logo overlapping it by half, then category badge / name / location stacked beside the
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
  "flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground";

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

  const logoBox = "h-28 w-28 shrink-0 overflow-hidden rounded-lg border-4 border-background bg-muted shadow-lg";

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {previewMode ? (
        <div className="relative h-44 select-none">
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
          className="h-44 sm:h-44"
          coverUrl={profile.cover_url}
          onCoverFile={onCoverFile}
          coverUploading={coverUploading}
          logoUrl={profile.logo_url}
          logoFallback={initials || "B"}
          onLogoFile={onLogoFile}
          hideLogo
        />
      )}

      {/* `relative` is load-bearing: the cover above is positioned, so without a stacking context
          of its own this row paints *under* the part of the cover the logo overlaps. */}
      <div className="relative px-6 py-6">
        <div className="-mt-14 flex flex-col items-start gap-4 sm:flex-row">
          {previewMode ? (
            <div className={logoBox}>{logoImage}</div>
          ) : (
            <button type="button" className={`group relative ${logoBox} cursor-pointer`} onClick={() => logoPickerRef.current?.pick()} aria-label="Edit logo">
              {logoImage}
              <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                {logoUploading ? <Loader2 className="h-6 w-6 animate-spin text-white" /> : <Camera className="h-6 w-6 text-white" />}
              </span>
            </button>
          )}
          <CroppedFileInput ref={logoPickerRef} cropShape="square" onCropped={onLogoFile} isSaving={logoUploading} />

          {/* The logo overlaps the cover, so the details column carries its own top padding to
              line its text up beside the taller logo box. */}
          <div className="min-w-0 flex-1 pt-2 sm:pt-10">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 pt-0.5">
                {categoryLabel && (
                  <Badge variant="secondary" className="mb-1.5 gap-1.5">
                    <DynamicIcon name={profile.business_category_icon} fallback="Building2" className="h-3 w-3" />
                    {categoryLabel}
                  </Badge>
                )}
                <h1 className="text-2xl font-bold text-foreground">{profile.business_name}</h1>
                {locationLabel && (
                  <span className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />{locationLabel}
                  </span>
                )}
              </div>

              {/* V1 faded the edit pencil in only when the social row is hovered, so the icons
                  read as links first and an editable field second. */}
              <div className="group/social flex shrink-0 items-center gap-2 pt-1">
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
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
