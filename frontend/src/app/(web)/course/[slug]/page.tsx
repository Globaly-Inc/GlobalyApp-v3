import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCourseBySlug } from "../../search/api";
import { CourseHero } from "./components/course-hero";
import { CourseDescription } from "./components/course-description";
import { CourseDetailsCard } from "./components/course-details-card";
import { CourseFeesCard } from "./components/course-fees-card";
import { CourseIntakesCard } from "./components/course-intakes-card";
import { CourseEntryRequirementsCard } from "./components/course-entry-requirements-card";

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

export default async function CoursePage({ params }: CoursePageProps) {
  const { slug } = await params;
  const course = await getCourseBySlug(slug);
  if (!course) notFound();

  return (
    <div>
      <CourseHero course={course} />

      <section className="py-8">
        <div className="container max-w-6xl mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <CourseDescription description={course.description} />
            </div>

            <div className="flex flex-col gap-4">
              <CourseDetailsCard course={course} />
              <CourseFeesCard course={course} />
              <CourseIntakesCard intakes={course.intakes} />
              <CourseEntryRequirementsCard eligibility={course.eligibility} englishRequirements={course.englishRequirements} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
