import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getVisaServiceProviderBySlug } from "../../search/api";
import { EntityProfile } from "../../components/profile/entity-profile";
import { PageViews } from "../../components/page-views";
import { joinParts, type ProfileData, type ProfileRegistration } from "../../components/profile/profile-data";
import type { VisaServiceProviderDetail } from "../../search/types";
import { VisaServicesSection } from "./components/visa-services-section";

type VisaServicePageProps = Readonly<{ params: Promise<{ slug: string }> }>;

export async function generateMetadata({ params }: VisaServicePageProps): Promise<Metadata> {
  const { slug } = await params;
  const provider = await getVisaServiceProviderBySlug(slug);
  if (!provider) return { title: "Visa Service — Globaly" };
  return {
    title: `${provider.business_name} — Globaly`,
    description: provider.description?.slice(0, 155) ?? `View ${provider.business_name} on Globaly.`,
  };
}

/** Registration data lives on the individual scraped services, not on the provider row. */
function registrationRows(provider: VisaServiceProviderDetail): ProfileRegistration[] {
  const registered = provider.services.find((s) => s.registration_number);
  if (!registered) return [];

  const rows: ProfileRegistration[] = [
    { label: registered.registration_body || "Registration", value: registered.registration_number! },
  ];
  if (registered.registration_status) rows.push({ label: "Status", value: registered.registration_status });
  // A `date` column, so it arrives as an ISO timestamp — only the calendar day is meaningful.
  if (registered.registration_expiry) rows.push({ label: "Expires", value: registered.registration_expiry.slice(0, 10) });
  return rows;
}

function toProfileData(provider: VisaServiceProviderDetail): ProfileData {
  const hasLocation = Boolean(provider.address || provider.city);
  return {
    name: provider.business_name,
    categoryLabel: "Visa Services",
    logoUrl: provider.logo_url,
    coverUrl: null,
    locationLabel: joinParts(provider.city, provider.state, provider.country_name),
    // Scraped listings are unclaimed catalog entries — nothing here has been verified by an owner.
    verified: false,
    description: provider.description,
    website: provider.website ?? provider.source_url,
    email: provider.email,
    phone: provider.phone,
    addressLabel: joinParts(provider.address, provider.city, provider.state, provider.country_name),
    socials: [],
    locations: hasLocation
      ? [{
        id: provider.id,
        name: provider.business_name,
        address: provider.address,
        city: provider.city,
        state: provider.state,
        country: provider.country_name,
        email: provider.email,
        phone: provider.phone,
        latitude: null,
        longitude: null,
      }]
      : [],
    registration: registrationRows(provider),
  };
}

export default async function VisaServicePage({ params }: VisaServicePageProps) {
  const { slug } = await params;
  const provider = await getVisaServiceProviderBySlug(slug);
  if (!provider) notFound();

  return (
    <EntityProfile
      data={toProfileData(provider)}
      breadcrumb={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            <Link href="/" className="hover:text-primary">Home</Link> /{" "}
            <Link href="/search?tab=visa-services" className="hover:text-primary">Visa Services</Link> / {provider.business_name}
          </p>
          <PageViews type="visa-service" id={provider.id} className="shrink-0" />
        </div>
      }
    >
      <VisaServicesSection services={provider.services} />
    </EntityProfile>
  );
}
