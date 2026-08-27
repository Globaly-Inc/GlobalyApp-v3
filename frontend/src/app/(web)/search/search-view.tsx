import {
  getCourseFilters, getCourses, getEducationAgencies, getInstitutionFilters, getInstitutions,
  getMigrationAgents, getScholarshipsSearch, getServices, getStudentJobs, getVisaServices,
} from "./api";
import type {
  FeePeriod, SearchBusiness, SearchCourse, SearchJob, SearchScholarship, SearchService, SearchTabKey,
} from "./types";
import { DEFAULT_FEE_PERIOD, FEE_PERIOD_OPTIONS } from "./types";
import { SearchTabs } from "./components/search-tabs";
import { SearchFilters } from "./components/search-filters";
import { SearchBar } from "./components/search-bar";
import { SearchSortControls } from "./components/search-sort-controls";
import { MobileFiltersSheet } from "./components/mobile-filters-sheet";
import { CourseCard } from "./components/course-card";
import { BusinessCard } from "./components/business-card";
import { InstitutionCard } from "./components/institution-card";
import { JobCard } from "./components/job-card";
import { ScholarshipSearchCard } from "./components/scholarship-search-card";
import { ServiceSearchCard } from "./components/service-search-card";
import { SavedTab } from "./components/saved-tab";
import { SearchEmptyState } from "./components/search-empty-state";
import { SearchPagination } from "./components/search-pagination";

/** The query string this view reads — `/search` and `/personal/explore` each hand it their own searchParams. */
export type SearchViewParams = {
  tab?: string;
  country?: string;
  city?: string;
  search?: string;
  degree_level?: string;
  subject_area?: string;
  job_type?: string;
  is_remote?: string;
  fee_min?: string;
  fee_max?: string;
  currency?: string;
  intake_year?: string;
  sort?: string;
  page?: string;
  basis?: string;
  licensed_only?: string;
  institution_type?: string;
  intake_from?: string;
  /** Display-only: how a course card states its fee. Never forwarded to the API. */
  fee_period?: string;
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
  services: "Services",
};

const VALID_TABS = new Set<SearchTabKey>(Object.keys(TAB_NAMES) as SearchTabKey[]);

const resolveTab = (tab?: string): SearchTabKey =>
  VALID_TABS.has(tab as SearchTabKey) ? (tab as SearchTabKey) : "courses";

/**
 * The whole search surface: tab rail, query bar, filter sidebar, results, pagination.
 *
 * Every form and link inside points at `basePath` rather than a hardcoded `/search`, so mounting the
 * same view at `/personal/explore` keeps a signed-in user inside the portal shell while they search,
 * filter and page.
 */
export async function SearchView({
  params,
  basePath = "/search",
}: Readonly<{ params: SearchViewParams; basePath?: string }>) {
  // "saved" isn't a search tab — it renders the signed-in shortlist instead of a query result,
  // so it sits outside SearchTabKey and the tab underneath stays on courses.
  const isSavedTab = params.tab === "saved";
  const activeTab = resolveTab(params.tab);
  const page = Math.max(1, Number(params.page) || 1);
  const filters = {
    page,
    country: params.country || undefined,
    city: params.city || undefined,
    search: params.search || undefined,
    degree_level: params.degree_level || undefined,
    subject_area: params.subject_area || undefined,
    job_type: params.job_type || undefined,
    is_remote: params.is_remote === "true",
    fee_min: params.fee_min ? Number(params.fee_min) : undefined,
    fee_max: params.fee_max ? Number(params.fee_max) : undefined,
    currency: params.currency || undefined,
    intake_year: params.intake_year ? Number(params.intake_year) : undefined,
    sort: params.sort || undefined,
    basis: params.basis || undefined,
    licensed_only: params.licensed_only === "true",
    institution_type: params.institution_type || undefined,
    intake_from: params.intake_from || undefined,
  };

  const fetchers: Record<SearchTabKey, () => Promise<{ data: unknown[]; meta: { page: number; limit: number; total: number; totalPages: number } }>> = {
    courses: () => getCourses(filters),
    institutions: () => getInstitutions(filters),
    "education-agencies": () => getEducationAgencies(filters),
    "visa-services": () => getVisaServices(filters),
    "migration-agents": () => getMigrationAgents(filters),
    jobs: () => getStudentJobs(filters),
    scholarships: () => getScholarshipsSearch(filters),
    services: () => getServices(filters),
  };

  const [{ data: results, meta }, courseFilterOptions, institutionFilterOptions, scholarshipSample] = await Promise.all([
    fetchers[activeTab](),
    activeTab === "courses" ? getCourseFilters() : Promise.resolve(null),
    activeTab === "institutions" ? getInstitutionFilters() : Promise.resolve(null),
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

  const feePeriod = FEE_PERIOD_OPTIONS.some((o) => o.value === params.fee_period)
    ? (params.fee_period as FeePeriod)
    : DEFAULT_FEE_PERIOD;

  // `base` is only what survives a tab switch — a degree level or job type means nothing on another
  // tab, so the tab rail deliberately drops them.
  const base = { country: filters.country, city: filters.city, search: filters.search };
  // Paging must carry the whole active filter set forward instead, or page 2 quietly returns rows the
  // reader's own filters exclude. Everything except `page` itself rides along.
  const query: Record<string, string> = Object.fromEntries(
    Object.entries(params).filter(([key, value]) => key !== "page" && value),
  ) as Record<string, string>;
  query.tab = activeTab;

  const filtersProps = {
    activeTab,
    basePath,
    country: filters.country,
    city: filters.city,
    search: filters.search,
    degreeLevel: filters.degree_level,
    degreeLevels: courseFilterOptions?.degree_levels,
    subjectArea: filters.subject_area,
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
    licensedOnly: filters.licensed_only,
    institutionType: filters.institution_type,
    institutionTypes: institutionFilterOptions?.institution_types,
    intakeFrom: filters.intake_from,
    intakeMonths: institutionFilterOptions?.intake_months,
  };

  return (
    <>
      {/* V1's single sticky search header: two-zone tab bar above, search row below. */}
      <section className="sticky top-16 z-30 border-b border-border bg-background shadow-sm">
        <div className="container max-w-6xl mx-auto px-4 pb-4">
          <SearchTabs activeTab={activeTab} base={base} basePath={basePath} savedActive={isSavedTab} />

          {!isSavedTab && (
            <div className="flex items-center gap-2">
              <SearchBar {...filtersProps} />
              <MobileFiltersSheet>
                <SearchFilters {...filtersProps} />
              </MobileFiltersSheet>
            </div>
          )}
        </div>
      </section>

      {isSavedTab ? (
        <section className="py-6">
          <div className="container max-w-6xl mx-auto px-4"><SavedTab /></div>
        </section>
      ) : (
        <section className="py-6">
          <div className="container max-w-6xl mx-auto px-4">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-6">
              <p className="text-sm text-foreground">
                {meta.total.toLocaleString()} {TAB_NAMES[activeTab].toLowerCase()}
              </p>
              {activeTab === "courses" && <SearchSortControls />}
            </div>

            <div className="flex flex-col md:flex-row gap-6">
              <aside className="hidden md:block md:w-72 md:flex-shrink-0">
                <SearchFilters {...filtersProps} />
              </aside>

              <div className="flex-1 min-w-0">
                {results.length === 0 ? (
                  <SearchEmptyState name={TAB_NAMES[activeTab]} clearHref={basePath} />
                ) : (
                  <div className="space-y-4">
                    {activeTab === "courses" &&
                      (results as SearchCourse[]).map((c) => <CourseCard key={c.id} course={c} feePeriod={feePeriod} />)}
                    {activeTab === "jobs" &&
                      (results as SearchJob[]).map((j) => <JobCard key={j.id} job={j} />)}
                    {activeTab === "scholarships" &&
                      (results as SearchScholarship[]).map((s) => <ScholarshipSearchCard key={s.id} scholarship={s} />)}
                    {activeTab === "services" &&
                      (results as SearchService[]).map((s) => <ServiceSearchCard key={s.id} service={s} />)}
                    {activeTab === "institutions" &&
                      (results as SearchBusiness[]).map((b) => <InstitutionCard key={b.id} institution={b} />)}
                    {(activeTab === "education-agencies" || activeTab === "visa-services" || activeTab === "migration-agents") &&
                      (results as SearchBusiness[]).map((b) => <BusinessCard key={b.id} business={b} />)}
                  </div>
                )}

                <SearchPagination meta={meta} page={page} query={query} pathname={basePath} />
              </div>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
