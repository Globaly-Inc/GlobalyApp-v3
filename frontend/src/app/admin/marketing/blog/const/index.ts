import type { BlogTab } from "../types";
import type { BlogTopic, KeywordDifficulty } from "../apis/types";

export const BLOG_TABS: { value: BlogTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "drafts", label: "Drafts" },
  { value: "published", label: "Published" },
  { value: "keywords", label: "Keywords" },
];

export const TOPIC_OPTIONS: { value: BlogTopic; label: string }[] = [
  { value: "Study", label: "Study" },
  { value: "Work", label: "Work" },
  { value: "Live", label: "Live" },
];

export const TOPIC_FILTER_TABS: { value: BlogTopic | "all"; label: string }[] = [
  { value: "all", label: "All" },
  ...TOPIC_OPTIONS,
];

export const DIFFICULTY_OPTIONS: { value: KeywordDifficulty; label: string }[] = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

// Common study-abroad destinations — same purpose as V2's hardcoded country list.
export const COUNTRY_OPTIONS: { value: string; label: string }[] = [
  { value: "Australia", label: "🇦🇺 Australia" },
  { value: "Canada", label: "🇨🇦 Canada" },
  { value: "United Kingdom", label: "🇬🇧 United Kingdom" },
  { value: "United States", label: "🇺🇸 United States" },
  { value: "New Zealand", label: "🇳🇿 New Zealand" },
  { value: "Ireland", label: "🇮🇪 Ireland" },
  { value: "Germany", label: "🇩🇪 Germany" },
  { value: "India", label: "🇮🇳 India" },
];

export const COUNTRY_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All Countries" },
  ...COUNTRY_OPTIONS,
];
