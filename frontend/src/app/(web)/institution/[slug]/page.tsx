import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Info } from "lucide-react";
import { getInstitutionBySlug, getInstitutionCourses } from "../../search/api";
import { ProfileHero } from "../../components/profile/profile-hero";
import { ProfileSection } from "../../components/profile/profile-section";
import { ProfileContactCard } from "../../components/profile/profile-contact-card";
import { ProfileLocationsCard } from "../../components/profile/profile-locations-card";
import {
  joinParts, toGalleryItems, toProfileSocials, type ProfileData, type ProfileLocation,
} from "../../components/profile/profile-data";
import type { InstitutionDetail } from "../../search/types";
import { InstitutionStats } from "./components/institution-stats";
import { InstitutionSubjectAreas } from "./components/institution-subject-areas";
import { InstitutionCoursesSection } from "./components/institution-courses-section";
import { ProfileGallery } from "../../components/profile/profile-gallery";
import { InstitutionTeamCard } from "./components/institution-sidebar";
import { PageViews } from "../../components/page-views";

type InstitutionPageProps = Readonly<{
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string; search?: string; level?: string }>;
}>;

export async function generateMetadata({ params }: InstitutionPageProps): Promise<Metadata> {
  const { slug } = await params;
  const institution = await getInstitutionBySlug(slug);
  if (!institution) return { title: "Institution — Globaly" };
  return {
    title: `${institution.business_name} — Globaly`,
    description: institution.description?.slice(0, 155) ?? `View ${institution.business_name} on Globaly.`,
  };
}

/**
 * Scraped campuses are the institution's locations. An institution registered by hand has none,
 * so its own address stands in as the single campus rather than leaving the map card empty.
 */
function toLocations(institution: InstitutionDetail): ProfileLocation[] {
  if (institution.campuses.length > 0) {
    return institution.campuses.map((campus) => ({
      id: campus.id,
      name: campus.name || institution.business_name,
      address: campus.address,
      city: campus.city,
      state: campus.state,
      country: campus.country,
      email: campus.email,
      phone: campus.phone,
      latitude: null,
      longitude: null,
    }));
  }

  if (!institution.address && !institution.city) return [];
  return [{
    id: String(institution.id),
    name: institution.business_name,
    address: institution.address,
    city: institution.city,
    state: institution.state,
    country: institution.country_name,
    email: institution.email,
    phone: institution.phone,
    latitude: null,
    longitude: null,
  }];
}

function toProfileData(institution: InstitutionDetail): ProfileData {
  return {
    name: institution.business_name,
    categoryLabel: institution.category_name ?? "Institution",
    logoUrl: institution.logo_url,
    coverUrl: institution.cover_url,
    locationLabel: joinParts(institution.city, institution.state, institution.country_name),
    verified: institution.status === "verified",
    description: institution.description,
    website: institution.website,
    email: institution.email,
    phone: institution.phone,
    addressLabel: joinParts(
      institution.address, institution.city, institution.state, institution.postcode, institution.country_name,
    ),
    socials: toProfileSocials(institution),
    locations: toLocations(institution),
    // The profile no longer surfaces a Registration & Licenses card.
    registration: [],
    gallery: toGalleryItems(institution.gallery_image_urls, institution.video_urls),
  };
}

export default async function InstitutionPage({ params, searchParams }: InstitutionPageProps) {
  const { slug } = await params;
  const { page: pageParam, search, level } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const institution = await getInstitutionBySlug(slug);
  if (!institution) notFound();

  const { data: courses, meta } = await getInstitutionCourses(slug, { page, search, degree_level: level });
  const profile = toProfileData(institution);
  // The stats and the subject grid count the whole catalog; `meta.total` counts only the
  // level/search currently shown.
  const totalCourses = institution.course_count ?? meta.total;

  return (
    <div className="container mx-auto max-w-6xl space-y-4 px-4 py-6 md:space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          <Link href="/" className="hover:text-primary">Home</Link> /{" "}
          <Link href="/search?tab=institutions" className="hover:text-primary">Institutions</Link> / {institution.business_name}
        </p>
        <PageViews type="institution" id={institution.id} className="shrink-0" />
      </div>

      <ProfileHero data={profile} />

      <InstitutionStats
        courseCount={totalCourses}
        subjectAreaCount={institution.subject_areas.length}
        degreeLevelCount={institution.degree_levels.length}
        campusCount={profile.locations.length}
      />

      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-3">
        <div className="space-y-4 md:space-y-6 lg:col-span-2">
          <ProfileSection icon={Info} title={`About ${institution.business_name}`}>
            {institution.description ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{institution.description}</p>
            ) : (
              <p className="text-sm italic text-muted-foreground">No description available.</p>
            )}
          </ProfileSection>

          <InstitutionSubjectAreas areas={institution.subject_areas} courseCount={totalCourses} />

          <InstitutionCoursesSection
            slug={slug}
            courses={courses}
            meta={meta}
            page={page}
            search={search}
            level={level}
            levels={institution.degree_levels}
            total={totalCourses}
          />

          <ProfileLocationsCard locations={profile.locations} />

          <ProfileGallery items={profile.gallery} />
        </div>

        <div className="space-y-4 md:space-y-6">
          <ProfileContactCard data={profile} />
          <InstitutionTeamCard members={institution.members} />
        </div>
      </div>
    </div>
  );
}
