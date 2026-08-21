import type { LucideIcon } from "lucide-react";
import {
  Clock,
  Globe,
  ListOrdered,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
  XCircle,
  Pause,
} from "lucide-react";
import type { ExtractionStatus } from "../apis/types";

export type StatusConfig = { label: string; icon: LucideIcon; className: string; spin?: boolean; accent: string };

// Ported from V2's ExtractionDashboard.tsx statusConfig — one entry per real status value.
// `accent` colors the row card's left edge so failed/active jobs are scannable in a long list.
export const STATUS_CONFIG: Record<ExtractionStatus, StatusConfig> = {
  pending: { label: "Pending", icon: Clock, className: "bg-muted text-muted-foreground", accent: "border-l-muted-foreground/30" },
  mapping: { label: "Mapping", icon: ListOrdered, className: "bg-blue-100 text-blue-700", accent: "border-l-blue-400" },
  scraping: { label: "Scraping", icon: Loader2, className: "bg-amber-100 text-amber-700", spin: true, accent: "border-l-amber-400" },
  extracting: { label: "Extracting", icon: Loader2, className: "bg-purple-100 text-purple-700", spin: true, accent: "border-l-purple-400" },
  processing: { label: "Processing", icon: Loader2, className: "bg-purple-100 text-purple-700", spin: true, accent: "border-l-purple-400" },
  verifying: { label: "Verifying", icon: Loader2, className: "bg-purple-100 text-purple-700", spin: true, accent: "border-l-purple-400" },
  review: { label: "Pending Review", icon: AlertCircle, className: "bg-orange-100 text-orange-700", accent: "border-l-orange-400" },
  verified: { label: "Approved", icon: CheckCircle2, className: "bg-emerald-100 text-emerald-700", accent: "border-l-emerald-400" },
  approved: { label: "Approved", icon: CheckCircle2, className: "bg-emerald-100 text-emerald-700", accent: "border-l-emerald-400" },
  done: { label: "Completed", icon: CheckCircle2, className: "bg-emerald-100 text-emerald-700", accent: "border-l-emerald-400" },
  completed: { label: "Completed", icon: CheckCircle2, className: "bg-emerald-100 text-emerald-700", accent: "border-l-emerald-400" },
  exported: { label: "Published", icon: ShieldCheck, className: "bg-green-100 text-green-800", accent: "border-l-green-500" },
  pushed: { label: "Published", icon: ShieldCheck, className: "bg-green-100 text-green-800", accent: "border-l-green-500" },
  declined: { label: "Declined", icon: XCircle, className: "bg-red-100 text-red-700", accent: "border-l-red-400" },
  failed: { label: "Failed", icon: AlertCircle, className: "bg-red-100 text-red-700", accent: "border-l-red-500" },
  stalled: { label: "Stalled", icon: AlertCircle, className: "bg-red-100 text-red-700", accent: "border-l-red-500" },
  paused: { label: "Paused", icon: Pause, className: "bg-gray-100 text-gray-600", accent: "border-l-gray-300" },
};

export const ACTIVE_STATUSES: ExtractionStatus[] = ["mapping", "scraping", "extracting", "processing", "verifying"];
export const PUBLISHABLE_STATUSES: ExtractionStatus[] = ["review", "verified", "done", "approved"];
export const PAUSABLE_STATUSES: ExtractionStatus[] = ["scraping", "extracting"];
export const FINISHED_STATUSES: ExtractionStatus[] = ["done", "completed", "approved", "verified", "exported", "pushed"];

// Every guided-URL bucket the backend actually reads. Keys must stay `*_urls` — the job
// worker seeds the crawl from every key with that suffix, and the per-course data steps
// look up `<data_type>_urls`. Adding a category here is enough to make it work end to end.
export const GUIDED_URL_CATEGORIES = [
  { key: "course_list_urls", label: "Course List / Catalogue", hint: "Where the AI can find the full list of courses" },
  { key: "contact_urls", label: "Contact / About" },
  { key: "branches_urls", label: "Branches / Campuses" },
  { key: "agents_urls", label: "Agent Directory" },
  { key: "fees_urls", label: "Fees" },
  { key: "intakes_urls", label: "Intakes / Academic Calendar" },
  { key: "eligibility_urls", label: "Entry Requirements" },
  { key: "units_urls", label: "Study Units / Curriculum" },
  { key: "accreditations_urls", label: "Accreditations" },
] as const;

// Per-course verification_status → list dot colour. "verified"/"mismatch" come from the
// verify worker, "confirmed"/"flagged" from a human, "manual" from a hand-added course.
export const VERIFICATION_DOT: Record<string, string> = {
  verified: "bg-emerald-500",
  confirmed: "bg-emerald-500",
  mismatch: "bg-destructive",
  flagged: "bg-destructive",
  manual: "bg-blue-400",
};

export const SOURCE_TYPE_OPTIONS = [
  { value: "institution", label: "Institution Website" },
];

/** One list component, three pages — the mode picks the data and the wording. Ported from V2's ExtractionDashboard. */
export type DashboardMode = "all" | "completed" | "ai-ongoing";

// null = no status filter. NOTE: "done" and "completed" are synonyms produced by
// different pipelines — both must be listed or jobs silently vanish from the UI.
export const MODE_STATUS_FILTER: Record<DashboardMode, ExtractionStatus[] | null> = {
  all: null,
  completed: ["done", "completed", "approved", "verified", "exported", "pushed", "declined", "review"],
  "ai-ongoing": ["pending", "mapping", "scraping", "extracting", "verifying", "review", "failed", "paused", "stalled"],
};

export const MODE_HEADINGS: Record<DashboardMode, { title: string; empty: string }> = {
  all: { title: "All Extractions", empty: "No extractions yet" },
  completed: { title: "Extracted Data — Ready to Publish", empty: "No completed extractions yet." },
  "ai-ongoing": { title: "Ongoing AI Extractions", empty: "No AI extractions in progress." },
};

export const SOURCE_FILTER_OPTIONS = [
  { value: "all", label: "All sources" },
  { value: "ai", label: "AI Extraction" },
  { value: "agentcis", label: "AgentCIS" },
];

/** Stages of the AI pipeline, in run order — keys match pipeline_progress. */
export const PIPELINE_STAGES: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "mapping", label: "Site Mapping", icon: Globe },
  { key: "intelligence", label: "Site Intelligence", icon: Sparkles },
  { key: "scraping", label: "Course Discovery", icon: ListOrdered },
  { key: "extracting", label: "Data Extraction", icon: Loader2 },
  { key: "verifying", label: "Verification", icon: CheckCircle2 },
];

// Queue item statuses, in the order the counter row shows them. "completed" is what
// the V3 page worker writes — V2 called the same state "done".
export const QUEUE_STATS: { status: string; label: string; color: string }[] = [
  { status: "pending", label: "Pending", color: "text-muted-foreground" },
  { status: "processing", label: "Processing", color: "text-primary" },
  { status: "paused", label: "Paused", color: "text-amber-600" },
  { status: "stopped", label: "Stopped", color: "text-destructive" },
  { status: "completed", label: "Done", color: "text-emerald-600" },
  { status: "failed", label: "Failed", color: "text-destructive" },
  { status: "ignored", label: "Ignored", color: "text-muted-foreground" },
];

export const QUEUE_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  ...QUEUE_STATS.map((s) => ({ value: s.status, label: s.label })),
];

export const UNIT_TYPE_OPTIONS = [
  { value: "compulsory", label: "Compulsory" },
  { value: "elective", label: "Elective" },
];

export const ENGLISH_TEST_OPTIONS = ["IELTS", "TOEFL iBT", "PTE Academic", "Duolingo English Test", "Cambridge English"]
  .map((t) => ({ value: t, label: t }));

export const ACADEMIC_TEST_OPTIONS = ["SAT", "ACT", "GMAT", "GRE", "MCAT", "LSAT"].map((t) => ({ value: t, label: t }));

/** Sub-scores captured per English test, in the order the form shows them. */
export const ENGLISH_SUBSCORES = [
  { key: "reading_score", label: "Reading" },
  { key: "writing_score", label: "Writing" },
  { key: "listening_score", label: "Listening" },
  { key: "speaking_score", label: "Speaking" },
] as const;

export const SCORE_TYPE_OPTIONS = [
  { value: "percentage", label: "Percentage (%)" },
  { value: "gpa", label: "GPA" },
  { value: "grade", label: "Grade" },
];

export const STUDENT_TYPE_OPTIONS = [
  { value: "domestic", label: "Domestic Students" },
  { value: "international", label: "International Students" },
  { value: "both", label: "Both" },
];

export const PERIOD_TYPE_OPTIONS = [
  { value: "Per Year", label: "Per Year" },
  { value: "Per Semester", label: "Per Semester" },
  { value: "Per Trimester", label: "Per Trimester" },
  { value: "Per Unit", label: "Per Unit" },
  { value: "Total", label: "Total" },
];

export const CURRENCY_OPTIONS = ["AUD", "NZD", "CAD", "USD", "GBP", "EUR", "NPR", "INR"].map((c) => ({
  value: c,
  label: c,
}));

// Study option enums — values are what the extractor writes to the staging tables.
export const STUDY_MODE_OPTIONS = [
  { value: "on_campus", label: "On Campus" },
  { value: "online", label: "Online" },
  { value: "hybrid", label: "Hybrid" },
];

export const STUDY_LOAD_OPTIONS = [
  { value: "full_time", label: "Full Time" },
  { value: "part_time", label: "Part Time" },
];

export const DURATION_UNIT_OPTIONS = [
  { value: "years", label: "Years" },
  { value: "months", label: "Months" },
  { value: "weeks", label: "Weeks" },
];

export const APPLICABLE_TO_OPTIONS = [
  { value: "domestic", label: "Domestic" },
  { value: "international", label: "International" },
  { value: "both", label: "Both" },
];

/** guided_urls keys a pipeline step can require before it will run. */
export type ContextKey = "branches_urls" | "agents_urls" | "course_list_urls" | "extract_fields";

export type SortOrder = "newest" | "oldest" | "name_asc" | "name_desc";

export const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name_asc", label: "Name A → Z" },
  { value: "name_desc", label: "Name Z → A" },
];
