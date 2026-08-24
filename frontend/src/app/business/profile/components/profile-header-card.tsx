"use client";

import { useRef } from "react";
import { BadgeCheck, Camera, Globe, Loader2, Pencil } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CoverLogoEditor } from "@/components/cover-logo-editor";
import type { BusinessProfile } from "@/app/business/apis/types";
import type { Country } from "@/app/geo/apis";
import { businessLocationLine, businessTypeLabel } from "./tabs/profile-tab";

/**
 * Cover + logo + name/category/location, all in one row — the logo sits beside the details rather than
 * above them, matching the reference design. The logo visually overlaps the cover (pulled up via negative
 * margin) exactly like the public business page's hero.
 */
export function ProfileHeaderCard({
  profile,
  countries,
  previewMode,
  onCoverFile,
  coverUploading,
  onLogoFile,
  logoUploading,
  onEditDetails,
}: Readonly<{
  profile: BusinessProfile;
  countries: Country[];
  previewMode: boolean;
  onCoverFile: (file: File) => void;
  coverUploading: boolean;
  onLogoFile: (file: File) => void;
  logoUploading: boolean;
  onEditDetails: () => void;
}>) {
  const logoInputRef = useRef<HTMLInputElement>(null);
  const initial = profile.business_name?.[0]?.toUpperCase() ?? "B";

  const handleLogoPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onLogoFile(file);
  };

  const logo = (
    <div className="relative h-28 w-28 shrink-0 left-5">
      {previewMode ? (
        <Avatar className="size-28 rounded-xl border-4 border-background">
          {profile.logo_url && <AvatarImage src={profile.logo_url} alt="" className="rounded-lg object-contain p-1" />}
          <AvatarFallback className="rounded-lg text-2xl">{initial}</AvatarFallback>
        </Avatar>
      ) : (
        <button
          type="button"
          className="group size-28 cursor-pointer"
          onClick={() => logoInputRef.current?.click()}
          aria-label="Edit logo"
        >
          <Avatar className="size-28 rounded-xl border-4 border-background">
            {profile.logo_url && <AvatarImage src={profile.logo_url} alt="" className="rounded-lg object-contain p-1" />}
            <AvatarFallback className="rounded-lg text-2xl">{initial}</AvatarFallback>
          </Avatar>
          <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/0 opacity-0 transition-opacity group-hover:bg-black/40 group-hover:opacity-100">
            {logoUploading ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : <Camera className="h-5 w-5 text-white" />}
          </span>
        </button>
      )}
      <input ref={logoInputRef} type="file" accept="image/*" hidden onChange={handleLogoPick} />
    </div>
  );

  return (
    <div className="overflow-hidden rounded-lg border">
      {previewMode ? (
        <div className="relative h-40 bg-linear-to-br from-primary to-primary/60 sm:h-48">
          {profile.cover_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.cover_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
        </div>
      ) : (
        <CoverLogoEditor
          coverUrl={profile.cover_url}
          onCoverFile={onCoverFile}
          coverUploading={coverUploading}
          logoUrl={profile.logo_url}
          logoFallback={initial}
          onLogoFile={onLogoFile}
          hideLogo
        />
      )}

      <CardContent>
        <div className="flex items-start gap-4 -mt-14">
          {logo}
          <div className="flex flex-1 items-start justify-between gap-2 pt-4 sm:pt-14 ml-4 m-4">
            <div>
              <div className="mb-1 flex items-center gap-1.5">
                {businessTypeLabel(profile.business_type) && (
                  <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {businessTypeLabel(profile.business_type)}
                  </span>
                )}
                {previewMode && profile.is_published && (
                  <Badge variant="secondary" className="gap-1 text-[11px]">
                    <BadgeCheck className="h-3 w-3" /> Verified
                  </Badge>
                )}
              </div>
              <h1 className="text-xl font-bold text-foreground">{profile.business_name}</h1>
              <p className="text-sm text-muted-foreground">
                {businessLocationLine(profile, countries) ?? profile.subdomain}
              </p>
            </div>
            {previewMode ? (
              <Globe className="h-4 w-4 text-muted-foreground" aria-hidden />
            ) : (
              <Button variant="ghost" size="icon-sm" onClick={onEditDetails} aria-label="Edit business details">
                <Pencil className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </div>
  );
}
