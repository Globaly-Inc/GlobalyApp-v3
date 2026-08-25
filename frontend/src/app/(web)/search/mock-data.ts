import type {
  BusinessDetail, CourseDetail, CourseFilterOptions, InstitutionDetail, Paginated, SearchBusiness, SearchCourse, SearchScholarship,
  SearchJob, SearchService, VisaServiceProviderDetail,
} from "./types";
import type { SearchFilterParams } from "./api";

function slugifyName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Card-only fields default to "nothing extracted" so a seed only spells them out when it wants
// to exercise the flag / location chips / per-installment price.
type CourseCardFields = "country_code" | "institution_logo_url" | "campus_locations"
  | "domestic_fee_installment" | "international_fee_installment";

const COURSE_CARD_DEFAULTS: Pick<SearchCourse, CourseCardFields> = {
  country_code: null, institution_logo_url: null, campus_locations: [],
  domestic_fee_installment: null, international_fee_installment: null,
};

type CourseSeed = Omit<SearchCourse, "slug" | CourseCardFields> & Partial<Pick<SearchCourse, CourseCardFields>>;

const MOCK_COURSE_SEEDS: CourseSeed[] = [
  {
    id: "c1", name: "Bachelor of Business Administration", short_name: null, degree_level: "bachelor",
    subject_area: "Business & Management", duration_weeks: 156, study_mode: "full_time",
    description: "Bachelor of Business Administration at Sydney Metropolitan University — a demo course for local testing.",
    domestic_fee_total: "28500", domestic_currency: "AUD", international_fee_total: null, international_currency: null,
    awarding_institution: "Sydney Metropolitan University", image_url: null, country_name: "Australia",
    next_intake_year: 2026, next_intake_month: 2,
    country_code: "AU", institution_logo_url: null,
    campus_locations: ["Sydney", "Parramatta", "Newcastle"],
    domestic_fee_installment: "9500", international_fee_installment: null,
  },
  {
    id: "c2", name: "Master of Information Technology", short_name: null, degree_level: "master",
    subject_area: "Information Technology", duration_weeks: 104, study_mode: "full_time",
    description: "Master of Information Technology at Sydney Metropolitan University — a demo course for local testing.",
    domestic_fee_total: "38000", domestic_currency: "AUD", international_fee_total: null, international_currency: null,
    awarding_institution: "Sydney Metropolitan University", image_url: null, country_name: "Australia",
    next_intake_year: 2026, next_intake_month: 2,
  },
  {
    id: "c3", name: "Diploma of Community Sector Management", short_name: null, degree_level: "diploma",
    subject_area: "Health & Community", duration_weeks: 52, study_mode: "full_time",
    description: "Diploma of Community Sector Management at Melbourne Polytechnic — a demo course for local testing.",
    domestic_fee_total: "12500", domestic_currency: "AUD", international_fee_total: null, international_currency: null,
    awarding_institution: "Melbourne Polytechnic", image_url: null, country_name: "Australia",
    next_intake_year: 2026, next_intake_month: 3,
  },
  {
    id: "c4", name: "Advanced Diploma of Leadership and Management", short_name: null, degree_level: "graduate_diploma",
    subject_area: "Business & Management", duration_weeks: 78, study_mode: "full_time",
    description: "Advanced Diploma of Leadership and Management at Melbourne Polytechnic — a demo course for local testing.",
    domestic_fee_total: "15750", domestic_currency: "AUD", international_fee_total: null, international_currency: null,
    awarding_institution: "Melbourne Polytechnic", image_url: null, country_name: "Australia",
    next_intake_year: 2026, next_intake_month: 7,
  },
  {
    id: "c5", name: "Master of Engineering (Civil)", short_name: null, degree_level: "master",
    subject_area: "Engineering", duration_weeks: 104, study_mode: "full_time",
    description: "Master of Engineering (Civil) at Toronto Institute of Technology — a demo course for local testing.",
    domestic_fee_total: null, domestic_currency: null, international_fee_total: "42000", international_currency: "USD",
    awarding_institution: "Toronto Institute of Technology", image_url: null, country_name: "Canada",
    next_intake_year: 2027, next_intake_month: 1,
  },
  {
    id: "c6", name: "Bachelor of Computer Science", short_name: null, degree_level: "bachelor",
    subject_area: "Information Technology", duration_weeks: 156, study_mode: "full_time",
    description: "Bachelor of Computer Science at Toronto Institute of Technology — a demo course for local testing.",
    domestic_fee_total: "32000", domestic_currency: "CAD", international_fee_total: null, international_currency: null,
    awarding_institution: "Toronto Institute of Technology", image_url: null, country_name: "Canada",
    next_intake_year: 2026, next_intake_month: 9,
  },
  {
    id: "c7", name: "Certificate III in Hospitality", short_name: null, degree_level: "certificate",
    subject_area: "Hospitality & Tourism", duration_weeks: 26, study_mode: "full_time",
    description: "Certificate III in Hospitality at Brisbane Trade College — a demo course for local testing.",
    domestic_fee_total: "6500", domestic_currency: "AUD", international_fee_total: null, international_currency: null,
    awarding_institution: "Brisbane Trade College", image_url: null, country_name: "Australia",
    next_intake_year: 2026, next_intake_month: 4,
  },
  {
    id: "c8", name: "Doctor of Philosophy (Business)", short_name: null, degree_level: "doctoral",
    subject_area: "Business & Management", duration_weeks: 208, study_mode: "full_time",
    description: "Doctor of Philosophy (Business) at Sydney Metropolitan University — a demo course for local testing.",
    domestic_fee_total: "45000", domestic_currency: "AUD", international_fee_total: null, international_currency: null,
    awarding_institution: "Sydney Metropolitan University", image_url: null, country_name: "Australia",
    next_intake_year: null, next_intake_month: null,
  },
  {
    id: "c9", name: "Bachelor of Science in Nursing", short_name: null, degree_level: "bachelor",
    subject_area: "Health & Medicine", duration_weeks: 156, study_mode: "full_time",
    description: "Bachelor of Science in Nursing at Delhi Institute of Health Sciences — a demo course for local testing.",
    domestic_fee_total: "850000", domestic_currency: "INR", international_fee_total: null, international_currency: null,
    awarding_institution: "Delhi Institute of Health Sciences", image_url: null, country_name: "India",
    next_intake_year: 2026, next_intake_month: 6,
  },
  {
    id: "c10", name: "Master of Business Administration (MBA)", short_name: null, degree_level: "master",
    subject_area: "Business & Management", duration_weeks: 104, study_mode: "full_time",
    description: "Master of Business Administration (MBA) at Kathmandu School of Management — a demo course for local testing.",
    domestic_fee_total: "1200000", domestic_currency: "NPR", international_fee_total: null, international_currency: null,
    awarding_institution: "Kathmandu School of Management", image_url: null, country_name: "Nepal",
    next_intake_year: 2026, next_intake_month: 8,
  },
  {
    id: "c11", name: "Graduate Certificate in Data Analytics", short_name: null, degree_level: "graduate_certificate",
    subject_area: "Information Technology", duration_weeks: 26, study_mode: "full_time",
    description: "Graduate Certificate in Data Analytics at Melbourne Polytechnic — a demo course for local testing.",
    domestic_fee_total: "9800", domestic_currency: "AUD", international_fee_total: null, international_currency: null,
    awarding_institution: "Melbourne Polytechnic", image_url: null, country_name: "Australia",
    next_intake_year: 2026, next_intake_month: 2,
  },
  {
    id: "c12", name: "Associate Degree in Agribusiness", short_name: null, degree_level: "associate",
    subject_area: "Agriculture", duration_weeks: 104, study_mode: "full_time",
    description: "Associate Degree in Agribusiness at Brisbane Trade College — a demo course for local testing.",
    domestic_fee_total: "15750", domestic_currency: "AUD", international_fee_total: null, international_currency: null,
    awarding_institution: "Brisbane Trade College", image_url: null, country_name: "Australia",
    next_intake_year: 2026, next_intake_month: 3,
  },
  // One course per landing-page "featured" country (plus China, used by the /country/china
  // page) so clicking through from any of those pages to /search always shows a result,
  // not just the handful of countries above.
  {
    id: "c13", name: "Bachelor of Computer Science", short_name: null, degree_level: "bachelor",
    subject_area: "Information Technology", duration_weeks: 156, study_mode: "full_time",
    description: "Bachelor of Computer Science at Kabul Polytechnic Institute — a demo course for local testing.",
    domestic_fee_total: "3500", domestic_currency: "USD", international_fee_total: null, international_currency: null,
    awarding_institution: "Kabul Polytechnic Institute", image_url: null, country_name: "Afghanistan",
    next_intake_year: 2026, next_intake_month: 3,
  },
  {
    id: "c14", name: "Bachelor of Tourism Management", short_name: null, degree_level: "bachelor",
    subject_area: "Hospitality & Tourism", duration_weeks: 156, study_mode: "full_time",
    description: "Bachelor of Tourism Management at University of Tirana — a demo course for local testing.",
    domestic_fee_total: "2800", domestic_currency: "USD", international_fee_total: null, international_currency: null,
    awarding_institution: "University of Tirana", image_url: null, country_name: "Albania",
    next_intake_year: 2026, next_intake_month: 9,
  },
  {
    id: "c15", name: "Master of Petroleum Engineering", short_name: null, degree_level: "master",
    subject_area: "Engineering", duration_weeks: 104, study_mode: "full_time",
    description: "Master of Petroleum Engineering at University of Algiers — a demo course for local testing.",
    domestic_fee_total: "4200", domestic_currency: "USD", international_fee_total: null, international_currency: null,
    awarding_institution: "University of Algiers", image_url: null, country_name: "Algeria",
    next_intake_year: 2026, next_intake_month: 10,
  },
  {
    id: "c16", name: "Diploma in Hospitality Management", short_name: null, degree_level: "diploma",
    subject_area: "Hospitality & Tourism", duration_weeks: 52, study_mode: "full_time",
    description: "Diploma in Hospitality Management at Andorra School of Business — a demo course for local testing.",
    domestic_fee_total: "9500", domestic_currency: "USD", international_fee_total: null, international_currency: null,
    awarding_institution: "Andorra School of Business", image_url: null, country_name: "Andorra",
    next_intake_year: 2026, next_intake_month: 9,
  },
  {
    id: "c17", name: "Bachelor of Marine Biology", short_name: null, degree_level: "bachelor",
    subject_area: "Health & Medicine", duration_weeks: 156, study_mode: "full_time",
    description: "Bachelor of Marine Biology at University of the West Indies (Antigua) — a demo course for local testing.",
    domestic_fee_total: "11000", domestic_currency: "USD", international_fee_total: null, international_currency: null,
    awarding_institution: "University of the West Indies (Antigua)", image_url: null, country_name: "Antigua and Barbuda",
    next_intake_year: 2026, next_intake_month: 9,
  },
  {
    id: "c18", name: "Bachelor of Business Administration", short_name: null, degree_level: "bachelor",
    subject_area: "Business & Management", duration_weeks: 156, study_mode: "full_time",
    description: "Bachelor of Business Administration at Galen University — a demo course for local testing.",
    domestic_fee_total: "8200", domestic_currency: "USD", international_fee_total: null, international_currency: null,
    awarding_institution: "Galen University", image_url: null, country_name: "Belize",
    next_intake_year: 2026, next_intake_month: 9,
  },
  {
    id: "c19", name: "Bachelor of Agricultural Science", short_name: null, degree_level: "bachelor",
    subject_area: "Agriculture", duration_weeks: 156, study_mode: "full_time",
    description: "Bachelor of Agricultural Science at University of Abomey-Calavi — a demo course for local testing.",
    domestic_fee_total: "2600", domestic_currency: "USD", international_fee_total: null, international_currency: null,
    awarding_institution: "University of Abomey-Calavi", image_url: null, country_name: "Benin",
    next_intake_year: 2026, next_intake_month: 10,
  },
  {
    id: "c20", name: "Diploma in Environmental Studies", short_name: null, degree_level: "diploma",
    subject_area: "Agriculture", duration_weeks: 52, study_mode: "full_time",
    description: "Diploma in Environmental Studies at Royal University of Bhutan — a demo course for local testing.",
    domestic_fee_total: "1800", domestic_currency: "USD", international_fee_total: null, international_currency: null,
    awarding_institution: "Royal University of Bhutan", image_url: null, country_name: "Bhutan",
    next_intake_year: 2026, next_intake_month: 3,
  },
  {
    id: "c21", name: "Bachelor of International Trade", short_name: null, degree_level: "bachelor",
    subject_area: "Business & Management", duration_weeks: 156, study_mode: "full_time",
    description: "Bachelor of International Trade at Shanghai University of Commerce — a demo course for local testing.",
    domestic_fee_total: "26000", domestic_currency: "USD", international_fee_total: null, international_currency: null,
    awarding_institution: "Shanghai University of Commerce", image_url: null, country_name: "China",
    next_intake_year: 2026, next_intake_month: 9,
  },
];

const MOCK_COURSES: SearchCourse[] = MOCK_COURSE_SEEDS.map((c) => ({
  ...COURSE_CARD_DEFAULTS, ...c, slug: `${slugifyName(c.name)}-${c.id}`,
}));

// Detail-only fixtures (intakes/eligibility/English tests) for the first two
// courses — enough to exercise every section of the course detail page.
const MOCK_COURSE_INTAKES: Record<string, CourseDetail["intakes"]> = {
  c1: [
    { id: "i1", intake_name: "February 2026", start_date: "2026-02-02", admission_deadline: "2025-12-15", intake_month: 2, intake_year: 2026 },
    { id: "i2", intake_name: "July 2026", start_date: "2026-07-06", admission_deadline: "2026-05-15", intake_month: 7, intake_year: 2026 },
  ],
  c2: [
    { id: "i3", intake_name: "February 2026", start_date: "2026-02-02", admission_deadline: "2025-12-15", intake_month: 2, intake_year: 2026 },
  ],
};

const MOCK_COURSE_ELIGIBILITY: Record<string, CourseDetail["eligibility"]> = {
  c1: [
    {
      id: "e1", applicable_to: "domestic", min_degree_level: "diploma", min_score_percent: "65",
      min_score_grade: null, description: "Completion of a relevant diploma or equivalent work experience.",
      academic_tests: [], language_tests: [],
    },
    {
      id: "e2", applicable_to: "international", min_degree_level: "diploma", min_score_percent: "70",
      min_score_grade: null, description: "Completion of a relevant diploma; international qualifications assessed individually.",
      academic_tests: [], language_tests: [{ test_type_name: "IELTS Academic", overall_score: "6.5" }],
    },
  ],
};

const NO_BAND_SCORES = { listening_score: null, reading_score: null, writing_score: null, speaking_score: null };

const MOCK_COURSE_ENGLISH_REQUIREMENTS: Record<string, CourseDetail["englishRequirements"]> = {
  c1: [
    { id: "en1", test_type_name: "IELTS", overall_score: "6.5", listening_score: "6.0", reading_score: "6.0", writing_score: "6.0", speaking_score: "6.0" },
    { id: "en2", test_type_name: "TOEFL", overall_score: "79", ...NO_BAND_SCORES },
    { id: "en3", test_type_name: "PTE", overall_score: "58", ...NO_BAND_SCORES },
  ],
  c2: [
    { id: "en4", test_type_name: "IELTS", overall_score: "6.5", ...NO_BAND_SCORES },
  ],
};

const MOCK_BUSINESSES: Record<"institutions" | "education-agencies" | "visa-services" | "migration-agents", SearchBusiness[]> = {
  institutions: [
    {
      id: 101, business_name: "Sydney Metropolitan University", subdomain: "demo-sydney-metro-uni",
      slug: "sydney-metropolitan-university-101", logo_url: null,
      description: "A leading public university offering business, IT, and engineering programs.",
      city: "Sydney", country_name: "Australia", website: "https://example.com/sydney-metro", email: null,
    },
    {
      id: 102, business_name: "Melbourne Polytechnic", subdomain: "demo-melbourne-polytechnic",
      slug: "melbourne-polytechnic-102", logo_url: null,
      description: "TAFE-style vocational college specialising in diplomas and graduate certificates.",
      city: "Melbourne", country_name: "Australia", website: "https://example.com/melbourne-polytechnic", email: null,
    },
  ],
  "education-agencies": [
    {
      id: 103, business_name: "GlobalEdu Consultants", subdomain: "demo-globaledu-consultants", logo_url: null,
      description: "Education consultancy helping students apply to universities in Australia and Canada.",
      city: "Kathmandu", country_name: "Nepal", status: "verified", category_name: "Education Agency",
      website: "https://example.com/globaledu", email: null,
    },
    {
      id: 104, business_name: "BrightPath Education Advisors", subdomain: "demo-brightpath-advisors", logo_url: null,
      description: "Full-service education agency for undergraduate and postgraduate placements abroad.",
      city: "Delhi", country_name: "India", status: "verified", category_name: "Education Agency",
      website: "https://example.com/brightpath", email: null,
    },
  ],
  "visa-services": [
    {
      id: 105, business_name: "VisaFirst Services", subdomain: "demo-visafirst-services", logo_url: null,
      description: "Student visa application and documentation support.",
      city: "Melbourne", country_name: "Australia", status: "verified", category_name: "Visa Services",
      website: "https://example.com/visafirst", email: null,
    },
    {
      id: 106, business_name: "Global Visa Solutions", subdomain: "demo-globalvisa-solutions", logo_url: null,
      description: "Visa processing assistance for study and work permits.",
      city: "Toronto", country_name: "Canada", status: "verified", category_name: "Visa Services",
      website: "https://example.com/globalvisa", email: null,
    },
  ],
  "migration-agents": [
    {
      id: 107, business_name: "Southern Star Migration", subdomain: "demo-southernstar-migration", logo_url: null,
      description: "MARN-registered migration agents specialising in student and skilled visas.",
      city: "Sydney", country_name: "Australia", status: "verified", category_name: "Migration Agent",
      website: "https://example.com/southernstar", email: null,
    },
  ],
};

const MOCK_JOBS: SearchJob[] = [
  {
    id: 201, title: "Retail Sales Assistant", description: "Weekend and evening shifts available, flexible around class timetables.",
    job_type: "part_time", location_city: "Sydney", country_name: "Australia", is_remote: false,
    pay_min: "26", pay_max: "30", pay_currency: "AUD", pay_unit: "hour", closing_date: null,
    created_at: "2026-08-01T00:00:00.000Z", company_name: "Harbourside Retail Co.", company_name_from_business: null, logo_url: null,
  },
  {
    id: 202, title: "Campus IT Support Officer", description: "Help desk support for staff and students, on-campus only.",
    job_type: "casual", location_city: "Melbourne", country_name: "Australia", is_remote: false,
    pay_min: "28", pay_max: "32", pay_currency: "AUD", pay_unit: "hour", closing_date: null,
    created_at: "2026-08-02T00:00:00.000Z", company_name: "Melbourne Polytechnic", company_name_from_business: null, logo_url: null,
  },
  {
    id: 203, title: "Marketing Intern", description: "3-month remote internship supporting social media and content campaigns.",
    job_type: "internship", location_city: "Kathmandu", country_name: "Nepal", is_remote: true,
    pay_min: null, pay_max: null, pay_currency: null, pay_unit: null, closing_date: null,
    created_at: "2026-08-03T00:00:00.000Z", company_name: "GlobalEdu Consultants", company_name_from_business: null, logo_url: null,
  },
  {
    id: 204, title: "Barista", description: "Morning shifts, no experience required, training provided.",
    job_type: "part_time", location_city: "Toronto", country_name: "Canada", is_remote: false,
    pay_min: "17", pay_max: "19", pay_currency: "CAD", pay_unit: "hour", closing_date: null,
    created_at: "2026-08-04T00:00:00.000Z", company_name: "Corner Cafe", company_name_from_business: null, logo_url: null,
  },
  {
    id: 205, title: "Data Entry Assistant", description: "Remote, flexible hours, supports the admissions documentation team.",
    job_type: "part_time", location_city: "Delhi", country_name: "India", is_remote: true,
    pay_min: "15000", pay_max: "18000", pay_currency: "INR", pay_unit: "year", closing_date: null,
    created_at: "2026-08-05T00:00:00.000Z", company_name: "BrightPath Education Advisors", company_name_from_business: null, logo_url: null,
  },
  {
    id: 206, title: "Warehouse Assistant", description: "Physical role, forklift license highly regarded but not required.",
    job_type: "casual", location_city: "Brisbane", country_name: "Australia", is_remote: false,
    pay_min: "27", pay_max: "29", pay_currency: "AUD", pay_unit: "hour", closing_date: null,
    created_at: "2026-08-06T00:00:00.000Z", company_name: "QuickShip Logistics", company_name_from_business: null, logo_url: null,
  },
];

const MOCK_SCHOLARSHIPS: SearchScholarship[] = [
  {
    id: 1, title: "Vice-Chancellor's Excellence Scholarship", slug: "vice-chancellors-excellence-scholarship",
    provider_name: "University of Melbourne", country: "Australia", city: "Melbourne", basis: "merit",
    degree_levels: ["master"], coverage_type: "partial_tuition", coverage_amount: 10000, coverage_currency: "AUD",
    deadline: "2026-10-31", is_featured: true,
  },
  {
    id: 2, title: "Global Leaders Award", slug: "global-leaders-award",
    provider_name: "Global Foundation", country: "United Kingdom", city: null, basis: "diversity",
    degree_levels: ["bachelor", "master"], coverage_type: "full_tuition", coverage_amount: null, coverage_currency: "GBP",
    deadline: "2026-11-15", is_featured: false,
  },
];

const MOCK_COURSE_FILTER_OPTIONS: CourseFilterOptions = {
  years: [2026, 2027],
  currencies: ["AUD", "USD", "CAD", "INR", "NPR"],
  degree_levels: ["Bachelor", "Certificate", "Doctorate", "Graduate Certificate", "Master", "Other", "PhD"],
};

function matchesCommon(
  item: { country_name: string | null; city?: string | null },
  params: SearchFilterParams,
): boolean {
  if (params.country && item.country_name?.toLowerCase() !== params.country.toLowerCase()) return false;
  if (params.city && item.city && !item.city.toLowerCase().includes(params.city.toLowerCase())) return false;
  return true;
}

function paginate<T>(rows: T[], params: SearchFilterParams): Paginated<T> {
  const limit = 10;
  const page = params.page && params.page > 0 ? params.page : 1;
  const start = (page - 1) * limit;
  return {
    data: rows.slice(start, start + limit),
    meta: { page, limit, total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / limit)) },
  };
}

function effectiveFee(c: SearchCourse): number | null {
  const raw = c.domestic_fee_total ?? c.international_fee_total;
  return raw ? Number(raw) : null;
}

export function mockGetCourses(params: SearchFilterParams): Paginated<SearchCourse> {
  console.log("[mock] getCourses", params);
  let rows = MOCK_COURSES.filter((c) => matchesCommon(c, params));

  if (params.search) {
    const q = params.search.toLowerCase();
    rows = rows.filter((c) => c.name.toLowerCase().includes(q) || c.awarding_institution?.toLowerCase().includes(q));
  }
  if (params.degree_level) rows = rows.filter((c) => c.degree_level === params.degree_level);
  if (params.currency) {
    rows = rows.filter((c) => c.domestic_currency === params.currency || c.international_currency === params.currency);
  }
  if (params.intake_year != null) rows = rows.filter((c) => c.next_intake_year === params.intake_year);
  if (params.fee_min != null) rows = rows.filter((c) => { const f = effectiveFee(c); return f == null || f >= params.fee_min!; });
  if (params.fee_max != null) rows = rows.filter((c) => { const f = effectiveFee(c); return f == null || f <= params.fee_max!; });

  const sorted = [...rows];
  if (params.sort === "fee_asc") sorted.sort((a, b) => (effectiveFee(a) ?? Infinity) - (effectiveFee(b) ?? Infinity));
  else if (params.sort === "fee_desc") sorted.sort((a, b) => (effectiveFee(b) ?? -Infinity) - (effectiveFee(a) ?? -Infinity));
  else if (params.sort === "duration_asc") sorted.sort((a, b) => (a.duration_weeks ?? Infinity) - (b.duration_weeks ?? Infinity));
  else sorted.sort((a, b) => a.name.localeCompare(b.name));

  return paginate(sorted, params);
}

function mockGetBusinesses(category: keyof typeof MOCK_BUSINESSES, params: SearchFilterParams): Paginated<SearchBusiness> {
  console.log(`[mock] getBusinesses:${category}`, params);
  let rows = MOCK_BUSINESSES[category].filter((b) => matchesCommon(b, params));
  if (params.search) {
    const q = params.search.toLowerCase();
    rows = rows.filter((b) => b.business_name.toLowerCase().includes(q) || b.description?.toLowerCase().includes(q));
  }
  return paginate(rows, params);
}

export const mockGetInstitutions = (params: SearchFilterParams) => mockGetBusinesses("institutions", params);
export const mockGetEducationAgencies = (params: SearchFilterParams) => mockGetBusinesses("education-agencies", params);
export const mockGetVisaServices = (params: SearchFilterParams) => mockGetBusinesses("visa-services", params);
export const mockGetMigrationAgents = (params: SearchFilterParams) => mockGetBusinesses("migration-agents", params);

export function mockGetStudentJobs(params: SearchFilterParams): Paginated<SearchJob> {
  console.log("[mock] getStudentJobs", params);
  let rows = MOCK_JOBS.filter((j) => matchesCommon({ country_name: j.country_name, city: j.location_city }, params));
  if (params.search) {
    const q = params.search.toLowerCase();
    rows = rows.filter((j) => j.title.toLowerCase().includes(q));
  }
  if (params.job_type) rows = rows.filter((j) => j.job_type === params.job_type);
  if (params.is_remote) rows = rows.filter((j) => j.is_remote);
  return paginate(rows, params);
}

export function mockGetScholarships(params: SearchFilterParams): Paginated<SearchScholarship> {
  console.log("[mock] getScholarships", params);
  let rows = MOCK_SCHOLARSHIPS.filter((s) => matchesCommon({ country_name: s.country, city: s.city }, params));
  if (params.search) {
    const q = params.search.toLowerCase();
    rows = rows.filter((s) => s.title.toLowerCase().includes(q) || s.provider_name?.toLowerCase().includes(q));
  }
  if (params.basis) rows = rows.filter((s) => s.basis === params.basis);
  if (params.degree_level) rows = rows.filter((s) => s.degree_levels.includes(params.degree_level!));
  if (params.fee_min != null) rows = rows.filter((s) => (s.coverage_amount ?? Infinity) >= params.fee_min!);
  return paginate(rows, params);
}

export function mockGetServices(params: SearchFilterParams): Paginated<SearchService> {
  console.log("[mock] getServices", params);
  // ponytail: no seeded mock services yet — this tab only has real data in this app so far.
  return paginate([], params);
}

export function mockGetCourseFilters(): CourseFilterOptions {
  console.log("[mock] getCourseFilters");
  return MOCK_COURSE_FILTER_OPTIONS;
}

export function mockGetCourseBySlug(slug: string): CourseDetail | null {
  console.log("[mock] getCourseBySlug", slug);
  const course = MOCK_COURSES.find((c) => c.slug === slug);
  if (!course) return null;
  return {
    ...course,
    intakes: MOCK_COURSE_INTAKES[course.id] ?? [],
    eligibility: MOCK_COURSE_ELIGIBILITY[course.id] ?? [],
    englishRequirements: MOCK_COURSE_ENGLISH_REQUIREMENTS[course.id] ?? [],
    institution: null, campuses: [], weather: null,
    domestic_fee_installments: null, international_fee_installments: null, city_link: null,
  };
}

export function mockGetInstitutionBySlug(slug: string): InstitutionDetail | null {
  console.log("[mock] getInstitutionBySlug", slug);
  const institution = MOCK_BUSINESSES.institutions.find((b) => b.slug === slug);
  if (!institution) return null;
  return {
    ...institution, cover_url: null, phone: null, address: null, state: null, postcode: null,
    registration_number: null, registration_licenses: null,
    facebook_url: null, instagram_url: null, twitter_url: null, linkedin_url: null, youtube_url: null,
    company_size: null, created_at: null, video_urls: null,
    campuses: [], members: [], subject_areas: [], degree_levels: [],
  };
}

export function mockGetVisaServiceProviderBySlug(slug: string): VisaServiceProviderDetail | null {
  console.log("[mock] getVisaServiceProviderBySlug", slug);
  const provider = MOCK_BUSINESSES["visa-services"].find((b) => b.slug === slug);
  if (!provider) return null;
  return {
    id: String(provider.id), slug: provider.slug!, business_name: provider.business_name,
    logo_url: provider.logo_url, description: provider.description, address: null,
    city: provider.city, state: null, country_name: provider.country_name,
    website: provider.website, email: provider.email, phone: null, source_url: null, services: [],
  };
}

export function mockGetBusinessBySubdomain(subdomain: string): BusinessDetail | null {
  console.log("[mock] getBusinessBySubdomain", subdomain);
  const categories = Object.keys(MOCK_BUSINESSES) as (keyof typeof MOCK_BUSINESSES)[];
  for (const category of categories) {
    const business = MOCK_BUSINESSES[category].find((b) => b.subdomain === subdomain);
    if (business) {
      return {
        ...business, cover_url: null, phone: null, address: null, state: null, postcode: null,
        latitude: null, longitude: null, business_registration_number: null, registration_licenses: null,
        category_name: category,
        facebook_url: null, instagram_url: null, twitter_url: null, linkedin_url: null, youtube_url: null,
        branches: [], members: [], services: [], representations: [],
      };
    }
  }
  return null;
}

export function mockGetInstitutionCourses(
  slug: string, params: Pick<SearchFilterParams, "page" | "search">,
): Paginated<SearchCourse> {
  console.log("[mock] getInstitutionCourses", slug, params);
  const institution = MOCK_BUSINESSES.institutions.find((b) => b.slug === slug);
  if (!institution) return paginate([], params);
  let rows = MOCK_COURSES.filter((c) => c.awarding_institution === institution.business_name);
  if (params.search) {
    const q = params.search.toLowerCase();
    rows = rows.filter((c) => c.name.toLowerCase().includes(q));
  }
  return paginate(rows, params);
}
