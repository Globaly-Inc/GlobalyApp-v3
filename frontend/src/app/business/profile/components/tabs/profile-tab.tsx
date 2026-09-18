"use client";

import type { BusinessProfile } from "@/app/business/apis/types";
import type { Country } from "@/app/geo/apis";
import { ContactDetailsCard } from "../contact-details-card";
import { DefaultCurrencyCard } from "../default-currency-card";
import { GeneralInformationCard } from "../general-information-card";
import { MediaCard } from "../media-card";
import { ProfileLocationsSection } from "../profile-locations-section";
import { RegistrationLicensesCard } from "../registration-licenses-card";
import { TeamMembersCard } from "../team-members-card";

/**
 * V1's business profile body: a 2/3 + 1/3 grid, About/Locations/Media down the main column and
 * contact, currency, registration and team down the sidebar. Every card edits in place — the
 * pencil swaps that card's body for its own form, so there is no profile-wide dialog.
 *
 * Social links are not a card here: V1 put them in the hero, and `<ProfileHeaderCard>` does too.
 */
export function ProfileTab({
  profile,
  countries,
  readOnly = false,
  isInstitution = false,
}: Readonly<{
  profile: BusinessProfile;
  countries: Country[];
  readOnly?: boolean;
  /**
   * Institutions have no branch records and no access to the AI-assist endpoint, and they carry
   * an ownership sector (`institution_type`) that businesses don't.
   */
  isInstitution?: boolean;
}>) {
  return (
    <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-3">
      {/* ── Main column (2/3) ── */}
      <div className="space-y-4 md:space-y-6 lg:col-span-2">
        <GeneralInformationCard profile={profile} readOnly={readOnly} isInstitution={isInstitution} />
        <ProfileLocationsSection profile={profile} countries={countries} readOnly={readOnly} hasBranches={!isInstitution} />
        <MediaCard profile={profile} readOnly={readOnly} />
      </div>

      {/* ── Sidebar (1/3) ── */}
      <div className="space-y-4 md:space-y-6">
        <ContactDetailsCard profile={profile} countries={countries} readOnly={readOnly} />
        <DefaultCurrencyCard profile={profile} countries={countries} readOnly={readOnly} />
        <RegistrationLicensesCard profile={profile} countries={countries} readOnly={readOnly} />
        <TeamMembersCard profile={profile} readOnly={readOnly} />
      </div>
    </div>
  );
}
