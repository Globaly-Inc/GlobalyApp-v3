import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { SearchEmptyState } from "../../../search/components/search-empty-state";
import { SearchPagination } from "../../../search/components/search-pagination";
import { ProfileSection } from "../../../components/profile/profile-section";
import { DEGREE_LABEL, type CourseFacet, type Paginated, type SearchCourse } from "../../../search/types";
import { InstitutionCourseSearch } from "./institution-course-search";
import { InstitutionCourseTile } from "./institution-course-tile";

function tabClass(active: boolean) {
  return `rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
    active
      ? "border-primary bg-primary text-primary-foreground"
      : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
  }`;
}

/**
 * The institution's catalog: a degree-level tab per level it actually teaches, then the page of
 * courses that level filters to. Tabs are plain links — switching one drops `page`, so a level
 * with fewer pages can't land the reader on an empty one.
 */
export function InstitutionCoursesSection({
  slug, courses, meta, page, search, level, levels, total,
}: Readonly<{
  slug: string;
  courses: SearchCourse[];
  meta: Paginated<unknown>["meta"];
  page: number;
  search?: string;
  level?: string;
  levels: CourseFacet[];
  total: number;
}>) {
  const pathname = `/institution/${slug}`;
  const baseQuery: Record<string, string> = search ? { search } : {};

  return (
    <ProfileSection icon={GraduationCap} title="Available Courses" count={total}>
      <div className="space-y-4">
        <InstitutionCourseSearch slug={slug} search={search} />

        {levels.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <Link href={{ pathname, query: baseQuery }} className={tabClass(!level)}>
              All ({total})
            </Link>
            {levels.map((option) => (
              <Link
                key={option.name}
                href={{ pathname, query: { ...baseQuery, level: option.name } }}
                className={tabClass(option.name === level)}
              >
                {DEGREE_LABEL[option.name] ?? option.name} ({option.count})
              </Link>
            ))}
          </div>
        )}

        {courses.length === 0 ? (
          <SearchEmptyState name="courses" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {courses.map((course) => <InstitutionCourseTile key={course.id} course={course} />)}
          </div>
        )}

        <SearchPagination
          meta={meta}
          page={page}
          query={{ ...baseQuery, ...(level ? { level } : {}) }}
          pathname={pathname}
        />
      </div>
    </ProfileSection>
  );
}
