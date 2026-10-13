"use client";

import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { PageHeader } from "@/components/ui/page-header";
import { DetailHeaderCard } from "@/components/detail-header-card";
import { flagEmoji } from "@/components/ui/phone-input";
import { SHOW_PERSONAL_PORTAL } from "../const";
import type { Country } from "@/app/geo/apis";
import type { StudentProfile } from "../apis/types";

/** Name in the page header, then the cover + round photo card (photo/cover editable unless previewing). */
export function ProfileHeroCard({
  profile,
  initial,
  imageUploading,
  onImageFile,
  countries,
  readOnly = false,
}: Readonly<{
  profile: StudentProfile;
  initial: string;
  imageUploading: "profile" | "cover" | null;
  onImageFile: (category: "profile" | "cover", file: File) => void;
  countries: Country[];
  /** Preview mode: no cover/photo edit affordances, and the back arrow returns to editing. */
  readOnly?: boolean;
}>) {
  const router = useRouter();
  const nationality = countries.find((c) => c.id === profile.nationality_id) ?? null;
  const addressCountry = countries.find((c) => c.id === profile.personal_address_country_id) ?? null;
  const hasLocation = !!(profile.personal_address_city || addressCountry);

  // With the Personal Portal's own nav hidden (short release), the plain back arrow is the only way
  // back to wherever the profile was opened from — the business portal, admin, or the site.
  let leading: React.ReactNode = null;
  if (readOnly) leading = <BackButton href="/personal/profile" label="Back to Profile Editing" />;
  else if (!SHOW_PERSONAL_PORTAL) {
    leading = (
      <BackButton onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))} label="Back" />
    );
  }

  return (
    <>
      <PageHeader
        leading={leading}
        title={`${profile.first_name} ${profile.last_name}`}
        subtitle={nationality ? `From ${nationality.name}` : undefined}
      />
      <DetailHeaderCard
        coverUrl={profile.cover_url}
        logoUrl={profile.photo_url}
        logoFallback={initial}
        roundPhoto
        onCoverFile={readOnly ? undefined : (file) => onImageFile("cover", file)}
        onLogoFile={readOnly ? undefined : (file) => onImageFile("profile", file)}
        uploading={imageUploading === "profile" ? "logo" : imageUploading}
      >
        {hasLocation && (
          <p className="flex items-center gap-1.5">
            {addressCountry ? <span aria-hidden>{flagEmoji(addressCountry.iso2)}</span> : <MapPin className="size-4" />}
            {[profile.personal_address_city, addressCountry?.name].filter(Boolean).join(", ")}
          </p>
        )}
      </DetailHeaderCard>
    </>
  );
}
