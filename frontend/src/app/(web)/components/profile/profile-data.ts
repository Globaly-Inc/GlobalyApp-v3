// The normalized shape every public detail page (institution, education counselor, visa service,
// migration agent) feeds into <EntityProfile>. V1 rendered all four through a single
// BusinessPublicPreview component; keeping one shape here preserves that so the four pages
// can't drift apart again.

import type { SocialName } from "../social-icon";

export type ProfileLocation = {
  id: string;
  name: string;
  /** Full postal address — also what the map geocodes when lat/lng are missing. */
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type ProfileSocial = { name: SocialName; url: string };

export type ProfileRegistration = { label: string; value: string };

export type ProfileData = {
  name: string;
  categoryLabel: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  /** The line under the profile name, e.g. "Sydney, New South Wales, Australia". */
  locationLabel: string | null;
  verified: boolean;
  description: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  addressLabel: string | null;
  socials: ProfileSocial[];
  locations: ProfileLocation[];
  registration: ProfileRegistration[];
};

type SocialSource = {
  facebook_url?: string | null;
  twitter_url?: string | null;
  linkedin_url?: string | null;
  instagram_url?: string | null;
  youtube_url?: string | null;
};

const SOCIAL_FIELDS: { key: keyof SocialSource; name: SocialName }[] = [
  { key: "facebook_url", name: "facebook" },
  { key: "twitter_url", name: "twitter" },
  { key: "linkedin_url", name: "linkedin" },
  { key: "instagram_url", name: "instagram" },
  { key: "youtube_url", name: "youtube" },
];

export function toProfileSocials(source: SocialSource): ProfileSocial[] {
  return SOCIAL_FIELDS.flatMap(({ key, name }) => {
    const url = source[key];
    return url ? [{ name, url }] : [];
  });
}

/** Joins the set parts of an address into one comma-separated line, or null when all are empty. */
export function joinParts(...parts: (string | null | undefined)[]): string | null {
  const joined = parts.filter(Boolean).join(", ");
  return joined || null;
}

type RegLicense = { type?: string; number?: string };
type RegLicenses = { business_registration?: RegLicense; licenses?: RegLicense[] };

/**
 * Flattens the owner-maintained `registration_licenses` JSON (plus the plain registration-number
 * column, when the JSON has none) into the label/value rows the sidebar card renders.
 */
export function toProfileRegistration(
  registrationNumber: string | null | undefined,
  registrationLicenses: Record<string, unknown> | null | undefined,
): ProfileRegistration[] {
  const reg = (registrationLicenses ?? {}) as RegLicenses;
  const rows: ProfileRegistration[] = [];

  const primary = reg.business_registration;
  if (primary?.number) rows.push({ label: primary.type || "Registration", value: primary.number });
  else if (registrationNumber) rows.push({ label: "Registration", value: registrationNumber });

  for (const license of reg.licenses ?? []) {
    if (license.number) rows.push({ label: license.type || "Licence", value: license.number });
  }
  return rows;
}

/** Postgres returns `decimal` columns as strings — coordinates need to reach the map as numbers. */
export function toNumber(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
