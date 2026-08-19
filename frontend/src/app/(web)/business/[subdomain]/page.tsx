import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBusinessBySubdomain } from "../../search/api";
import { BusinessHero } from "./components/business-hero";
import { BusinessInfoCard } from "./components/business-info-card";
import { BusinessServicesSection } from "./components/business-services-section";
import { BusinessBranchesSection } from "./components/business-branches-section";
import { BusinessTeamSection } from "./components/business-team-section";
import { BusinessRepresentationsSection } from "./components/business-representations-section";

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

export default async function BusinessPage({ params }: BusinessPageProps) {
  const { subdomain } = await params;
  const business = await getBusinessBySubdomain(subdomain);
  if (!business) notFound();

  return (
    <div>
      <BusinessHero business={business} />

      <section className="py-10">
        <div className="container max-w-6xl mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className="rounded-xl border border-border bg-card p-6 h-full">
                <h2 className="text-lg font-bold text-foreground mb-3">About {business.business_name}</h2>
                {business.description ? (
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{business.description}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic leading-relaxed">
                    {business.business_name} hasn&apos;t added a description yet — reach out directly to learn more about what they offer.
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <BusinessInfoCard business={business} />
            </div>
          </div>
        </div>
      </section>

      <BusinessServicesSection services={business.services} />
      <BusinessBranchesSection branches={business.branches} />
      <BusinessTeamSection members={business.members} />
      <BusinessRepresentationsSection representations={business.representations} />
    </div>
  );
}
