import {
  Activity,
  BookOpen,
  Briefcase,
  Building2,
  ClipboardList,
  FileCheck,
  FileText,
  Globe,
  GraduationCap,
  Handshake,
  Heart,
  Inbox,
  MessageSquare,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { DashboardPreset } from "../apis/types";

export const PRESETS: { value: DashboardPreset; label: string; days: number }[] = [
  { value: "last7", label: "7 days", days: 7 },
  { value: "last30", label: "30 days", days: 30 },
  { value: "last90", label: "90 days", days: 90 },
];

export const FEATURE_MODULES = ["students", "community", "content", "platform", "extraction"] as const;
export type FeatureModule = (typeof FEATURE_MODULES)[number];

export const MODULE_LABELS: Record<FeatureModule, string> = {
  students: "Students & Services",
  community: "Community",
  content: "Content & Marketing",
  platform: "Platform",
  extraction: "Data extraction",
};

// Maps backend feature_usage keys → icon + module. Unknown keys fall back to "platform".
export const FEATURE_META: Record<string, { icon: LucideIcon; module: FeatureModule }> = {
  profiles: { icon: Users, module: "students" },
  qualifications: { icon: GraduationCap, module: "students" },
  language_tests: { icon: Globe, module: "students" },
  work_experiences: { icon: Briefcase, module: "students" },
  files: { icon: FileText, module: "students" },
  enquiries: { icon: Inbox, module: "students" },
  feed_posts: { icon: Heart, module: "community" },
  jobs: { icon: Briefcase, module: "community" },
  referrals: { icon: Handshake, module: "community" },
  countries: { icon: Globe, module: "content" },
  blog_posts: { icon: BookOpen, module: "content" },
  scholarships: { icon: GraduationCap, module: "content" },
  credit_transactions: { icon: Activity, module: "platform" },
  chat_sessions: { icon: MessageSquare, module: "platform" },
  waitlist: { icon: ClipboardList, module: "platform" },
  businesses: { icon: Building2, module: "platform" },
  extraction_jobs: { icon: FileCheck, module: "extraction" },
  extracted_courses: { icon: BookOpen, module: "extraction" },
};

export const FALLBACK_FEATURE_META = { icon: FileText, module: "platform" as FeatureModule };
