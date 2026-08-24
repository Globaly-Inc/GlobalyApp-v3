import {
  BookOpenCheck, Building2, ClipboardCheck, Folder, Globe, GraduationCap, HelpCircle,
  Landmark, Library, Shield, type LucideIcon,
} from "lucide-react";
import type { KnowledgeTab } from "../types";
import type { CategoryKind, CrawlFrequency, TrustTier } from "../apis/types";

export const KNOWLEDGE_TABS: { value: KnowledgeTab; label: string; icon: LucideIcon }[] = [
  { value: "rack", label: "Knowledge Rack", icon: Library },
  { value: "visa", label: "Visa", icon: Shield },
  { value: "faqs", label: "FAQs", icon: HelpCircle },
  { value: "guides", label: "Guides", icon: Globe },
  { value: "gov_update", label: "Gov updates", icon: Landmark },
  { value: "institution_update", label: "Institution updates", icon: Building2 },
  { value: "scholarship", label: "Scholarships", icon: GraduationCap },
  { value: "test_provider", label: "Test providers", icon: BookOpenCheck },
  { value: "other", label: "Other", icon: Folder },
  { value: "queue", label: "Queue", icon: ClipboardCheck },
];

/** Tabs that are the knowledge rack filtered to a single category kind. */
export const RACK_KIND_TABS: readonly CategoryKind[] = [
  "gov_update", "institution_update", "scholarship", "test_provider", "other",
];

export const CATEGORY_KIND_OPTIONS: { value: CategoryKind; label: string }[] = [
  { value: "visa", label: "Visa" },
  { value: "country_guide", label: "Country guide" },
  { value: "faq", label: "FAQ" },
  { value: "gov_update", label: "Government update" },
  { value: "institution_update", label: "Institution update" },
  { value: "scholarship", label: "Scholarship" },
  { value: "test_provider", label: "Test provider" },
  { value: "other", label: "Other" },
];

export const TRUST_TIER_OPTIONS: { value: TrustTier; label: string; description: string }[] = [
  { value: "gov", label: "Government", description: "Official immigration or education authority" },
  { value: "verified_institution", label: "Verified institution", description: "Claimed and verified provider" },
  { value: "other", label: "Other", description: "Everything else — weigh with care" },
];

export const CRAWL_FREQUENCY_OPTIONS: { value: CrawlFrequency; label: string }[] = [
  { value: "off", label: "Manual only" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

export const QUEUE_STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "verified", label: "Verified" },
  { value: "rejected", label: "Rejected" },
];

/** Maps a source's last_status to how its badge should read. */
export const CRAWL_STATUS_TONE: Record<string, { label: string; className: string }> = {
  ok: { label: "Healthy", className: "bg-emerald-100 text-emerald-800" },
  queued: { label: "Queued", className: "bg-amber-100 text-amber-800" },
  crawling: { label: "Crawling", className: "bg-amber-100 text-amber-800" },
  no_content: { label: "No content", className: "bg-orange-100 text-orange-800" },
  failed: { label: "Failed", className: "bg-destructive/10 text-destructive" },
};

export const TRUST_TIER_TONE: Record<TrustTier, string> = {
  gov: "bg-primary/10 text-primary",
  verified_institution: "bg-blue-100 text-blue-800",
  other: "bg-muted text-muted-foreground",
};
