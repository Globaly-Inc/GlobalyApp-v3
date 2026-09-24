/**
 * Single source of truth for the things that change without a redesign.
 *
 * Every "Book a meeting" control on the page reads CAL_BOOKING_URL from here.
 * The overlayCalendar param is part of the booking link as supplied — it opens
 * Cal's overlay rather than a full page redirect.
 */
export const CAL_BOOKING_URL =
  "https://cal.com/amit-ranjitkar/meeting-with-amit?overlayCalendar=true";

export const siteConfig = {
  name: "GlobalyAI",
  /** Used in <title>, OG tags and the footer strapline. */
  tagline: "The chatbot that converts the traffic your institution already pays for.",
  description:
    "GlobalyAI is a conversion chatbot that lives on your institution's website. It answers the questions that decide whether an applicant keeps going: eligibility, cost, deadlines. It guides them to the right program from your approved content, and passes your admissions team the full conversation behind every inquiry.",
  url: "https://globalyai.com",
  company: "Globaly Inc.",
  founder: { name: "Amit Ranjitkar", role: "Founder & CEO", email: "amit@globalyapp.com" },
} as const;

/** The floating nav. Deliberately four links — see the brief's "keep it minimal". */
export const NAV_LINKS = [
  { label: "Product", href: "#product" },
  { label: "How it works", href: "#how-it-works" },
  { label: "For Institutions", href: "#institutions" },
  { label: "Privacy", href: "#privacy" },
] as const;

export const FOOTER_LINKS = [
  { label: "Product", href: "#product" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "For Institutions", href: "#institutions" },
  { label: "Privacy", href: "#privacy" },
  { label: "Contact", href: CAL_BOOKING_URL },
] as const;
