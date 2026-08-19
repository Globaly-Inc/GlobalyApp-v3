import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getInstitutionBySlug, getInstitutionCourses } from "../../search/api";
import { CourseCard } from "../../search/components/course-card";
import { SearchEmptyState } from "../../search/components/search-empty-state";
import { SearchPagination } from "../../search/components/search-pagination";
import { InstitutionHero } from "./components/institution-hero";
import { InstitutionInfoCard } from "./components/institution-info-card";
import { InstitutionCourseSearch } from "./components/institution-course-search";

type InstitutionPageProps = Readonly<{
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string; search?: string }>;
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

export default async function InstitutionPage({ params, searchParams }: InstitutionPageProps) {
  const { slug } = await params;
  const { page: pageParam, search } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const institution = await getInstitutionBySlug(slug);
  if (!institution) notFound();

  const { data: courses, meta } = await getInstitutionCourses(slug, { page, search });

  return (
    <div>
      <InstitutionHero institution={institution} />

      <section className="py-8">
        <div className="container max-w-6xl mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 order-2 lg:order-1">
              <h2 className="text-lg font-semibold text-foreground mb-4">Courses at {institution.business_name}</h2>
              <div className="mb-4">
                <InstitutionCourseSearch slug={slug} search={search} />
              </div>

              {courses.length === 0 ? (
                <SearchEmptyState name="courses" />
              ) : (
                <div className="space-y-4">
                  {courses.map((course) => <CourseCard key={course.id} course={course} />)}
                </div>
              )}

              <SearchPagination
                meta={meta}
                page={page}
                query={search ? { search } : {}}
                pathname={`/institution/${slug}`}
              />
            </div>

            <div className="flex flex-col gap-4 order-1 lg:order-2">
              {institution.description && (
                <div className="rounded-xl border border-border bg-card p-5">
                  <h2 className="text-sm font-semibold text-foreground mb-3">About</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">{institution.description}</p>
                </div>
              )}
              <InstitutionInfoCard institution={institution} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
