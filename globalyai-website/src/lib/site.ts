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

/**
 * The footer nav, and the only list of links on the page — the bar itself
 * carries the logo, the theme toggle and the CTA and nothing else.
 *
 * Every entry has to name a section the page actually mounts. How It Works
 * and Privacy went with their sections (24 Sep 2026); a link to a section
 * that exists in the source but is not rendered just parks the visitor at
 * the footer with nothing to show for the click.
 */
export const FOOTER_LINKS = [
  { label: "Product", href: "#product" },
  { label: "For Institutions", href: "#institutions" },
  { label: "Contact", href: CAL_BOOKING_URL },
] as const;
