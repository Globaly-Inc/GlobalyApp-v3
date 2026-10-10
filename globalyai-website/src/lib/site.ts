/**
 * Single source of truth for the things that change without a redesign.
 *
 * Every "Book a meeting" control on the page reads CAL_BOOKING_URL from here.
 * The GlobalyAI intro meeting, as supplied on 25 Sep 2026.
 */
export const CAL_BOOKING_URL = "https://cal.com/amit-ranjitkar/globaly-ai-intro-meeting";

export const siteConfig = {
  name: "GlobalyAI",
  /** Used in <title>, OG tags and the footer strapline. */
  tagline: "The chatbot that converts the traffic your institution already pays for.",
  description:
    "GlobalyAI is a conversion chatbot that lives on your institution's website. It answers the questions that decide whether an applicant keeps going: eligibility, cost, deadlines. It guides them to the right program from your approved content, and passes your admissions team the full conversation behind every inquiry.",
  url: "https://globalyai.com",
  company: "Globaly Inc.",
  founder: { name: "Amit Ranjitkar", role: "Founder & CEO", email: "amit@globalyapp.com" },
  /** Where the legal pages send questions and data requests. Same inbox the
      Globaly app's own legal pages use. */
  legalEmail: "support@globalyapp.com",
  /** Governing law for the Terms, matching the Globaly app's Terms. */
  jurisdiction: "New South Wales, Australia",
  /** Shown under the social icons in the footer and on the legal pages. */
  address: {
    street: "450 Townsend Street",
    locality: "San Francisco",
    region: "CA",
    postalCode: "94107",
    country: "US",
  },
} as const;

/** The address as one line, for the footer and the legal pages. */
export const COMPANY_ADDRESS = `${siteConfig.address.street}, ${siteConfig.address.locality} ${siteConfig.address.region} ${siteConfig.address.postalCode}`;

/**
 * The company's social accounts. These are the Globaly accounts the Globaly
 * app's own footer links to (frontend/src/app/(web)/const), used here on the
 * CEO's call until GlobalyAI has accounts of its own.
 */
export const SOCIAL_LINKS = [
  { network: "linkedin", label: "LinkedIn", href: "https://www.linkedin.com/company/globaly-app" },
  { network: "x", label: "X", href: "https://x.com/globaly_app" },
  { network: "instagram", label: "Instagram", href: "https://www.instagram.com/globaly.app" },
  { network: "facebook", label: "Facebook", href: "https://www.facebook.com/globaly.app" },
] as const;

export type SocialNetwork = (typeof SOCIAL_LINKS)[number]["network"];

/** The legal pages, linked from the footer and the cookie banner. */
export const LEGAL_LINKS = [
  { label: "Terms of Service", href: "/terms" },
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Cookie Policy", href: "/cookies" },
] as const;

/** One date for all three documents while they change together. */
export const LEGAL_UPDATED = "24 September 2026";

/**
 * Every key the site writes to the visitor's browser, in one plain module so
 * the Cookie Policy (a server component) can print the real names. Anything
 * added to storage gets a key here and an entry on /cookies in the same change.
 */
export const STORAGE_KEYS = {
  theme: "globalyai-v6-theme",
  cookieConsent: "globalyai-cookie-consent",
} as const;
