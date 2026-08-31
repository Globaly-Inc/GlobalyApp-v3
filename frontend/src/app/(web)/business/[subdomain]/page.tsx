import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBusinessBySubdomain } from "../../search/api";
import { EntityProfile } from "../../components/profile/entity-profile";
import {
  joinParts, toNumber, toProfileRegistration, toProfileSocials, type ProfileData,
} from "../../components/profile/profile-data";
import type { BusinessDetail } from "../../search/types";
import { BusinessServicesSection } from "./components/business-services-section";
import { BusinessTeamSection } from "./components/business-team-section";
import { BusinessRepresentationsSection } from "./components/business-representations-section";
import { PageViews } from "../../components/page-views";

type BusinessPageProps = Readonly<{ params: Promise<{ subdomain: string }> }>;

export async function generateMetadata({ params }: BusinessPageProps): Promise<Metadata> {
  const { subdomain } = await params;
  const business = await getBusinessBySubdomain(subdomain);
  if (!business) return { title: "Business — Globaly" };
  return {
    title: `${business.business_name} — Globaly`,
    description: business.description?.slice(0, 155) ?? `View ${business.business_name} on Globaly.`,
  };
}

function toProfileData(business: BusinessDetail): ProfileData {
  const headOffice = business.address || business.city
    ? [{
      id: `business-${business.id}`,
      name: business.business_name,
      address: business.address,
      city: business.city,
      state: business.state,
      country: business.country_name,
      email: business.email,
      phone: business.phone,
      latitude: toNumber(business.latitude),
      longitude: toNumber(business.longitude),
    }]
    : [];

  return {
    name: business.business_name,
    categoryLabel: business.category_name,
    logoUrl: business.logo_url,
    coverUrl: business.cover_url,
    locationLabel: joinParts(business.city, business.state, business.country_name),
    verified: business.status === "verified",
    description: business.description,
    website: business.website,
    email: business.email,
    phone: business.phone,
    addressLabel: joinParts(business.address, business.city, business.state, business.postcode, business.country_name),
    socials: toProfileSocials(business),
    // Head office first, then every branch — the Locations card groups them by city itself.
    locations: [
      ...headOffice,
      ...business.branches.map((branch) => ({
        id: branch.id,
        name: branch.name,
        address: branch.address,
        city: branch.city,
        state: branch.state,
        country: branch.country,
        email: branch.email,
        phone: branch.phone,
        latitude: null,
        longitude: null,
      })),
    ],
    registration: toProfileRegistration(business.business_registration_number, business.registration_licenses),
  };
}

export default async function BusinessPage({ params }: BusinessPageProps) {
  const { subdomain } = await params;
  const business = await getBusinessBySubdomain(subdomain);
  if (!business) notFound();

  return (
    <EntityProfile
      data={toProfileData(business)}
      breadcrumb={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            <Link href="/" className="hover:text-primary">Home</Link> /{" "}
            <Link href="/search" className="hover:text-primary">Search</Link> / {business.business_name}
          </p>
          <PageViews type="business" id={business.id} className="shrink-0" />
        </div>
      }
      sidebar={
        <>
          <BusinessRepresentationsSection representations={business.representations} />
          <BusinessTeamSection members={business.members} />
        </>
      }
    >
      <BusinessServicesSection services={business.services} />
    </EntityProfile>
  );
}
