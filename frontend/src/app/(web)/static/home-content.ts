import { Building2, BookOpen, Users, Globe, Map, type LucideIcon } from "lucide-react";
import type { PlatformStatKey } from "../types";

export const TYPING_PHRASES = [
  "Accessible & Possible",
  "Borderless & Bright",
  "Simple & Achievable",
  "Open & Empowering",
  "Connected & Limitless",
  "Global & Within Reach",
];

export const STUDENT_FEATURES = [
  "Explore domestic and international study options",
  "Save and compare your courses and their fees",
  "Connect with institutions and education consultants",
  // Parked with the eligibility checker (course-hero's Check Eligibility link is commented out too):
  // "Check your eligibility for desired programs",
  "Send enquiries to verified education counselors and institutions",
  // Parked until scholarships ship:
  // "Find scholarships for your desired degree",
  "Get AI-powered education counselling",
  // Parked until the LMS ships (business/lms and personal/learning are ComingSoon pages):
  // "Earn certifications and badges through training programs",
];

export const PROVIDER_FEATURES = [
  "Increase reach and visibility in the global market",
  "Manage all your courses and their entry requirements",
  "Share course updates and critical information to all",
  "Connect and Collaborate with verified Education Counselors",
  "Connect with qualified local and international students",
  // Parked: the embeddable search widget (business/settings/ai-embed), the LMS (business/lms)
  // and ambassador programs (business/marketing/ambassadors) are all ComingSoon pages.
  // "Embed course search and eligibility check on your site",
  // "Build training programs with AI-generated content and assessments",
  // "Launch Student Ambassador Programs to boost peer recruitment",
];

export const AGENT_FEATURES = [
  "Increase visibility for your agency in the global market",
  "Bridge the gap between students and institutions",
  "Get verified and qualified student leads",
  "Connect & collaborate with global institutions directly",
  // Parked: embeddable widget, CRM integrations (business/settings/integrations), Trust Score
  // certifications and partner training programs are all unbuilt.
  // "Embed course search and eligibility check on your site",
  // "Manage student inquiries and integrate with your CRM",
  // "Earn certifications to boost your Trust Score and ranking",
  // "Access training programs from partner institutions",
];

/** Values come from GET /api/v3/platform-stats — `key` selects the count for each row. */
export const STATS: { key: PlatformStatKey; icon: LucideIcon; label: string }[] = [
  { key: "institutions", icon: Building2, label: "Institutions" },
  { key: "courses", icon: BookOpen, label: "Courses" },
  { key: "educationCounselors", icon: Users, label: "Education Counselors" },
  { key: "countries", icon: Globe, label: "Countries" },
  { key: "cities", icon: Map, label: "Cities" },
];
