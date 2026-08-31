import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCourseBySlug, getTests } from "../../search/api";
import { ProfileLocationsCard } from "../../components/profile/profile-locations-card";
import { ProfileGallery, type GalleryItem } from "../../components/profile/profile-gallery";
import type { ProfileLocation } from "../../components/profile/profile-data";
import type { CourseDetail } from "../../search/types";
import { CourseHero } from "./components/course-hero";
import { CourseStats } from "./components/course-stats";
import { CourseDescription } from "./components/course-description";
import { CourseFeeCard } from "./components/course-fee-card";
import { CourseIntakesCard } from "./components/course-intakes-card";
import { CourseWeatherCard } from "./components/course-weather-card";
import { CourseAwardedByCard, CourseConnectCard } from "./components/course-sidebar";
import { CourseEntryRequirementsCard } from "./components/course-entry-requirements-card";
import { PageViews } from "../../components/page-views";

type CoursePageProps = Readonly<{ params: Promise<{ slug: string }> }>;

export async function generateMetadata({ params }: CoursePageProps): Promise<Metadata> {
  const { slug } = await params;
  const course = await getCourseBySlug(slug);
  if (!course) return { title: "Course — Globaly" };
  return {
    title: `${course.name} — Globaly`,
    description: course.description?.slice(0, 155) ?? `View ${course.name} details on Globaly.`,
  };
}

/** Where the course is taught — the awarding institution's campuses, same card the profile uses. */
function toLocations(course: CourseDetail): ProfileLocation[] {
  return course.campuses.map((campus) => ({
    id: campus.id,
    name: campus.name || course.institution?.name || course.name,
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

function toGalleryItems(course: CourseDetail): GalleryItem[] {
  return (course.institution?.gallery_image_urls ?? [])
    .filter(Boolean)
    .map((url) => ({ type: "image" as const, url }));
}

export default async function CoursePage({ params }: CoursePageProps) {
  const { slug } = await params;
  const [course, tests] = await Promise.all([getCourseBySlug(slug), getTests()]);
  if (!course) notFound();

  return (
    <div className="container mx-auto max-w-6xl space-y-4 px-4 py-6 md:space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          <Link href="/" className="hover:text-primary">Home</Link> /{" "}
          <Link href="/search?tab=courses" className="hover:text-primary">Courses</Link> / {course.name}
        </p>
        <PageViews type="course" id={course.id} className="shrink-0" />
      </div>

      <CourseHero course={course} />
      <CourseStats course={course} />

      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-3">
        <div className="space-y-4 md:space-y-6 lg:col-span-2">
          <CourseDescription description={course.description} />
          <CourseFeeCard course={course} />
          <CourseIntakesCard intakes={course.intakes} />
          <ProfileLocationsCard locations={toLocations(course)} cityLink={course.city_link} />
          <CourseWeatherCard weather={course.weather} countryName={course.country_name} />
          <ProfileGallery items={toGalleryItems(course)} />
        </div>

        <div className="space-y-4 md:space-y-6">
          <CourseAwardedByCard course={course} />
          <CourseConnectCard institution={course.institution} />
          {/* Anchor target for the hero CTA and the search card's Eligibility button. */}
          <div id="eligibility" className="scroll-mt-24">
            <CourseEntryRequirementsCard eligibility={course.eligibility} englishRequirements={course.englishRequirements} tests={tests} />
          </div>
        </div>
      </div>
    </div>
  );
}
