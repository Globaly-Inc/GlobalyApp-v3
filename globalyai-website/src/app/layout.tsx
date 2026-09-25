import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Inter, JetBrains_Mono, Nunito_Sans, Plus_Jakarta_Sans } from "next/font/google";
import { SOCIAL_LINKS, siteConfig } from "@/lib/site";
import { FAQS } from "@/lib/faqs";
import "./globals.css";

// Nunito Sans throughout, matching the reference design language: rounded and
// friendly, and readable enough to carry body copy as well as headings.
const nunitoSans = Nunito_Sans({
  variable: "--font-nunito-sans",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  display: "swap",
});

// Variation 2's face. daily.dev sets its own DD Display with Plus Jakarta
// Sans as the fallback, and Plus Jakarta is already a Globaly brand font —
// GlobalyApp-v3 loads it for the home hero.
const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

// Variation 3's pair. The agentic genre runs on a precise grotesque with a
// mono for anything machine-written — step names, timings, statuses.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

// Variation 5's face. Geist is the neo-grotesque the current generation of
// agent platforms is set in, which is the genre variation 5 is arguing in.
const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const TITLE = `${siteConfig.name}: ${siteConfig.tagline}`;

// Without this every share of the link renders as a blank gray box, because the
// Twitter card is declared summary_large_image. 1200x630 is the size both
// Facebook and X crop from.
const OG_IMAGE = {
  url: "/og.png",
  width: 1200,
  height: 630,
  alt: `${siteConfig.name}: an AI counselor for your institution, trained on your own content.`,
};

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: TITLE,
  description: siteConfig.description,
  applicationName: siteConfig.name,
  authors: [{ name: siteConfig.company }],
  alternates: { canonical: siteConfig.url },
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    title: TITLE,
    description: siteConfig.description,
    url: siteConfig.url,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: siteConfig.description,
    images: [OG_IMAGE.url],
  },
};

export const viewport: Viewport = {
  themeColor: "#012e8a",
};

// The eleven answers on the page, offered to Google and to the AI search
// surfaces that read structured data. Generated from the same array the FAQ
// section renders, so the two can never drift apart.
const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((faq) => ({
    "@type": "Question",
    name: faq.q,
    acceptedAnswer: { "@type": "Answer", text: faq.a },
  })),
};

const PRODUCT_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: siteConfig.name,
  applicationCategory: "BusinessApplication",
  description: siteConfig.description,
  url: siteConfig.url,
  publisher: {
    "@type": "Organization",
    name: siteConfig.company,
    address: {
      "@type": "PostalAddress",
      streetAddress: siteConfig.address.street,
      addressLocality: siteConfig.address.locality,
      addressRegion: siteConfig.address.region,
      postalCode: siteConfig.address.postalCode,
      addressCountry: siteConfig.address.country,
    },
    sameAs: SOCIAL_LINKS.map((link) => link.href),
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${nunitoSans.variable} ${plusJakarta.variable} ${inter.variable} ${jetbrainsMono.variable} ${geist.variable} ${geistMono.variable}`}>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-[var(--primary)] focus:px-5 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-white"
        >
          Skip to content
        </a>
        {children}
        <script
          type="application/ld+json"
          // Static objects defined above. No user input reaches this.
          dangerouslySetInnerHTML={{ __html: JSON.stringify([PRODUCT_JSON_LD, FAQ_JSON_LD]) }}
        />
      </body>
    </html>
  );
}
