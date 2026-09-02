"use client";

import { User, Mail } from "lucide-react";
import { PrivacyBadge } from "@/components/privacy-badge";
import { Button } from "@/components/ui/button";
import { flagEmoji } from "@/components/ui/phone-input";
import { SectionCard, Field } from "./section-card";
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
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
          <Field label="Full Name" value={`${profile.first_name} ${profile.last_name}`} />
          <Field label="Date of Birth" value={formatDate(profile.date_of_birth)} />
          <Field label="Gender" value={profile.gender} />
          <Field label="Nationality" value={countryName(profile.nationality_id)} />
        </div>
      </SectionCard>

      <SectionCard icon={Mail} title="Contact Details" badge={<PrivacyBadge isPublic={false} />} onEdit={onEditContact}>
        <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Email</p>
            <div className="mt-0.5 flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">{profile.email}</p>
              <Button variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={onEditContact}>
                Change
              </Button>
            </div>
          </div>
          <Field
            label="Phone"
            value={profile.phone ? `${addressCountry ? flagEmoji(addressCountry.iso2) : ""} ${profile.phone}` : null}
          />
        </div>
        {fullAddress && (
          <div className="mt-3">
            <Field
              label="Personal Address"
              value={
                <>
                  {addressCountry && `${flagEmoji(addressCountry.iso2)} `}
                  {fullAddress}
                </>
              }
            />
          </div>
        )}
      </SectionCard>
    </>
  );
}
