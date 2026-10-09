import type { SiteUrlCategory } from "../../apis/types";

/** Label + fixed colour per crawl category — the colour ties a row's dot to its segment in the
 *  distribution bar. Literal class strings so Tailwind picks them up. */
export const SITE_URL_CATEGORIES: Record<SiteUrlCategory, { label: string; dot: string }> = {
  overview: { label: "Overview", dot: "bg-indigo-500 dark:bg-indigo-400" },
  about_us: { label: "About us", dot: "bg-sky-500 dark:bg-sky-400" },
  contact_us: { label: "Contact us", dot: "bg-cyan-500 dark:bg-cyan-400" },
  course: { label: "Courses", dot: "bg-violet-500 dark:bg-violet-400" },
  branches: { label: "Branches", dot: "bg-teal-500 dark:bg-teal-400" },
  agents: { label: "Agents", dot: "bg-emerald-500 dark:bg-emerald-400" },
  fees: { label: "Fees", dot: "bg-amber-500 dark:bg-amber-400" },
  study_units: { label: "Study units", dot: "bg-fuchsia-500 dark:bg-fuchsia-400" },
  study_options: { label: "Study options", dot: "bg-pink-500 dark:bg-pink-400" },
  intake: { label: "Intake", dot: "bg-orange-500 dark:bg-orange-400" },
  eligibility: { label: "Eligibility", dot: "bg-lime-500 dark:bg-lime-400" },
  accreditations: { label: "Accreditations", dot: "bg-blue-500 dark:bg-blue-400" },
  scholarships: { label: "Scholarships", dot: "bg-rose-500 dark:bg-rose-400" },
  other: { label: "Other", dot: "bg-slate-400 dark:bg-slate-500" },
};

export const SITE_URL_CATEGORY_ORDER = Object.keys(SITE_URL_CATEGORIES) as SiteUrlCategory[];
