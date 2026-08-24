"use client";

import { User, Mail } from "lucide-react";
import { PrivacyBadge } from "@/components/privacy-badge";
import { SectionCard, Field } from "./section-card";
import type { StudentProfile } from "../apis/types";

function formatDate(value: string | null) {
  return value ? value.split("T")[0] : null;
}

export function ProfileDetailsCards({
  profile,
  countryName,
  isSectionPublic,
  toggleVisibility,
  onEditPersonal,
  onEditContact,
}: Readonly<{
  profile: StudentProfile;
  countryName: (id: number | null) => string | null;
  isSectionPublic: (key: string, defaultPublic?: boolean) => boolean;
  toggleVisibility: (key: string, defaultPublic?: boolean) => void;
  onEditPersonal: () => void;
  onEditContact: () => void;
}>) {
  return (
    <>
      <SectionCard
        icon={User}
        title="Personal Details"
        badge={<PrivacyBadge isPublic={isSectionPublic("personal_details", false)} onToggle={() => toggleVisibility("personal_details", false)} />}
        onEdit={onEditPersonal}
      >
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Field label="Full Name" value={`${profile.first_name} ${profile.last_name}`} />
          <Field label="Date of Birth" value={formatDate(profile.date_of_birth)} />
          <Field label="Gender" value={profile.gender} />
          <Field label="Nationality" value={countryName(profile.nationality_id)} />
          <Field label="City of Residence" value={profile.city_of_residence} />
        </div>
      </SectionCard>

      <SectionCard
        icon={Mail}
        title="Contact Details"
        badge={<PrivacyBadge isPublic={isSectionPublic("contact_details", false)} onToggle={() => toggleVisibility("contact_details", false)} />}
        onEdit={onEditContact}
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Email" value={profile.email} />
          <Field label="Phone" value={profile.phone} />
          <Field
            label="Address"
            value={[profile.personal_address_street, profile.personal_address_city, profile.personal_address_state]
              .filter(Boolean)
              .join(", ")}
          />
          <Field label="Country" value={countryName(profile.personal_address_country_id)} />
        </div>
      </SectionCard>
    </>
  );
}
