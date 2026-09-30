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

async function galleryFrom(overview: OverviewRow | undefined): Promise<string[] | null> {
  const pageUrl = overview?.source_url ?? overview?.website;
  if (!pageUrl) return null;
  const page = await readSnapshot(pageUrl);
  const images = page ? pickGalleryImages(page.markdown, pageUrl, overview?.logo_url ?? null) : [];
  return images.length > 0 ? images : null;
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
    cover_url: gallery?.[0] ?? null,
    state: overview?.state ?? null,
    city: overview?.city ?? null,
    address: overview?.address ?? null,
    postcode: overview?.zip_code ?? null,
  };
}

/** Institutions get the extracted social links too, plus ownership_type as their one extra field. */
export function institutionExtrasFrom(overview: OverviewRow | undefined) {
  const mapped = overview?.ownership_type ? OWNERSHIP_TYPE_MAP[overview.ownership_type.toLowerCase()] : undefined;
  return { institution_type: mapped ?? null, ...businessExtrasFrom(overview) };
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
