import { masterKnex } from "../../../../core/db/master-pool.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { countryCurrency } from "../../../../shared/country-currency.js";
import { readSnapshot } from "./page-store.js";
import { pickGalleryImages } from "./gallery-images.js";
import { copyExternalImage } from "./image-copy.js";
import { isExternalUrl } from "../../../../shared/storage/storageService.js";
import { generateSubdomain } from "../../../../shared/subdomain.js";
import { findOverviewByJobId, findCountryId } from "../repositories/promote.repository.js";
import type { OverviewRow } from "../repositories/promote.repository.js";

const logger = createChildLogger("overview-sync");

const OWNERSHIP_TYPE_MAP: Record<string, "Public" | "Private"> = { public: "Public", private: "Private" };

/** Photos scraped from the overview's page snapshot — up to 3, logo and icons skipped. Tries the
 * overview's source page then the homepage, each main-content snapshot then the full one: the
 * main-content cut often drops a homepage's hero/banner photos. */
async function scrapeGallery(overview: OverviewRow | undefined): Promise<string[] | null> {
  const pages = [...new Set([overview?.source_url, overview?.website].filter((u): u is string => !!u))];
  for (const pageUrl of pages) {
    for (const mode of ["main", "full"] as const) {
      const page = await readSnapshot(pageUrl, mode);
      const images = page ? pickGalleryImages(page.markdown, pageUrl, overview?.logo_url ?? null) : [];
      if (images.length > 0) return images;
    }
  }
  return null;
}

/** The overview's stored media when it has any (an admin may have corrected it), else scraped now. */
async function galleryFrom(overview: OverviewRow | undefined): Promise<string[] | null> {
  // An array, even empty, is a decision already made (picked, or cleared by an admin) — don't re-scrape.
  if (Array.isArray(overview?.gallery_images)) return overview.gallery_images.length ? overview.gallery_images : null;
  return scrapeGallery(overview);
}

/**
 * Stores the cover and up to 3 media photos on the job's overview, picked from its homepage —
 * only while they're unset (null), so an admin's correction or clearing ([] / "" cover) is never redone.
 */
export async function pickOverviewMedia(jobId: string): Promise<void> {
  const overview = await findOverviewByJobId(jobId);
  if (!overview || overview.gallery_images != null) return;
  const gallery = await scrapeGallery(overview);
  if (!gallery) return; // homepage not snapshotted yet / no photos — a later write tries again
  await masterKnex("superadmin.extraction_institution_overview").where({ job_id: jobId }).whereNull("gallery_images")
    .update({ gallery_images: JSON.stringify(gallery), cover_url: overview.cover_url ?? gallery[0], updated_at: masterKnex.fn.now() });
}

export async function baseProfileFieldsFrom(overview: OverviewRow | undefined) {
  const country_id = await findCountryId(overview?.country);
  const gallery = await galleryFrom(overview);
  return {
    description: overview?.description ?? null,
    logo_url: overview?.logo_url ?? null,
    website: overview?.website ?? null,
    country_id,
    // Default currency follows the country; only fills a blank one (blankFieldsPatch / repatch).
    currency: await countryCurrency(country_id),
    // A few photos from the scraped homepage for the Media section, and the first as the cover —
    // each only when the profile has none yet.
    gallery_images: gallery,
    // "" is an admin's clear (see pickOverviewMedia) — no cover, and no gallery photo in its place.
    cover_url: overview?.cover_url != null ? overview.cover_url || null : gallery?.[0] ?? null,
    state: overview?.state ?? null,
    city: overview?.city ?? null,
    address: overview?.address ?? null,
    postcode: overview?.zip_code ?? null,
  };
}

/** Institutions get the extracted social links too, plus ownership_type and the labelled "other"
 * links (institutions.other_social_links — businesses have no such column). */
export function institutionExtrasFrom(overview: OverviewRow | undefined) {
  const mapped = overview?.ownership_type ? OWNERSHIP_TYPE_MAP[overview.ownership_type.toLowerCase()] : undefined;
  const others = overview?.other_social_links;
  return {
    institution_type: mapped ?? null,
    ...businessExtrasFrom(overview),
    // jsonb: stringified, or pg would send the array as a Postgres array literal.
    other_social_links: others?.length ? JSON.stringify(others) : null,
  };
}

/** The extracted social links — both businesses and institutions have these columns. */
export function businessExtrasFrom(overview: OverviewRow | undefined) {
  return {
    linkedin_url: overview?.linkedin_url ?? null,
    facebook_url: overview?.facebook_url ?? null,
    instagram_url: overview?.instagram_url ?? null,
    twitter_url: overview?.twitter_url ?? null,
    youtube_url: overview?.youtube_url ?? null,
  };
}

function blankFieldsPatch<T extends Record<string, unknown>>(current: T, mapped: Partial<T>): Partial<T> {
  const patch: Partial<T> = {};
  for (const key of Object.keys(mapped) as (keyof T)[]) {
    const currentValue = current[key];
    const mappedValue = mapped[key];
    const isBlank = currentValue === null || currentValue === undefined || currentValue === "";
    const hasValue = mappedValue !== null && mappedValue !== undefined && mappedValue !== "";
    if (isBlank && hasValue) patch[key] = mappedValue;
  }
  return patch;
}

/** Subdomains are unique across both tables; the org's own row doesn't count against itself. */
const subdomainTakenExcept = (table: "institutions" | "businesses", ownId: number) => async (candidate: string) => {
  const [institution, business] = await Promise.all([
    masterKnex("institutions").where({ subdomain: candidate }).modify((q) => { if (table === "institutions") q.whereNot({ id: ownId }); }).first("id"),
    masterKnex("businesses").where({ subdomain: candidate }).modify((q) => { if (table === "businesses") q.whereNot({ id: ownId }); }).first("id"),
  ]);
  return Boolean(institution || business);
};

/**
 * A blank name being filled means the org was created nameless by an onboarding invite, whose
 * subdomain was only a stand-in from the email domain — so it's rebuilt from the real name in the
 * same write. Retries a lost unique race with a fresh candidate, as registerBusiness does.
 */
async function applyPatch(table: "institutions" | "businesses", id: number, patch: Record<string, unknown>, nameColumn: string) {
  const name = patch[nameColumn];
  for (let attempt = 0; ; attempt++) {
    const subdomain = typeof name === "string" ? await generateSubdomain(name, subdomainTakenExcept(table, id)) : undefined;
    try {
      await masterKnex(table).where({ id }).update({ ...patch, ...(subdomain ? { subdomain } : {}), updated_at: masterKnex.fn.now() });
      return subdomain;
    } catch (err) {
      if (!subdomain || (err as { code?: string }).code !== "23505" || attempt === 4) throw err;
    }
  }
}

export async function backfillSelfServiceProfile(jobId: string): Promise<void> {
  const overview = await findOverviewByJobId(jobId);
  if (!overview) return;

  const institution = await masterKnex("institutions").where({ source_job_id: jobId }).first();
  if (institution) {
    const mapped = {
      ...(await baseProfileFieldsFrom(overview)),
      ...institutionExtrasFrom(overview),
      // Only lands while blank — onboarding invites create the org nameless for exactly this.
      institution_name: overview.name ?? null,
      email: overview.email ?? null,
      phone: overview.phone ?? null,
    };
    const patch = blankFieldsPatch(institution, mapped);
    if (Object.keys(patch).length > 0) {
      const subdomain = await applyPatch("institutions", institution.id, patch, "institution_name");
      logger.info("Backfilled self-service institution profile", { jobId, institutionId: institution.id, fields: Object.keys(patch), subdomain });
    }
    await localizeImages("institutions", Number(institution.id), jobId);
    return;
  }

  const business = await masterKnex("businesses").where({ source_job_id: jobId }).first();
  if (!business) return;
  const mapped = {
    ...(await baseProfileFieldsFrom(overview)),
    ...businessExtrasFrom(overview),
    business_name: overview.name ?? null,
    email: overview.email ?? null,
    phone: overview.phone ?? null,
  };
  const patch = blankFieldsPatch(business, mapped);
  if (Object.keys(patch).length > 0) {
    const subdomain = await applyPatch("businesses", business.id, patch, "business_name");
    logger.info("Backfilled self-service business profile", { jobId, businessId: business.id, fields: Object.keys(patch), subdomain });
  }
  await localizeImages("businesses", Number(business.id), jobId);
}

/** Overview column → the org column it fills, where the names differ. */
const PROFILE_COLUMN: Record<string, { institutions: string; businesses: string | null }> = {
  name: { institutions: "institution_name", businesses: "business_name" },
  zip_code: { institutions: "postcode", businesses: "postcode" },
  ownership_type: { institutions: "institution_type", businesses: null },
  other_social_links: { institutions: "other_social_links", businesses: null },
};
const SAME_NAME_COLUMNS = new Set([
  "description", "logo_url", "website", "email", "phone", "address", "city", "state", "cover_url", "gallery_images",
  "linkedin_url", "facebook_url", "instagram_url", "twitter_url", "youtube_url",
]);

/**
 * An admin's edit to a job's overview (the extraction's Institution tab), pushed onto the org the
 * job feeds — so a correction made in Super Admin shows in the business portal and public profile.
 * Overwrites, unlike the fill-blanks backfill: the admin is deliberately correcting this value.
 * Only the edited fields move. The subdomain is never regenerated, even on a rename.
 */
export async function pushOverviewEdit(jobId: string, edited: Record<string, unknown>): Promise<void> {
  for (const table of ["institutions", "businesses"] as const) {
    const org = await masterKnex(table).where({ source_job_id: jobId }).first("id");
    if (!org) continue;
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(edited)) {
      if (key === "country") {
        patch.country_id = await findCountryId(typeof value === "string" ? value : null);
      } else if (key === "ownership_type") {
        if (table === "institutions") patch.institution_type = typeof value === "string" ? OWNERSHIP_TYPE_MAP[value.toLowerCase()] ?? null : null;
      } else if (key === "other_social_links") {
        if (table === "institutions") patch.other_social_links = Array.isArray(value) && value.length ? JSON.stringify(value) : null;
      } else if (PROFILE_COLUMN[key]) {
        const column = PROFILE_COLUMN[key][table];
        if (column) patch[column] = value;
      } else if (SAME_NAME_COLUMNS.has(key)) {
        patch[key] = value;
      }
    }
    // A blank name would leave the org nameless — keep the old one.
    if (patch.institution_name === "" || patch.institution_name === null) delete patch.institution_name;
    if (patch.business_name === "" || patch.business_name === null) delete patch.business_name;
    if (patch.cover_url === "") patch.cover_url = null; // the overview's "cleared" marker; the org just has none
    if (Object.keys(patch).length === 0) continue;
    await masterKnex(table).where({ id: org.id }).update({ ...patch, updated_at: masterKnex.fn.now() });
    logger.info("Pushed overview edit to profile", { jobId, table, id: org.id, fields: Object.keys(patch) });
    if ("cover_url" in patch || "gallery_images" in patch) await localizeImages(table, Number(org.id), jobId);
  }
}

/** Where copied extraction photos live — shared by every org on the job, not one org's own folder. */
export const extractedMediaDir = (jobId: string) => `public/extracted/${jobId}/gallery`;

/**
 * Swaps any hot-linked (external) gallery/cover image on this org for a copy in our storage
 * (copyExternalImage), so it survives the site removing it and the crop tool can load it. One that
 * can't be copied keeps its URL. Also migrates rows extracted before copies were made.
 */
export async function localizeImages(table: "institutions" | "businesses", id: number, jobId: string): Promise<void> {
  const row = await masterKnex(table).where({ id }).first("gallery_images", "cover_url");
  if (!row) return;
  const copies = new Map<string, string>();
  const local = async (url: string) => {
    if (!isExternalUrl(url)) return url;
    if (!copies.has(url)) copies.set(url, (await copyExternalImage(url, extractedMediaDir(jobId))) ?? url);
    return copies.get(url)!;
  };
  const gallery: string[] | null = row.gallery_images ? await Promise.all((row.gallery_images as string[]).map(local)) : row.gallery_images;
  const cover: string | null = row.cover_url ? await local(row.cover_url) : row.cover_url;
  const changed = cover !== row.cover_url || (gallery ?? []).some((g, i) => g !== row.gallery_images[i]);
  if (!changed) return;
  await masterKnex(table).where({ id }).update({ gallery_images: gallery, cover_url: cover, updated_at: masterKnex.fn.now() });
  logger.info("Copied extracted images into storage", { table, id, jobId, copied: [...copies.values()].filter((v) => !isExternalUrl(v)).length });
}
