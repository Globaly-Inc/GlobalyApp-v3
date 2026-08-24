import type { SocialName } from "../components/social-icon";

export const MOBILE_BREAKPOINT = 768;

export const PLATFORM_STATS = {
  students: "2000+",
  institutions: "3.6k+",
  agents: "3,600+",
  courses: "205k+",
  countries: "100+",
  cities: "60+",
  trainingPrograms: "500+",
  services: "50+",
};

export const FOOTER_LINKS: Record<string, { label: string; href: string }[]> = {
  "Get Started": [
    { label: "For Students", href: "/for-students" },
    { label: "For Institutions", href: "/for-institutions" },
    { label: "For Agents", href: "/for-agents" },
    { label: "Pricing", href: "/pricing" },
    { label: "Ambassador Program", href: "/for-students" },
  ],
  "Explore Destinations": [
    { label: "Australia", href: "/country/australia" },
    { label: "USA", href: "/country/united-states" },
    { label: "Canada", href: "/country/canada" },
    { label: "United Kingdom", href: "/country/united-kingdom" },
    { label: "Singapore", href: "/country/singapore" },
  ],
  Search: [
    { label: "Courses", href: "/search?tab=courses" },
    { label: "Institutions", href: "/search?tab=institutions" },
    { label: "Agents", href: "/search?tab=education-agencies" },
    { label: "Scholarships", href: "/scholarships" },
    { label: "Jobs", href: "/search?tab=jobs" },
  ],
  Resources: [
    { label: "Blog", href: "/blog" },
    { label: "Visa Info", href: "/blog" },
    { label: "Study Guides", href: "/blog" },
    { label: "Student Services", href: "/services" },
  ],
  Contact: [
    { label: "support@globaly.app", href: "mailto:support@globaly.app" },
    { label: "🇦🇺 Sydney, Australia", href: "#" },
    { label: "🇺🇸 Delaware, USA", href: "#" },
  ],
};

export const SOCIALS: { name: SocialName; href: string; label: string }[] = [
  { name: "facebook", href: "https://facebook.com/globaly.app", label: "Facebook" },
  { name: "twitter", href: "https://twitter.com/globaly_app", label: "Twitter / X" },
  { name: "linkedin", href: "https://linkedin.com/company/globaly-app", label: "LinkedIn" },
  { name: "instagram", href: "https://instagram.com/globaly.app", label: "Instagram" },
  { name: "youtube", href: "https://youtube.com/@globalyapp", label: "YouTube" },
];

// No "Services" entry here on purpose — the marketplace is reached from the hero search switcher
// ("Other Services"), alongside Courses / Institutions / Agents / Visas, because it is something people
// search rather than another marketing page.
export const NAV_LINKS = [
  { label: "For Students", href: "/for-students" },
  { label: "For Institutions", href: "/for-institutions" },
  { label: "For Agents", href: "/for-agents" },
  { label: "Blog", href: "/blog" },
];

export const REVEAL_CLASS_BY_DIRECTION = {
  up: "reveal",
  left: "reveal-left",
  right: "reveal-right",
} as const;

export const SOCIAL_ICON_PATHS: Record<SocialName, string> = {
  facebook:
    "M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9v-2.89h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.87h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12Z",
  twitter:
    "M18.9 3h3.1l-6.77 7.74L23.2 21h-6.2l-4.86-6.36L6.4 21H3.3l7.24-8.28L2.8 3h6.36l4.4 5.82L18.9 3Zm-1.09 16.2h1.72L7.28 4.7H5.44L17.81 19.2Z",
  linkedin:
    "M6.94 5a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM5 10.8h3.9V21H5V10.8Zm6.4 0h3.74v1.4h.05c.52-.96 1.8-1.98 3.7-1.98 3.96 0 4.7 2.5 4.7 5.75V21h-3.9v-4.24c0-1.01-.02-2.32-1.44-2.32-1.44 0-1.66 1.1-1.66 2.24V21h-3.9V10.8Z",
  instagram:
    "M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Zm0 5.9a2.3 2.3 0 1 1 0-4.6 2.3 2.3 0 0 1 0 4.6Zm5.85-6.06a.85.85 0 1 1-1.7 0 .85.85 0 0 1 1.7 0ZM12 4.6c2.4 0 2.68.01 3.63.06.87.04 1.35.19 1.66.31.42.16.72.36 1.03.67.31.31.5.61.67 1.03.12.31.27.79.31 1.66.05.95.06 1.23.06 3.63s-.01 2.68-.06 3.63c-.04.87-.19 1.35-.31 1.66-.16.42-.36.72-.67 1.03-.31.31-.61.5-1.03.67-.31.12-.79.27-1.66.31-.95.05-1.23.06-3.63.06s-2.68-.01-3.63-.06c-.87-.04-1.35-.19-1.66-.31a2.8 2.8 0 0 1-1.03-.67 2.8 2.8 0 0 1-.67-1.03c-.12-.31-.27-.79-.31-1.66-.05-.95-.06-1.23-.06-3.63s.01-2.68.06-3.63c.04-.87.19-1.35.31-1.66.16-.42.36-.72.67-1.03.31-.31.61-.5 1.03-.67.31-.12.79-.27 1.66-.31.95-.05 1.23-.06 3.63-.06ZM12 3c-2.44 0-2.74.01-3.7.06-.96.05-1.62.2-2.19.43a4.4 4.4 0 0 0-1.6 1.04 4.4 4.4 0 0 0-1.04 1.6c-.23.57-.38 1.23-.43 2.19C3 9.26 3 9.56 3 12s.01 2.74.06 3.7c.05.96.2 1.62.43 2.19.23.57.53 1.05 1.04 1.6.51.51.99.81 1.6 1.04.57.23 1.23.38 2.19.43.96.05 1.26.06 3.7.06s2.74-.01 3.7-.06c.96-.05 1.62-.2 2.19-.43a4.4 4.4 0 0 0 1.6-1.04c.51-.51.81-.99 1.04-1.6.23-.57.38-1.23.43-2.19.05-.96.06-1.26.06-3.7s-.01-2.74-.06-3.7c-.05-.96-.2-1.62-.43-2.19a4.4 4.4 0 0 0-1.04-1.6 4.4 4.4 0 0 0-1.6-1.04c-.57-.23-1.23-.38-2.19-.43C14.74 3.01 14.44 3 12 3Z",
  youtube:
    "M22 12s0-3.05-.39-4.52a2.5 2.5 0 0 0-1.76-1.77C18.38 5.3 12 5.3 12 5.3s-6.38 0-7.85.4a2.5 2.5 0 0 0-1.76 1.78C2 8.95 2 12 2 12s0 3.05.39 4.52c.22.82.87 1.46 1.76 1.68C5.62 18.6 12 18.6 12 18.6s6.38 0 7.85-.4a2.5 2.5 0 0 0 1.76-1.68C22 15.05 22 12 22 12ZM10 15.02V8.98L15.27 12 10 15.02Z",
};

import { GraduationCap, Building2, Users, Stamp, Handshake } from "lucide-react";

// The hero search switcher. Every slug but `other-services` resolves to /search?tab=<slug>; that one goes to
// the peer-to-peer marketplace instead — see SEARCH_DESTINATIONS below and unified-search-bar's submit().
export const CATEGORIES = [
  { slug: "courses", name: "Courses", Icon: GraduationCap },
  { slug: "institutions", name: "Institutions", Icon: Building2 },
  { slug: "agents", name: "Agents", Icon: Users },
  { slug: "visas", name: "Visas", Icon: Stamp },
  { slug: "other-services", name: "Other Services", Icon: Handshake },
];

/**
 * Slugs whose search lives outside /search, as `[path, queryParam]`.
 *
 * The marketplace is its own page with its own query param, so the switcher has to know that rather than
 * building `/search?tab=other-services&q=…`, which nothing serves.
 */
export const SEARCH_DESTINATIONS: Record<string, { path: string; param: string }> = {
  "other-services": { path: "/services", param: "search" },
};

export const AI_PROMPTS_BY_SLUG: Record<string, string[]> = {
  courses: [
    "What courses can I study abroad?",
    "What are the popular courses in Australia?",
    "What are the programs for bachelor's degrees?",
    "What scholarships are available for international students?",
  ],
  institutions: [
    "What are the top universities in Canada?",
    "Which cities are best for international students?",
    "Which countries offer affordable tuition for international students?",
    "What are the highest-ranked universities for business?",
  ],
  agents: [
    "What do education agents do?",
    "Do I need an education agent to apply abroad?",
    "How are education agents paid?",
    "Find education agents who place students in the USA.",
  ],
  visas: [
    "What is a student visa and how does it work?",
    "What documents are needed for a student visa?",
    "Can international students work on a student visa?",
    "What are the post-study work visa options abroad?",
  ],
  // Its own set, so switching to Other Services in AI mode doesn't leave course prompts on screen via the
  // `?? AI_PROMPTS_BY_SLUG.courses` fallback.
  "other-services": [
    "How do I get from the airport when I arrive?",
    "Can someone help me find accommodation?",
    "Where can I find a tutor for my course?",
    "What help do other students offer where I'm going?",
  ],
};

/**
 * Public bucket for hero videos, posters and marketing photos. They live in GCS rather than
 * `public/`, so the repo and the deployed bundle stay free of tens of megabytes of media.
 */
export const MEDIA_URL = "https://storage.googleapis.com/globalyapp-public-images/photos";
