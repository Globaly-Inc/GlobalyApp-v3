import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { getCourseBySlug, getTests } from "@/app/(web)/search/api";
import { DEGREE_LABEL } from "@/app/(web)/search/types";
import { CourseStats } from "@/app/(web)/course/[slug]/components/course-stats";
import { CourseDescription } from "@/app/(web)/course/[slug]/components/course-description";
import { CourseFeeCard } from "@/app/(web)/course/[slug]/components/course-fee-card";
import { CourseIntakesCard } from "@/app/(web)/course/[slug]/components/course-intakes-card";
import { CourseStudyOptionsCard, CourseStudyUnitsCard } from "@/app/(web)/course/[slug]/components/course-curriculum-card";
import { CourseEntryRequirementsCard } from "@/app/(web)/course/[slug]/components/course-entry-requirements-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FallbackImage } from "@/components/fallback-image";
import { InstitutionLogo } from "@/components/institution-logo";
import { embedApi } from "../../apis";
import { widgetTheme } from "../../utils";

/**
 * The course page a widget card opens.
 *
 * Deliberately NOT the website's `/course/[slug]`: a visitor who clicked a card inside an
 * institution's own site should land on that institution's page, in its colour and under its
 * name, not on a Globaly-branded one with our breadcrumbs, compare tray and enquiry funnel.
 * Same data and the same section components as the website page — only the chrome differs,
 * so a fix to a fee or intake card lands on both.
 *
 * ponytail: reads the ordinary public course endpoint, so a course the owner has not published
 * publicly 404s here even though the widget can talk about it. That gate is a visibility
 * decision, not a bug to route around — if widget-scoped courses should be readable, it is the
 * endpoint that changes, once, for both pages.
 */
type PageProps = Readonly<{ params: Promise<{ key: string; slug: string }> }>;

async function load(key: string, slug: string) {
  const [config, course] = await Promise.all([
    embedApi.resolveConfig(key).catch(() => null),
    getCourseBySlug(slug),
  ]);
  return { config, course };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { key, slug } = await params;
  const { config, course } = await load(key, slug);
  if (!course) return { title: "Course" };
  const owner = config?.display_name ?? course.institution?.name ?? course.awarding_institution;
  return {
    title: owner ? `${course.name} — ${owner}` : course.name,
    description: course.description?.slice(0, 155) ?? `Course details for ${course.name}.`,
  };
}

export default async function EmbedCoursePage({ params }: PageProps) {
  const { key, slug } = await params;
  const [{ config, course }, tests] = await Promise.all([load(key, slug), getTests()]);
  // A dead key must not render a branded page, and a course nobody published must not render at all.
  if (!config || !course) notFound();

  const theme = widgetTheme(config.brand_color);
  // The bar wears the widget's own name (what the visitor was just chatting to); the hero names
  // the awarding institution, which is the course's actual provider and often worded differently
  // ("AIT widget" in the bar, "Asian Institute of Technology" under the course title).
  const widgetName = config.display_name ?? course.institution?.name ?? course.awarding_institution;
  const awardedBy = course.institution?.name ?? course.awarding_institution ?? config.display_name;
  const cover = course.image_url ?? course.institution?.cover_url;
  const degreeLabel = course.degree_level ? DEGREE_LABEL[course.degree_level] ?? course.degree_level : null;
  // Per-section owner control, same rule as the website page: a section absent from the map,
  // or no map at all, means public.
  const isVisible = (section: string) => course.public_visibility?.[section] !== false;
  // Either audience's figure is a fee worth a card; CourseFeeCard drops the tile it has nothing for.
  const hasFee = course.domestic_fee_total != null || course.international_fee_total != null;

  return (
    <div style={theme.vars} className="min-h-dvh bg-background">
      <header className="flex items-center gap-3 bg-primary px-4 py-3 text-primary-foreground">
        <InstitutionLogo
          name={widgetName ?? "Course"}
          logoUrl={config.logo_url ?? course.institution?.logo_url ?? null}
          className="size-9 rounded-lg bg-white/90"
        />
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{widgetName}</p>
        <Button
          variant="ghost"
          size="sm"
          className="text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
          render={<Link href={`/embed/${key}`} />}
        >
          <MessageCircle className="size-4" />
          Ask a question
        </Button>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-6 md:space-y-6">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {/* The gradient is a LAYER under the cover, not an else-branch: institution covers are
              often private-bucket URLs that 403, and FallbackImage hides the img when they do. */}
          <div className="relative h-32 bg-gradient-to-br from-primary/25 via-primary/10 to-background md:h-40">
            {cover && <FallbackImage src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />}
          </div>
          <div className="space-y-2 px-5 py-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="text-xs">{course.subject_area ?? "Academic Courses"}</Badge>
              {degreeLabel && <Badge variant="outline" className="text-xs">{degreeLabel}</Badge>}
            </div>
            <h1 className="text-xl font-bold text-foreground md:text-2xl">{course.name}</h1>
            {awardedBy && <p className="text-sm text-muted-foreground">{awardedBy}</p>}
          </div>
        </div>

        <CourseStats course={course} />

        {/* Only what this course actually has. The website page keeps its "none listed yet"
            placeholders — an owner previewing their own draft needs to see the empty slot — but a
            visitor who clicked a card would just get a column of four blanks. The curriculum cards
            already return null when empty; the rest are gated here. */}
        {isVisible("description") && course.description && <CourseDescription description={course.description} />}
        {isVisible("fees") && hasFee && <CourseFeeCard course={course} />}
        {isVisible("intakes") && course.intakes.length > 0 && <CourseIntakesCard intakes={course.intakes} />}
        {isVisible("study_options") && <CourseStudyOptionsCard options={course.study_options} />}
        {isVisible("study_units") && <CourseStudyUnitsCard units={course.study_units} />}
        {isVisible("eligibility") && (course.eligibility.length > 0 || course.englishRequirements.length > 0) && (
          <CourseEntryRequirementsCard
            eligibility={course.eligibility}
            englishRequirements={course.englishRequirements}
            tests={tests}
          />
        )}

        <p className="pb-4 text-center text-xs text-muted-foreground">Powered by Globaly</p>
      </main>
    </div>
  );
}
