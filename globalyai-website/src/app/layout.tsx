import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import { SOCIAL_LINKS, siteConfig } from "@/lib/site";
import { FAQS } from "@/lib/faqs";
import "./globals.css";

// GlobalyOS-V2's type system: Geist for body copy, Space Grotesk for headings
// (500, the hero h1 at 600), Geist Mono for anything machine-written.
const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600"],
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfcfc" },
    { media: "(prefers-color-scheme: dark)", color: "#101217" },
  ],
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
    <html lang="en" data-scroll-behavior="smooth" className={`${geist.variable} ${spaceGrotesk.variable} ${geistMono.variable}`}>
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
