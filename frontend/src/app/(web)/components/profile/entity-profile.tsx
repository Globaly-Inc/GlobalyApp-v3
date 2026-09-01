import { Info, ShieldCheck } from "lucide-react";
import { ProfileHero } from "./profile-hero";
import { ProfileSection } from "./profile-section";
import { ProfileContactCard } from "./profile-contact-card";
import { ProfileLocationsCard } from "./profile-locations-card";
import { ProfileGallery } from "./profile-gallery";
import type { ProfileData } from "./profile-data";

/**
 * The public profile shell shared by institutions, education counselors, visa services and migration
 * education counselors — V1's BusinessPublicPreview layout: hero card, then a two-column body with About,
 * caller-supplied sections and Locations on the left, contact/registration and caller-supplied
 * cards on the right.
 */
export function EntityProfile({
  data, breadcrumb, children, sidebar,
}: Readonly<{
  data: ProfileData;
  breadcrumb?: React.ReactNode;
  /** Extra main-column sections, rendered between About and Locations. */
  children?: React.ReactNode;
  /** Extra sidebar cards, rendered under Contact Details and Registration. */
  sidebar?: React.ReactNode;
}>) {
  return (
    <div className="container mx-auto max-w-6xl space-y-4 px-4 py-6 md:space-y-6">
      {breadcrumb}
      <ProfileHero data={data} />

      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-3">
        <div className="space-y-4 md:space-y-6 lg:col-span-2">
          <ProfileSection icon={Info} title={`About ${data.name}`}>
            {data.description ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{data.description}</p>
            ) : (
              <p className="text-sm italic text-muted-foreground">No description available.</p>
            )}
          </ProfileSection>

          {children}

          <ProfileLocationsCard locations={data.locations} />

          <ProfileGallery items={data.gallery} />
        </div>

        <div className="space-y-4 md:space-y-6">
          <ProfileContactCard data={data} />

          {data.registration.length > 0 && (
            <ProfileSection icon={ShieldCheck} title="Registration & Licenses">
              <div className="space-y-3">
                {data.registration.map((row) => (
                  <div key={`${row.label}-${row.value}`} className="flex justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="font-medium text-foreground">{row.value}</span>
                  </div>
                ))}
              </div>
            </ProfileSection>
          )}

          {sidebar}
        </div>
      </div>
    </div>
  );
}
