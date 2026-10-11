"use client";

import { User, Mail } from "lucide-react";
import { PrivacyBadge } from "@/components/privacy-badge";
import { Button } from "@/components/ui/button";
import { flagEmoji } from "@/components/ui/phone-input";
import { DescriptionItem, DescriptionList } from "@/components/ui/description-list";
import { SectionCard } from "./section-card";
import type { Country } from "@/app/geo/apis";
import type { StudentProfile } from "../apis/types";

function formatDate(value: string | null) {
  return value ? value.split("T")[0] : null;
}

export function ProfileDetailsCards({
  profile,
  countryName,
  countries,
  isSectionPublic,
  toggleVisibility,
  readOnly = false,
  onEditPersonal,
  onEditContact,
}: Readonly<{
  profile: StudentProfile;
  countryName: (id: number | null) => string | null;
  countries: Country[];
  isSectionPublic: (key: string, defaultPublic?: boolean) => boolean;
  toggleVisibility: (key: string, defaultPublic?: boolean) => void;
  /** Preview mode: no edit pencils or "Change" button. */
  readOnly?: boolean;
  onEditPersonal: () => void;
  onEditContact: () => void;
}>) {
  const addressCountry = countries.find((c) => c.id === profile.personal_address_country_id) ?? null;
  const fullAddress = [
    profile.personal_address_street,
    profile.personal_address_city,
    profile.personal_address_state,
    addressCountry?.name,
    profile.personal_address_postcode,
  ]
    .filter(Boolean)
    .join(", ");

  if (readOnly) return null;

  return (
    <>
      <SectionCard icon={User} title="Personal Details" badge={<PrivacyBadge isPublic={false} />} onEdit={onEditPersonal}>
        <DescriptionList>
          <DescriptionItem label="Full Name">{`${profile.first_name} ${profile.last_name}`}</DescriptionItem>
          <DescriptionItem label="Date of Birth">{formatDate(profile.date_of_birth) || "—"}</DescriptionItem>
          <DescriptionItem label="Gender">{profile.gender || "—"}</DescriptionItem>
          <DescriptionItem label="Nationality">{countryName(profile.nationality_id) || "—"}</DescriptionItem>
        </DescriptionList>
      </SectionCard>

      <SectionCard icon={Mail} title="Contact Details" badge={<PrivacyBadge isPublic={false} />} onEdit={onEditContact}>
        <DescriptionList>
          <DescriptionItem label="Email">
            <span className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 break-all">{profile.email}</span>
              <Button variant="outline" size="xs" onClick={onEditContact}>
                Change
              </Button>
            </span>
          </DescriptionItem>
          <DescriptionItem label="Phone">
            {profile.phone ? `${addressCountry ? flagEmoji(addressCountry.iso2) : ""} ${profile.phone}` : "—"}
          </DescriptionItem>
          {fullAddress && (
            <DescriptionItem label="Personal Address" wide>
              {addressCountry && `${flagEmoji(addressCountry.iso2)} `}
              {fullAddress}
            </DescriptionItem>
          )}
        </DescriptionList>
      </SectionCard>
    </>
  );
}
