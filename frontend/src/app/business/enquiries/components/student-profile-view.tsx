"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, User } from "lucide-react";
import { DetailHeaderCard } from "@/components/detail-header-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BackButton } from "@/components/ui/back-button";
import { Card, CardContent } from "@/components/ui/card";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { flagEmoji } from "@/components/ui/phone-input";
import { geoApi, type Country } from "@/app/geo/apis";
import { businessEnquiriesApi } from "../apis";
import type { DistributionListItem, UnlockedStudentProfile } from "../apis";
import { EligibilityBadge } from "./eligibility-badge";
import { EnquiryStatusBadge } from "./enquiry-status-badge";
import { StudentProfileMain } from "./student-profile-main";
import { StudentProfileSidebar } from "./student-profile-sidebar";

const BACK = <BackButton href="/business/enquiries" label="Back to enquiries" />;

/**
 * The student behind one unlocked enquiry, as a full page, on the C3 detail layout: PageHeader,
 * a read-only cover/photo card, then a two-thirds/one-third split — Personal Details and the record
 * sections on the left, contact and Course Requirements on the right. The record sections keep the
 * student's own profile-details-cards.tsx composition, so a business and a student looking at the
 * same person read the same sections.
 */
export function StudentProfileView({ distributionId }: Readonly<{ distributionId: string }>) {
  const [profile, setProfile] = useState<UnlockedStudentProfile | null>(null);
  const [item, setItem] = useState<DistributionListItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countries, setCountries] = useState<Country[]>([]);

  useEffect(() => {
    let active = true;
    businessEnquiriesApi
      .getStudentProfile(distributionId)
      .then((p) => active && setProfile(p))
      .catch((e: Error) => active && setError(e.message));
    // The criteria live on the list item, not the profile — the verdict belongs to the enquiry.
    // Best-effort: a failure here costs the requirements card, not the page.
    businessEnquiriesApi
      .listDistributions()
      .then(({ data }) => active && setItem(data.find((r) => r.distribution_id === distributionId) ?? null))
      .catch(() => {});
    geoApi.getCountries().then((c) => active && setCountries(c)).catch(() => {});
    return () => {
      active = false;
    };
  }, [distributionId]);

  const p = profile?.profile ?? null;
  const name = profile ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() : "";
  const country = (id?: number | null) => countries.find((c) => c.id === id) ?? null;
  const countryName = (id?: number | null) => country(id)?.name ?? null;
  const nationality = country(p?.nationality_id);

  if (error) {
    return (
      <PageBody>
        <PageHeader leading={BACK} title="Student" />
        <Alert variant="destructive">
          <AlertTitle>{error}</AlertTitle>
          {/* The most likely cause by far, and the agent can act on it themselves. */}
          <AlertDescription>
            A student&apos;s profile is only available once your organisation has unlocked their enquiry.
          </AlertDescription>
        </Alert>
      </PageBody>
    );
  }

  if (!profile) {
    return (
      <PageBody>
        <PageHeader leading={BACK} title="Student" />
        <Card>
          <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Loading profile…
          </CardContent>
        </Card>
      </PageBody>
    );
  }

  const enquiryLine = [item?.course_name, item?.institution_name].filter(Boolean).join(" · ");

  return (
    <PageBody>
      <PageHeader
        leading={BACK}
        title={name || "Student"}
        badges={
          item && (
            <>
              <EnquiryStatusBadge status={item.status} />
              <EligibilityBadge status={item.eligibility_status} />
            </>
          )
        }
        subtitle={enquiryLine || undefined}
      />

      {/* Read-only on purpose: no upload handlers, because a business must never be offered a way to
          change a student's photo. */}
      <DetailHeaderCard coverUrl={profile.cover_url} logoUrl={profile.photo_url} logoFallback={name ? name.charAt(0).toUpperCase() : <User className="size-8" aria-hidden />} roundPhoto>
        {nationality && <p>From {nationality.name}</p>}
        {p?.city_of_residence && (
          <p>
            {nationality && `${flagEmoji(nationality.iso2)} `}
            {p.city_of_residence}
            {countryName(p.country_of_residence_id) ? `, ${countryName(p.country_of_residence_id)}` : ""}
          </p>
        )}
      </DetailHeaderCard>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <StudentProfileMain profile={profile} name={name} nationalityName={nationality?.name} countryName={countryName} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <StudentProfileSidebar profile={profile} item={item} addressCountry={countryName(p?.personal_address_country_id)} />
        </div>
      </div>
    </PageBody>
  );
}
