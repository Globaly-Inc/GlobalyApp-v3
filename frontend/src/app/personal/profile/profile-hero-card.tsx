"use client";

import { useRef } from "react";
import { Camera, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { CoverLogoEditor } from "@/components/cover-logo-editor";
import { flagEmoji } from "@/components/ui/phone-input";
import type { Country } from "@/app/geo/apis";
import type { StudentProfile } from "../apis/types";

/** Photo sits beside the name/email, same layout as the business profile hero. */
export function ProfileHeroCard({
  profile,
  initial,
  imageUploading,
  onImageFile,
  countries,
}: Readonly<{
  profile: StudentProfile;
  initial: string;
  imageUploading: "profile" | "cover" | null;
  onImageFile: (category: "profile" | "cover", file: File) => void;
  countries: Country[];
}>) {
  const country = countries.find((c) => c.id === profile.personal_address_country_id) ?? null;
  const photoInputRef = useRef<HTMLInputElement>(null);
  const photoUploading = imageUploading === "profile";

  const handlePhotoPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onImageFile("profile", file);
  };

  return (
    <div className="overflow-hidden rounded-lg border bg-card text-card-foreground">
      <CoverLogoEditor
        className="h-40 sm:h-48"
        coverUrl={profile.cover_url}
        onCoverFile={(file) => onImageFile("cover", file)}
        coverUploading={imageUploading === "cover"}
        logoUrl={profile.photo_url}
        logoFallback={initial}
        onLogoFile={(file) => onImageFile("profile", file)}
        hideLogo
      />
      <CardContent>
        <div className="flex items-start gap-4 -mt-14">
          <div className="relative h-28 w-28 shrink-0 left-5">
            <button
              type="button"
              className="group size-28 cursor-pointer"
              onClick={() => photoInputRef.current?.click()}
              aria-label="Edit photo"
            >
              <Avatar className="size-28 rounded-xl border-4 border-background shadow-lg">
                {profile.photo_url && (
                  <AvatarImage src={profile.photo_url} alt="" className="rounded-lg object-cover" />
                )}
                <AvatarFallback className="rounded-lg text-2xl">{initial}</AvatarFallback>
              </Avatar>
              <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/0 opacity-0 transition-opacity group-hover:bg-black/40 group-hover:opacity-100">
                {photoUploading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                ) : (
                  <Camera className="h-5 w-5 text-white" />
                )}
              </span>
            </button>
            <input ref={photoInputRef} type="file" accept="image/*" hidden onChange={handlePhotoPick} />
          </div>
          <div className="pt-4 sm:pt-14 ml-4 m-4">
            <h1 className="text-xl font-bold text-foreground">
              {profile.first_name} {profile.last_name}
            </h1>
            <p className="text-sm text-muted-foreground">{profile.email}</p>
            {country && (
              <p className="text-sm text-muted-foreground">
                {flagEmoji(country.iso2)} From {country.name}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </div>
  );
}
