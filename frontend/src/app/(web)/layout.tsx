import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Navbar } from "./components/navbar";
import { Footer } from "./components/footer";
import { CookieConsent } from "./components/cookie-consent";
import { BackToTop } from "./components/back-to-top";

const TITLE = "Globaly — World #1 AI Integrated Education Ecosystem";
const OG_DESCRIPTION =
  "Connecting Students with Domestic and International Education Providers, Education Agents and Service Providers";

export const metadata: Metadata = {
  title: TITLE,
  description:
    "Globaly is the World #1 AI Integrated Education Ecosystem — connecting students with counsellors, education agents, institutions and service providers worldwide. Search, enroll and settle.",
  authors: [{ name: "Globaly.ai" }],
  alternates: { canonical: "https://www.globalyapp.com/" },
  verification: { google: "BZ5srMbEp1MHzey_WGmXmNAbMx7Bh6Bf-WTM6UsKb94" },
  openGraph: {
    type: "website",
    siteName: "Globaly",
    title: TITLE,
    description: OG_DESCRIPTION,
    url: "https://www.globalyapp.com/",
    images: ["/globaly-logo.png"],
  },
  twitter: {
    card: "summary_large_image",
    site: "@GlobalyAI",
    title: TITLE,
    description: OG_DESCRIPTION,
    images: ["/globaly-logo.png"],
  },
};

const ORGANIZATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Globaly",
  alternateName: "Globaly.app",
  url: "https://www.globalyapp.com",
  logo: "https://www.globalyapp.com/globaly-logo.png",
  description: OG_DESCRIPTION,
  sameAs: [
    "https://www.linkedin.com/company/globaly-app",
    "https://twitter.com/globaly_app",
    "https://facebook.com/globaly.app",
    "https://instagram.com/globaly.app",
  ],
};

const WEBSITE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Globaly",
  url: "https://www.globalyapp.com",
  potentialAction: {
    "@type": "SearchAction",
    target: "https://www.globalyapp.com/search?q={search_term_string}",
    "query-input": "required name=search_term_string",
  },
};

export default function WebLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_JSON_LD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE_JSON_LD) }} />
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
      <CookieConsent />
      <BackToTop />
    </div>
  );
}
