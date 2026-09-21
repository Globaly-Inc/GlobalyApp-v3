// What kind of page is a site URL? The category drives what the pipeline does with it: `course`
// pages go to the page workers (queue_pages); the rest are labels the admin reads on the Site tab
// and the entity steps can pick from. Order of authority, highest first:
//   admin (never overwritten — see repository.setSiteUrlCategories)
//   > guided URL key (the admin TOLD us what this page is)
//   > classifier pick → course
//   > path heuristic (free)
//   > model pass (pipeline-steps.runUrlClassify, lite tier, only for what is still null)
//   > other

export const SITE_URL_CATEGORIES = [
  "overview", "about_us", "contact_us", "course", "branches", "agents", "fees",
  "study_units", "study_options", "intake", "eligibility", "accreditations", "other",
] as const;
export type SiteUrlCategory = (typeof SITE_URL_CATEGORIES)[number];

/** guided_urls keys (frontend const GUIDED_URL_CATEGORIES / VISA_SERVICE_GUIDED_URL_CATEGORIES) → category. */
const GUIDED_KEY_CATEGORY: Record<string, SiteUrlCategory> = {
  course_list_urls: "course", services_urls: "course",
  contact_urls: "contact_us", branches_urls: "branches", agents_urls: "agents", team_urls: "agents",
  fees_urls: "fees", intakes_urls: "intake", eligibility_urls: "eligibility", units_urls: "study_units",
  accreditations_urls: "accreditations", registration_urls: "accreditations", testimonials_urls: "other",
};

/** Guided URLs keyed by category. Same `*_urls` contract as html-utils.collectGuidedUrls; the legacy flat array is all course. */
export function guidedUrlCategories(guided: unknown, normalise: (u: string) => string = (u) => u): Map<string, SiteUrlCategory> {
  const out = new Map<string, SiteUrlCategory>();
  const add = (u: unknown, cat: SiteUrlCategory) => { if (typeof u === "string" && u.trim()) out.set(normalise(u.trim()), cat); };
  if (Array.isArray(guided)) { for (const u of guided) add(u, "course"); return out; }
  if (!guided || typeof guided !== "object") return out;
  for (const [key, val] of Object.entries(guided as Record<string, unknown>)) {
    if (!key.endsWith("_urls") || !Array.isArray(val)) continue;
    for (const u of val) add(u, GUIDED_KEY_CATEGORY[key] ?? "other");
  }
  return out;
}

// Path substrings, most specific category first — "/about/accreditation" is accreditations, not
// about_us. Compound phrases where a bare word would eat programme names (see html-utils
// NON_COURSE_PATH_MARKERS for why "policy" and "library" are traps).
const PATH_SIGNALS: [SiteUrlCategory, string[]][] = [
  ["accreditations", ["/accreditation", "/accredited", "/cricos", "/teqsa", "/registration", "/recognition", "/affiliation", "/rankings"]],
  ["fees", ["/fee", "/tuition", "/scholarship", "/cost", "/pricing", "/payment"]],
  ["intake", ["/intake", "/academic-calendar", "/key-dates", "/important-dates", "/semester-dates", "/term-dates", "/application-dates", "/apply-by"]],
  ["eligibility", ["/entry-requirement", "/admission-requirement", "/eligibility", "/english-requirement", "/english-language", "/how-to-apply"]],
  ["study_options", ["/study-option", "/study-mode", "/delivery-mode", "/part-time", "/full-time", "/online-study", "/distance", "/flexible-study"]],
  ["study_units", ["/unit-", "/units/", "/module", "/subject-outline", "/unit-outline"]],
  ["branches", ["campus", "location", "/branch", "/centre", "/center", "/office"]], // bare: "/our-campuses", "/study-locations"
  ["agents", ["/agent", "/representative", "/find-an-agent", "/education-partner"]],
  ["contact_us", ["/contact", "/enquir", "/inquir", "/get-in-touch"]],
  ["about_us", ["/about", "/who-we-are", "/our-story", "/history", "/mission", "/vision", "/governance", "/leadership"]],
  ["overview", ["/overview", "/at-a-glance", "/why-"]],
  ["other", ["/news", "/event", "/blog", "/staff", "/research", "/career", "/login", "/privacy", "/alumni", "/sport", "/giving", "/donate", "/media", "/sitemap", "/search"]],
];

/** Free, path-only guess. null = no signal; the model pass decides. Course detection is NOT here — that is html-utils.looksLikeCourseUrl and the classifier. */
export function heuristicCategory(url: string): SiteUrlCategory | null {
  let path: string;
  try { path = new URL(url).pathname.toLowerCase().replace(/\/+$/, "") || "/"; } catch { path = url.toLowerCase(); }
  if (path === "/") return "overview";
  for (const [cat, signals] of PATH_SIGNALS) if (signals.some((s) => path.includes(s))) return cat;
  return null;
}

/**
 * Pure merge (tested in tests/step-gate.ts): guided key > classifier pick > heuristic > null.
 * Guided URLs not on the list are added — the admin named them, they exist.
 */
export function categoriesFor(urls: string[], picked: Set<string>, guided: Map<string, SiteUrlCategory>): Map<string, SiteUrlCategory | null> {
  const out = new Map<string, SiteUrlCategory | null>();
  for (const url of urls) out.set(url, guided.get(url) ?? (picked.has(url) ? "course" : heuristicCategory(url)));
  for (const [url, cat] of guided) out.set(url, cat);
  return out;
}
