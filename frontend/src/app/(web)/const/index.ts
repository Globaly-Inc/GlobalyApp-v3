import type { SocialName } from "../components/social-icon";

export const MOBILE_BREAKPOINT = 768;

export const FOOTER_LINKS: Record<string, { label: string; href: string }[]> = {
  "Get Started": [
    { label: "For Students", href: "/for-students" },
    { label: "For Institutions", href: "/for-institutions" },
    { label: "For Education Counselors", href: "/for-agents" },
    // Parked until the feature ships. Pricing has a page but no live plans, and the Ambassador
    // Program has no page at all — its link pointed at /for-students.
    // { label: "Pricing", href: "/pricing" },
    // { label: "Ambassador Program", href: "/for-students" },
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
    { label: "Education Counselors", href: "/search?tab=education-agencies" },
    { label: "Scholarships", href: "/scholarships" },
    // Parked with the Jobs tab itself (see search-tabs.tsx): /students/jobs returns no rows, and the
    // tab is not in the rail, so this link landed on a tab the page no longer offers.
    // { label: "Jobs", href: "/search?tab=jobs" },
  ],
  Resources: [
    { label: "Blog", href: "/blog" },
    { label: "Visa Info", href: "/blog" },
    { label: "Study Guides", href: "/blog" },
    { label: "Student Services", href: "/services" },
  ],
  Contact: [
    { label: "support@globalyapp.com", href: "mailto:support@globalyapp.com" },
    // Addresses, not destinations: href "" makes the footer render them as plain text rather than
    // a link that goes nowhere.
    { label: "🇦🇺 Sydney, Australia", href: "" },
    { label: "🇺🇸 Delaware, USA", href: "" },
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
// ("Other Services"), alongside Courses / Institutions / Education Counselors / Visas, because it is something people
// search rather than another marketing page.
export const NAV_LINKS = [
  { label: "For Students", href: "/for-students" },
  { label: "For Institutions", href: "/for-institutions" },
  { label: "For Education Counselors", href: "/for-agents" },
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
  // Ported verbatim from V1's `components/ui/social-icons.tsx` so the profile header can render
  // every platform `SocialLinks` stores, not just the five the public detail pages surface.
  tiktok:
    "M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.75a8.18 8.18 0 0 0 3.76.92V6.22c-.01.16-.01.32-.01.47z",
  whatsapp:
    "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z",
  threads:
    "M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.96-.065-1.187.408-2.26 1.33-3.017.88-.724 2.104-1.126 3.449-1.134.94-.006 1.83.12 2.658.375-.08-.762-.308-1.372-.683-1.818-.498-.593-1.262-.9-2.27-.913h-.063c-.842 0-1.596.27-2.005.507l-.963-1.68c.677-.389 1.737-.732 2.966-.751h.089c1.546.025 2.752.554 3.582 1.572.673.824 1.082 1.903 1.22 3.218.558.254 1.065.577 1.51.965 1.27 1.108 1.947 2.632 1.908 4.293-.053 2.233-1.004 4.088-2.75 5.368C17.879 23.284 15.413 23.98 12.186 24zm.857-7.472c1.09-.058 1.907-.465 2.43-1.115.363-.452.627-1.06.788-1.814a8.57 8.57 0 0 0-1.954-.392c-1.647-.073-3.238.386-3.396 1.892-.082.788.303 1.246.712 1.51.502.325 1.163.45 1.846.45l-.109-.1-.317-.431z",
  messenger:
    "M.001 11.639C.001 4.949 5.241 0 12.001 0S24 4.95 24 11.639c0 6.689-5.24 11.638-12 11.638-1.21 0-2.38-.16-3.47-.46a.96.96 0 0 0-.64.05l-2.39 1.05a.96.96 0 0 1-1.35-.85l-.07-2.14a.97.97 0 0 0-.32-.68A11.39 11.389 0 0 1 .002 11.64zm8.32-2.19-3.52 5.6c-.35.53.32 1.139.82.75l3.79-2.87c.26-.2.6-.2.87 0l2.8 2.1c.84.63 2.04.4 2.6-.48l3.52-5.6c.35-.53-.32-1.13-.82-.75l-3.79 2.87c-.25.2-.6.2-.86 0l-2.8-2.1a1.8 1.8 0 0 0-2.61.48z",
  telegram:
    "M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z",
  line:
    "M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314",
  viber:
    "M11.398.002C9.473.028 5.331.344 3.014 2.467 1.294 4.177.59 6.77.5 9.96c-.09 3.19-.21 9.17 5.6 10.8v2.48s-.04.98.6 1.18c.53.16.788-.12 2.348-1.92.88-1.02 1.98-2.27 2.84-3.3 3.95.34 6.99-.42 7.34-.54.8-.26 5.32-.84 6.06-6.85.76-6.2-.36-10.11-2.38-11.88 0 0-3.37-3.01-9.85-3.11-.15-.002-.302-.002-.452 0zM11.47 1.97c.11-.001.22 0 .33.002 5.49.09 8.39 2.46 8.39 2.46 1.69 1.47 2.64 4.95 1.98 10.38-.63 5.07-4.32 5.47-5 5.69-.29.1-2.88.74-6.21.54 0 0-2.46 2.97-3.23 3.75-.12.13-.27.18-.36.16-.14-.03-.18-.18-.17-.4l.03-4.09c-4.85-1.37-4.57-6.38-4.49-9.1.08-2.72.63-4.94 2.1-6.41C6.71 3.1 9.58 1.99 11.47 1.97zm.16 2.87c-.09 0-.17.04-.23.1a.33.33 0 0 0-.1.23c0 .09.03.17.1.23.06.07.14.1.23.1 1.19.04 2.27.5 3.1 1.3.82.8 1.3 1.87 1.37 3.08 0 .09.04.17.1.23a.33.33 0 0 0 .46 0 .32.32 0 0 0 .1-.24c-.08-1.37-.63-2.59-1.57-3.5-.93-.91-2.14-1.44-3.5-1.49-.02-.01-.04-.01-.06 0zm-2.57 1.49c-.26-.06-.53.02-.73.2l-.62.56s-.93.81-.15 2.33c.59 1.15 1.38 2.26 2.49 3.39 1.12 1.1 2.38 2.04 3.51 2.6 1.53.77 2.33-.16 2.33-.16l.55-.62c.24-.27.27-.66.08-.96l-1.29-1.55c-.18-.22-.54-.26-.77-.08l-.88.64s-.36.2-.88-.12c-.39-.24-1.07-.82-1.55-1.3-.49-.49-.94-1.02-1.3-1.55-.32-.53-.11-.89-.11-.89l.64-.88c.15-.22.14-.54-.07-.74l-1.35-1.27z",
};

import { GraduationCap, Building2, Users, Stamp, Handshake } from "lucide-react";

// The hero search switcher. Every slug but `other-services` resolves to /search?tab=<slug>; that one goes to
// the peer-to-peer marketplace instead — see SEARCH_DESTINATIONS below and unified-search-bar's submit().
//
// Courses and Other Services are not businesses, so they stay hardcoded; the entries between them
// mirror the admin-managed business_categories catalog, fetched at runtime. This list is also what
// the switcher falls back to when that request fails.
export const CATEGORIES = [
  { slug: "courses", name: "Courses", Icon: GraduationCap },
  { slug: "institutions", name: "Institutions", Icon: Building2 },
  { slug: "education-agencies", name: "Education Counselors", Icon: Users },
  { slug: "visa-services", name: "Visa Services", Icon: Stamp },
  { slug: "other-services", name: "Other Services", Icon: Handshake },
];

/**
 * business_categories.slug → the search tab that serves it.
 *
 * A category with no entry here (accreditation_body, immigration_departments) has nowhere to
 * search, so the switcher drops it — as it does any tab that is not currently in the rail.
 */
export const CATEGORY_SLUG_TO_TAB: Record<string, string> = {
  institutions: "institutions",
  education_agency: "education-agencies",
  visa_services: "visa-services",
  migration_agents: "migration-agents",
};

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
    "What courses can I study at home or overseas?",
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
  "education-agencies": [
    "What do education counselors do?",
    "Do I need an education counselor to apply to a course?",
    "How are education counselors paid?",
    "Find education counselors who place students in the USA.",
  ],
  "visa-services": [
    "What is a student visa and how does it work?",
    "What documents are needed for a student visa?",
    "Can international students work on a student visa?",
    "What are the post-study work visa options for international students?",
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

/** Popular search terms per category, shown as one-tap chips under the bar in Search mode. */
export const SEARCH_SUGGESTIONS_BY_SLUG: Record<string, string[]> = {
  courses: ["MBA", "MSc Information Technology", "Nursing", "Data Science"],
  institutions: ["University of Melbourne", "University of Toronto", "TAFE", "Community colleges"],
  "education-agencies": ["Education Counselors for Australia", "Education Counselors for Canada", "Education Counselors for the UK", "Education Counselors for the USA"],
  "visa-services": ["Student visa", "Post-study work visa", "Dependent visa", "Visitor visa"],
  "other-services": ["Airport pickup", "Accommodation", "Tutoring", "SIM card"],
};

/**
 * Fact chips — the country page's visa facts and the city page's highlights.
 *
 * `h-auto` is load-bearing: Badge pins `h-5`, which swallows any vertical padding a caller
 * passes. Same for `size-4!` — the base sets `[&>svg]:size-3!` with an important flag. The
 * primary tint is what makes these read as facts rather than faint outlines on the near-white
 * page background.
 */
export const FACT_CHIP_CLASS =
  "h-auto gap-2 border-primary/25 bg-primary/10 px-4 py-2 text-sm font-medium text-primary [&>svg]:size-4!";
