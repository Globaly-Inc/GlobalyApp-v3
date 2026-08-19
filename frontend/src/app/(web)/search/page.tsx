import type { Metadata } from "next";
import { Search as SearchIcon } from "lucide-react";
import {
  getCourseFilters, getCourses, getEducationAgencies, getInstitutions, getMigrationAgents, getScholarshipsSearch,
  getStudentJobs, getVisaServices,
} from "./api";
import type { SearchBusiness, SearchCourse, SearchJob, SearchScholarship, SearchTabKey } from "./types";
import { SearchTabs } from "./components/search-tabs";
import { SearchFilters } from "./components/search-filters";
import { SearchBar } from "./components/search-bar";
import { SearchSortControls } from "./components/search-sort-controls";
import { MobileFiltersSheet } from "./components/mobile-filters-sheet";
import { CourseCard } from "./components/course-card";
import { BusinessCard } from "./components/business-card";
import { JobCard } from "./components/job-card";
import { ScholarshipSearchCard } from "./components/scholarship-search-card";
import { SearchEmptyState } from "./components/search-empty-state";
import { SearchPagination } from "./components/search-pagination";

export const metadata: Metadata = {
  title: "Search Courses, Institutions & Jobs — Globaly",
  description: "Search verified courses, institutions, agencies, visa services, and student jobs worldwide.",
};

function countBy<T>(items: T[], getValue: (item: T) => string | null): [string, number][] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = getValue(item);
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

const TAB_NAMES: Record<SearchTabKey, string> = {
  courses: "Courses",
  institutions: "Institutions",
  "education-agencies": "Education Agents",
  "visa-services": "Visa Services",
  "migration-agents": "Migration Agents",
  jobs: "Student Jobs",
  scholarships: "Scholarships",
};

const VALID_TABS = new Set<SearchTabKey>(Object.keys(TAB_NAMES) as SearchTabKey[]);

type SearchPageProps = Readonly<{
  searchParams: Promise<{
    tab?: string;
    country?: string;
    city?: string;
    search?: string;
    degree_level?: string;
    job_type?: string;
    is_remote?: string;
    fee_min?: string;
    fee_max?: string;
    currency?: string;
    intake_year?: string;
    sort?: string;
    page?: string;
    basis?: string;
  }>;
}>;

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const activeTab: SearchTabKey = VALID_TABS.has(params.tab as SearchTabKey) ? (params.tab as SearchTabKey) : "courses";
  const page = Math.max(1, Number(params.page) || 1);
  const filters = {
    page,
    country: params.country || undefined,
    city: params.city || undefined,
    search: params.search || undefined,
    degree_level: params.degree_level || undefined,
    job_type: params.job_type || undefined,
    is_remote: params.is_remote === "true",
    fee_min: params.fee_min ? Number(params.fee_min) : undefined,
    fee_max: params.fee_max ? Number(params.fee_max) : undefined,
    currency: params.currency || undefined,
    intake_year: params.intake_year ? Number(params.intake_year) : undefined,
    sort: params.sort || undefined,
    basis: params.basis || undefined,
  };

  const fetchers: Record<SearchTabKey, () => Promise<{ data: unknown[]; meta: { page: number; limit: number; total: number; totalPages: number } }>> = {
    courses: () => getCourses(filters),
    institutions: () => getInstitutions(filters),
    "education-agencies": () => getEducationAgencies(filters),
    "visa-services": () => getVisaServices(filters),
    "migration-agents": () => getMigrationAgents(filters),
    jobs: () => getStudentJobs(filters),
    scholarships: () => getScholarshipsSearch(filters),
  };

  const [{ data: results, meta }, courseFilterOptions, scholarshipSample] = await Promise.all([
    fetchers[activeTab](),
    activeTab === "courses" ? getCourseFilters() : Promise.resolve(null),
    // Only scholarships get real dropdowns for Country/City — courses/jobs/etc. store country
    // as unstructured free text with no shared field name to derive facets generically from.
    activeTab === "scholarships"
      ? getScholarshipsSearch({ search: filters.search })
      : Promise.resolve(null),
  ]);

  const scholarshipCountryOptions = scholarshipSample
    ? countBy(scholarshipSample.data, (s) => s.country).map(([value, count]) => ({ value, label: `${value} (${count})` }))
    : undefined;
  const scholarshipCityOptions = scholarshipSample
    ? countBy(scholarshipSample.data, (s) => s.city).map(([value, count]) => ({ value, label: `${value} (${count})` }))
    : undefined;

  const base = { country: filters.country, city: filters.city, search: filters.search };
  const query: Record<string, string> = { tab: activeTab, ...base } as Record<string, string>;

  const filtersProps = {
    activeTab,
    country: filters.country,
    city: filters.city,
    search: filters.search,
    degreeLevel: filters.degree_level,
    jobType: filters.job_type,
    isRemote: filters.is_remote,
    feeMin: filters.fee_min,
    feeMax: filters.fee_max,
    currency: filters.currency,
    countryOptions: scholarshipCountryOptions,
    cityOptions: scholarshipCityOptions,
    sort: filters.sort,
    intakeYear: filters.intake_year,
    intakeYears: courseFilterOptions?.years,
    basis: filters.basis,
  };

  return (
    <div>
      <section className="bg-linear-to-br from-primary/5 via-background to-primary/10 py-12 border-b border-border">
        <div className="container max-w-6xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <SearchIcon className="h-6 w-6 text-primary" />
            <span className="text-sm font-medium text-primary uppercase tracking-widest">Search Globaly</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">
            Find Your Path Abroad{filters.country ? ` in ${filters.country}` : ""}
          </h1>
        </div>
      </section>

      <section className="sticky top-16 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="container max-w-6xl mx-auto px-4">
          <SearchTabs activeTab={activeTab} base={base} />
        </div>
      </section>

      <section className="py-8">
        <div className="container max-w-6xl mx-auto px-4">
          <div className="flex items-center gap-2 mb-4">
            <SearchBar {...filtersProps} />
            <MobileFiltersSheet>
              <SearchFilters {...filtersProps} />
            </MobileFiltersSheet>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2 mb-6">
            <p className="text-sm text-muted-foreground">
              {meta.total} {TAB_NAMES[activeTab].toLowerCase()} found
            </p>
            {activeTab === "courses" && <SearchSortControls />}
          </div>

          <div className="flex flex-col md:flex-row gap-6">
            <aside className="hidden md:block md:w-72 md:flex-shrink-0">
              <SearchFilters {...filtersProps} />
            </aside>

            <div className="flex-1 min-w-0">
              {results.length === 0 ? (
                <SearchEmptyState name={TAB_NAMES[activeTab]} />
              ) : (
                <div className="space-y-4">
                  {activeTab === "courses" &&
                    (results as SearchCourse[]).map((c) => <CourseCard key={c.id} course={c} />)}
                  {activeTab === "jobs" &&
                    (results as SearchJob[]).map((j) => <JobCard key={j.id} job={j} />)}
                  {activeTab === "scholarships" &&
                    (results as SearchScholarship[]).map((s) => <ScholarshipSearchCard key={s.id} scholarship={s} />)}
                  {(activeTab === "institutions" || activeTab === "education-agencies" || activeTab === "visa-services" || activeTab === "migration-agents") &&
                    (results as SearchBusiness[]).map((b) => <BusinessCard key={b.id} business={b} />)}
                </div>
              )}

              <SearchPagination meta={meta} page={page} query={query} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
