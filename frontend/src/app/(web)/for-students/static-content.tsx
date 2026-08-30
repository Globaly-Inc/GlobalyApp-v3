
// Ported verbatim from V2's ForStudentsPage.tsx — no live data source for either array there either.
export const COUNTRY_FALLBACKS: Record<string, { institutions: string; tuition: string; living: string; code: string }> = {
  Australia: { institutions: "1.5k+", tuition: "20K–45K AUD", living: "2.1K–4.4K AUD", code: "AU" },
  "United States": { institutions: "500+", tuition: "20K–50K USD", living: "1K–2K USD", code: "US" },
  "United Kingdom": { institutions: "400+", tuition: "12K–25K GBP", living: "900–1.4K GBP", code: "GB" },
  Canada: { institutions: "200+", tuition: "20K–45K CAD", living: "1.5K–3K CAD", code: "CA" },
  "New Zealand": { institutions: "150+", tuition: "25K–45K NZD", living: "1.8K–2.8K NZD", code: "NZ" },
  Germany: { institutions: "90+", tuition: "N/A", living: "850–1.2K EUR", code: "DE" },
  France: { institutions: "85+", tuition: "2K–10K EUR", living: "800–1.4K EUR", code: "FR" },
  Ireland: { institutions: "55+", tuition: "10K–30K EUR", living: "850–1.5K EUR", code: "IE" },
  Netherlands: { institutions: "35+", tuition: "8K–15K EUR", living: "900–1.4K EUR", code: "NL" },
  Finland: { institutions: "25+", tuition: "8K–15K EUR", living: "700–1.2K EUR", code: "FI" },
};

export const CAREER_PATHS = [
  { title: "Artificial Intelligence", roles: "Data Scientists, AI Engineers, Machine Learning Specialist" },
  { title: "HealthCare", roles: "Healthcare Administrators, Medical Researchers" },
  { title: "Business & Leadership", roles: "Marketing Strategist, Business Analyst, Leadership Consultant" },
  { title: "Arts & Design", roles: "UI/UX Design, Creative Direction, Digital Artistry" },
  { title: "Finance & Accounting", roles: "Financial Analyst, CPA, Investment Banker" },
  { title: "Engineering", roles: "Mechanical Engineer, Civil Engineer, Chemical Engineer" },
];

export const STUDENT_TYPING_PHRASES = ["Starts Here", "Without Borders", "Is Possible", "Goes Global", "Made Simple"];

export const FLAG_URL = (code: string) => `https://cdn.jsdelivr.net/gh/madebybowtie/FlagKit@2.2/Assets/SVG/${code}.svg`;

export type HowItWorksStep = {
  step: number;
  title: string;
  desc: string;
  link: { label: string; href: string } | null;
};

// V2's step 3 links to "/search?tab=agents"; v3's real tab key is "education-agencies" (see search/types.ts).
export const HOW_IT_WORKS: HowItWorksStep[] = [
  {
    step: 1,
    title: "Find Courses and University",
    desc: "Discover top programs and institutions that align with your career goals from over 175,000 options worldwide.",
    link: { label: "Explore Course and University", href: "/search" },
  },
  {
    step: 2,
    title: "Check Your Eligibility",
    desc: "Ensure the perfect match for programs that suit your qualifications, budget, and interests.",
    link: null,
  },
  {
    step: 3,
    title: "Connect with Verified Professionals",
    desc: "Access expert guidance from certified and trust-scored professionals and institutions to ensure a smooth application process.",
    link: { label: "Explore Professionals", href: "/search?tab=education-agencies" },
  },
  {
    step: 4,
    title: "Get Enrolled",
    desc: "Seamlessly complete your enrollment and embark on your global education journey with confidence.",
    link: { label: "Get Started", href: "/auth/sign-up" },
  },
];
