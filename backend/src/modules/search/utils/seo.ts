// The SEO contract for public pages (Wave C2b).
//
// This is a backend concern rather than a frontend one because the canonical URL
// of a listing is a property of the listing, not of whichever page happens to
// render it: the sitemap, the JSON-LD graph and the <link rel="canonical"> tag
// must all agree, and three independent copies of the rule do not stay in step.
// V1 proved that — its city pages canonicalised to `/country/{a}/{b}` while the
// route was `/city/{a}/{b}`, so every city page pointed search engines at a 404.
//
// Titles and descriptions follow V1's InstitutionProfilePage verbatim (its
// <Helmet> block is the only written-down contract either legacy system has), and
// the JSON-LD types follow the same page: EducationalOrganization for an
// institution, plain Organization for an agent (V1 reserved ProfessionalService
// for MARA registrations, which V3 has not promoted yet).

import { config } from "../../../config.js";
import { courseSlug } from "./slug.js";

/** Google truncates around 160 characters; longer is wasted markup. */
const DESCRIPTION_LIMIT = 160;

export const PUBLIC_PATHS = {
  institution: (slug: string) => `/institutions/${slug}`,
  agent: (slug: string) => `/agents/${slug}`,
  service: (name: string, id: string) => `/course/${courseSlug(name, id)}`,
  country: (slug: string) => `/country/${slug}`,
  city: (countrySlug: string, citySlug: string) => `/city/${countrySlug}/${citySlug}`,
} as const;

/** The origin the public site is served from — never the API's own host. */
export function baseUrl(): string {
  return config.WEB_APP_URL.replace(/\/+$/, "");
}

export function absoluteUrl(path: string): string {
  return `${baseUrl()}${path}`;
}

export function metaDescription(...candidates: (string | null | undefined)[]): string {
  const text = candidates.find((c) => c && c.trim().length > 0) ?? "";
  return text.replace(/\s+/g, " ").trim().slice(0, DESCRIPTION_LIMIT);
}

export interface SeoBlock {
  canonical_url: string;
  title: string;
  description: string;
  og_image: string | null;
  structured_data: Record<string, unknown>;
}

export interface OrgSeoInput {
  kind: "institution" | "agent";
  slug: string;
  name: string;
  description?: string | null;
  logo_url?: string | null;
  cover_url?: string | null;
  city?: string | null;
  state?: string | null;
  postcode?: string | null;
  address?: string | null;
  country_name?: string | null;
  website?: string | null;
}

export function orgSeo(org: OrgSeoInput): SeoBlock {
  const canonical = absoluteUrl(PUBLIC_PATHS[org.kind](org.slug));
  const title =
    org.kind === "institution"
      ? `${org.name} — Courses, Admissions & Profile | Globaly`
      : `${org.name} — Education Agent Profile | Globaly`;
  const description = metaDescription(org.description, `Learn about ${org.name} on Globaly.`);
  const image = org.logo_url ?? org.cover_url ?? null;

  const address = [org.address, org.city, org.state, org.postcode, org.country_name].filter(Boolean);

  return {
    canonical_url: canonical,
    title,
    description,
    og_image: image,
    structured_data: {
      "@context": "https://schema.org",
      "@type": org.kind === "institution" ? "EducationalOrganization" : "Organization",
      name: org.name,
      url: canonical,
      description,
      ...(image ? { logo: image } : {}),
      ...(org.website ? { sameAs: [org.website] } : {}),
      ...(address.length
        ? {
            address: {
              "@type": "PostalAddress",
              ...(org.address ? { streetAddress: org.address } : {}),
              ...(org.city ? { addressLocality: org.city } : {}),
              ...(org.state ? { addressRegion: org.state } : {}),
              ...(org.postcode ? { postalCode: org.postcode } : {}),
              ...(org.country_name ? { addressCountry: org.country_name } : {}),
            },
          }
        : {}),
    },
  };
}

export interface ServiceSeoInput {
  service_id: string;
  name: string;
  description?: string | null;
  overview?: string | null;
  image_url?: string | null;
  provider_name?: string | null;
}

export function serviceSeo(service: ServiceSeoInput): SeoBlock {
  const canonical = absoluteUrl(PUBLIC_PATHS.service(service.name, service.service_id));
  const provider = service.provider_name ? ` at ${service.provider_name}` : "";
  const description = metaDescription(
    service.description,
    service.overview,
    `${service.name}${provider} — fees, intakes and entry requirements on Globaly.`,
  );

  return {
    canonical_url: canonical,
    title: `${service.name}${provider} | Globaly`,
    description,
    og_image: service.image_url ?? null,
    structured_data: {
      "@context": "https://schema.org",
      "@type": "Course",
      name: service.name,
      url: canonical,
      description,
      ...(service.provider_name
        ? { provider: { "@type": "EducationalOrganization", name: service.provider_name } }
        : {}),
    },
  };
}
