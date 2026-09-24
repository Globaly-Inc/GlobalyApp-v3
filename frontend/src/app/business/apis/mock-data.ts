import type {
  AiAssistInput, AiAssistResult,
  BusinessCategoryOption, BusinessProfile, BusinessProfilePatch, BusinessRegisterInput,
  RegisterBusinessResult, InstitutionRegisterInput, RegisterInstitutionResult, StartExtractionInput,
  ExtractionStatus, SiteUrl, SiteUrlCategory, SiteUrlsPage, SiteUrlsQuery, SiteUrlSnapshot, SiteUrlRefreshResult,
  OnboardingProgress, OnboardingStep, WidgetAnalytics,
} from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let mockExtractionProgressPct = 0;
let mockReviewedCourses = false;
const mockEditedSnapshots: Record<string, string> = {};

const MOCK_SITE_URLS: Omit<SiteUrl, "id" | "created_at">[] = [
  { url: "https://www.morgan.edu/", source: "homepage", category: "overview", category_source: "heuristic" },
  { url: "https://www.morgan.edu/about", source: "map", category: "about_us", category_source: "heuristic" },
  { url: "https://www.morgan.edu/contact", source: "map", category: "contact_us", category_source: "heuristic" },
  { url: "https://www.morgan.edu/programs/computer-science", source: "sitemap", category: "course", category_source: "llm" },
  { url: "https://www.morgan.edu/programs/business-administration", source: "sitemap", category: "course", category_source: "llm" },
  { url: "https://www.morgan.edu/programs/nursing", source: "sitemap", category: "course", category_source: "llm" },
  { url: "https://www.morgan.edu/campuses", source: "map", category: "branches", category_source: "heuristic" },
  { url: "https://www.morgan.edu/admissions/agents", source: "map", category: "agents", category_source: "heuristic" },
  { url: "https://www.morgan.edu/tuition-fees", source: "map", category: "fees", category_source: "admin" },
  { url: "https://www.morgan.edu/academic-calendar", source: "map", category: "intake", category_source: "llm" },
  { url: "https://www.morgan.edu/admissions/requirements", source: "map", category: "eligibility", category_source: "llm" },
  { url: "https://www.morgan.edu/accreditation", source: "map", category: "accreditations", category_source: "heuristic" },
  { url: "https://www.morgan.edu/news/2026-open-day", source: "links", category: "other", category_source: "heuristic" },
];

function siteUrlCounts(urls: SiteUrl[]) {
  const by_category = {} as Record<SiteUrlCategory, number>;
  for (const u of urls) if (u.category) by_category[u.category] = (by_category[u.category] ?? 0) + 1;
  return {
    total: urls.length,
    unclassified: urls.filter((u) => !u.category).length,
    excluded: 0,
    by_category,
  };
}

const MOCK_BUSINESS_CATEGORIES: BusinessCategoryOption[] = [
  { value: "1", label: "Education Agency", slug: "education_agency", description: "Education Consultants and Migration Agents", icon: "Users" },
  { value: "2", label: "Institutions", slug: "institutions", description: "Universities, colleges, and educational institutions", icon: "Building2" },
  { value: "3", label: "Visa Services", slug: "visa_services", description: "Visa application and immigration support services", icon: "FileCheck" },
];

let mockProfile: BusinessProfile = {
  id: 1,
  schema_name: "mock-org-id",
  business_name: "Mock Agency",
  subdomain: "mock-agency",
  business_type: "agent",
  business_category_id: 1,
  source_job_id: null,
  business_category_name: "Education Consultancy",
  business_category_icon: "Building2",
  email: null,
  phone: null,
  logo_url: null,
  cover_url: null,
  website: null,
  description: null,
  country_id: null,
  state: null,
  city: null,
  address: null,
  postcode: null,
  latitude: null,
  longitude: null,
  onboarding_completed: false,
  status: "unverified",
  cover_position: null,
  is_published: false,
  show_team_public: true,
  public_visibility: {},
  currency: null,
  gallery_images: null,
  video_urls: null,
  registration_licenses: null,
  linkedin_url: null,
  facebook_url: null,
  instagram_url: null,
  twitter_url: null,
  youtube_url: null,
  whatsapp_url: null,
  tiktok_url: null,
  threads_url: null,
  messenger_url: null,
  telegram_url: null,
  line_url: null,
  viber_url: null,
};

export const businessMockApi = {
  registerInstitution: async (input: InstitutionRegisterInput): Promise<RegisterInstitutionResult> => {
    console.log("[mock] POST /platform-users/me/onboarding/institution", input);
    await delay(500);
    const subdomain = input.institution_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").split("-").filter(Boolean).join("-").slice(0, 20) || "institution";
    return {
      institution: { id: 1, org_id: "mock-inst-org-id", subdomain, institution_name: input.institution_name },
      access_token: "mock-access-token",
      message: "Institution created.",
    };
  },

  registerBusiness: async (input: BusinessRegisterInput): Promise<RegisterBusinessResult> => {
    console.log("[mock] POST /businesses/register", input);
    await delay(500);
    // Mirrors the backend: subdomain is derived from the name, never sent by the client.
    const subdomain = input.business_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").split("-").filter(Boolean).join("-").slice(0, 20) || "business";
    mockProfile = { ...mockProfile, ...input, subdomain, onboarding_completed: true };
    return {
      org: { id: mockProfile.id, org_id: mockProfile.schema_name, subdomain, business_name: input.business_name },
      access_token: "mock-access-token",
      message: "Business created.",
    };
  },

  getMyProfile: async (): Promise<BusinessProfile> => {
    console.log("[mock] GET /businesses/me");
    await delay(300);
    return mockProfile;
  },

  updateMyProfile: async (patch: BusinessProfilePatch): Promise<BusinessProfile> => {
    console.log("[mock] PATCH /businesses/me", patch);
    await delay(300);
    mockProfile = { ...mockProfile, ...patch };
    return mockProfile;
  },

  uploadImage: async (category: "logo" | "cover" | "gallery", file: File): Promise<{ storage_path: string }> => {
    console.log(`[mock] POST /businesses/me/files?category=${category}`, file.name);
    await delay(400);
    const url = URL.createObjectURL(file);
    if (category === "logo" || category === "cover") {
      mockProfile = { ...mockProfile, [category === "logo" ? "logo_url" : "cover_url"]: url };
    } else if (file.type.startsWith("video/")) {
      mockProfile = { ...mockProfile, video_urls: [...(mockProfile.video_urls ?? []), url] };
    } else {
      mockProfile = { ...mockProfile, gallery_images: [...(mockProfile.gallery_images ?? []), url] };
    }
    return { storage_path: url };
  },

  deleteMedia: async (url: string, type: "gallery" | "video"): Promise<void> => {
    console.log(`[mock] DELETE /businesses/me/media`, { url, type });
    await delay(300);
    if (type === "video") {
      mockProfile = { ...mockProfile, video_urls: (mockProfile.video_urls ?? []).filter((u) => u !== url) };
    } else {
      mockProfile = { ...mockProfile, gallery_images: (mockProfile.gallery_images ?? []).filter((u) => u !== url) };
    }
  },

  getBusinessCategories: async (search?: string): Promise<BusinessCategoryOption[]> => {
    console.log("[mock] GET /businesses/business-categories", search);
    await delay(200);
    if (!search) return MOCK_BUSINESS_CATEGORIES;
    return MOCK_BUSINESS_CATEGORIES.filter((c) => c.label.toLowerCase().includes(search.toLowerCase()));
  },

  startExtraction: async (input: StartExtractionInput): Promise<BusinessProfile> => {
    console.log("[mock] POST /businesses/me/start-extraction", input);
    await delay(500);
    if (mockProfile.source_job_id) throw new Error("Extraction has already been started for this business");
    const website = input.website ?? mockProfile.website;
    if (!website) throw new Error("A website is required to start extraction");
    mockProfile = { ...mockProfile, website, source_job_id: "mock-job-id" };
    mockExtractionProgressPct = 0;
    return mockProfile;
  },

  // Advances a bit on every poll so the progress card has something to show, capping at 100.
  getExtractionStatus: async (): Promise<ExtractionStatus> => {
    console.log("[mock] GET /businesses/me/extraction-status");
    await delay(300);
    if (!mockProfile.source_job_id) return null;
    mockExtractionProgressPct = Math.min(100, mockExtractionProgressPct + 20);
    const scale = mockExtractionProgressPct / 100;
    return {
      status: mockExtractionProgressPct >= 100 ? "done" : "extracting",
      progress_pct: mockExtractionProgressPct,
      counts: {
        branches: Math.round(2 * scale),
        agents: Math.round(4 * scale),
        courses: Math.round(38 * scale),
        fees: Math.round(30 * scale),
        intakes: Math.round(12 * scale),
        eligibility: Math.round(20 * scale),
        units: Math.round(90 * scale),
        study_options: Math.round(15 * scale),
        accreditations: Math.round(3 * scale),
        visa_services: 0,
      },
    };
  },

  getExtractionSiteUrls: async (params: SiteUrlsQuery): Promise<SiteUrlsPage> => {
    console.log("[mock] GET /businesses/me/extraction-site-urls", params);
    await delay(300);
    if (!mockProfile.source_job_id) return { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 }, counts: null };

    const revealed = Math.round(MOCK_SITE_URLS.length * (mockExtractionProgressPct / 100));
    const allUrls: SiteUrl[] = MOCK_SITE_URLS.slice(0, revealed).map((u, i) => ({
      ...u, id: `mock-url-${i}`, created_at: new Date().toISOString(),
    }));
    const counts = siteUrlCounts(allUrls);

    const filtered = params.category ? allUrls.filter((u) => u.category === params.category) : allUrls;
    const limit = params.limit ?? 20;
    const page = params.page ?? 1;
    const start = (page - 1) * limit;
    return {
      data: filtered.slice(start, start + limit),
      meta: { page, limit, total: filtered.length, totalPages: Math.max(1, Math.ceil(filtered.length / limit)) },
      counts,
    };
  },

  getExtractionSiteUrlSnapshot: async (url: string): Promise<SiteUrlSnapshot> => {
    console.log("[mock] GET /businesses/me/extraction-site-urls/snapshot", url);
    await delay(400);
    const found = MOCK_SITE_URLS.find((u) => u.url === url);
    if (!found) throw new Error("This page isn't part of this job's site");
    const edited = mockEditedSnapshots[url];
    return {
      url,
      scraped_at: new Date().toISOString(),
      markdown: edited ??
        `# ${found.category ? found.category.replace(/_/g, " ") : "Page"}\n\n` +
        `This is a mock snapshot of the content Scrapling captured from **${url}**.\n\n` +
        "In a real extraction this shows the exact markdown handed to the model — headings, " +
        "paragraphs, tables, and links exactly as the page rendered them at fetch time.",
      edited: edited !== undefined,
    };
  },

  updateExtractionSiteUrlSnapshot: async (url: string, markdown: string): Promise<SiteUrlSnapshot> => {
    console.log("[mock] PATCH /businesses/me/extraction-site-urls/snapshot", url);
    await delay(400);
    const found = MOCK_SITE_URLS.find((u) => u.url === url);
    if (!found) throw new Error("This page isn't part of this job's site");
    mockEditedSnapshots[url] = markdown;
    return { url, scraped_at: new Date().toISOString(), markdown, edited: true };
  },

  refreshExtractionSiteUrls: async (urls: string[]): Promise<SiteUrlRefreshResult> => {
    console.log("[mock] POST /businesses/me/extraction-site-urls/refresh", urls);
    await delay(300);
    const queued: string[] = [];
    const rejected: { url: string; error: string }[] = [];
    for (const url of urls) {
      if (MOCK_SITE_URLS.some((u) => u.url === url)) {
        // The real worker clears this once it re-scrapes; the mock has no background job, so
        // clear it immediately so a "View" right after still shows something changed.
        delete mockEditedSnapshots[url];
        queued.push(url);
      } else {
        rejected.push({ url, error: "Not part of this job's site" });
      }
    }
    return { queued, rejected };
  },

  getOnboardingProgress: async (): Promise<OnboardingProgress> => {
    console.log("[mock] GET /businesses/me/onboarding");
    await delay(300);
    const extractionDone = mockExtractionProgressPct >= 100;
    const steps: OnboardingStep[] = [
      { key: "create_account", label: "Create your account", detail: "", duration: null, done: true },
      { key: "verify_email", label: "Verify your work email", detail: "", duration: null, done: true },
      {
        key: "extract_website", label: "Extract your website data",
        detail: "Build your profile from your website", duration: "~15 min", done: extractionDone,
      },
      {
        key: "review_courses", label: "Review courses & services",
        detail: "Check what we found, fix gaps", duration: "~10 min", done: mockReviewedCourses,
      },
      {
        key: "customize_assistant", label: "Customise your AI assistant",
        detail: "Name, greeting and tone of voice", duration: "~5 min", done: false,
      },
      {
        key: "add_chat_widget", label: "Add the chat widget to your site",
        detail: "Paste one line of code, or send it to IT", duration: "~5 min", done: false,
      },
      {
        key: "invite_team", label: "Invite your team",
        detail: "Admissions staff who answer enquiries", duration: "~2 min", done: false,
      },
    ];
    return { steps, completed: steps.filter((s) => s.done).length, total: steps.length };
  },

  markCoursesReviewed: async (): Promise<{ reviewed: boolean }> => {
    console.log("[mock] POST /businesses/me/onboarding/review-courses");
    await delay(300);
    mockReviewedCourses = true;
    return { reviewed: true };
  },

  getWidgetAnalytics: async (): Promise<WidgetAnalytics> => {
    console.log("[mock] GET /businesses/me/widget-analytics");
    await delay(300);
    const zeroMonth = { visitors: 0, conversationsClosed: 0, conversions: 0 };
    return {
      stats: {
        visitors: { value: 0, deltaPct: 0 },
        conversationsClosed: { value: 0, deltaPct: 0 },
        conversions: { value: 0, delta: 0 },
        conversionRate: { value: 0, deltaPts: 0 },
      },
      monthly: ["Apr", "May", "Jun", "Jul", "Aug", "Sep"].map((month) => ({ month, ...zeroMonth })),
    };
  },

  aiAssist: async (input: AiAssistInput): Promise<AiAssistResult> => {
    console.log("[mock] POST /businesses/me/ai-assist", input);
    await delay(900);
    return {
      text:
        `${input.business_name ?? "This business"} helps students turn study-abroad plans into ` +
        "offers, guiding them from shortlisting courses through applications and visas. " +
        "Every step is handled by counsellors who know the destination first-hand.",
    };
  },
};
