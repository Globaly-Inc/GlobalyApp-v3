import { masterKnex } from "../../../../core/db/master-pool.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { findOverviewByJobId, findCountryId } from "../repositories/promote.repository.js";
import type { OverviewRow } from "../repositories/promote.repository.js";

const logger = createChildLogger("overview-sync");

const OWNERSHIP_TYPE_MAP: Record<string, "Public" | "Private"> = { public: "Public", private: "Private" };

export async function baseProfileFieldsFrom(overview: OverviewRow | undefined) {
  return {
    description: overview?.description ?? null,
    logo_url: overview?.logo_url ?? null,
    website: overview?.website ?? null,
    country_id: await findCountryId(overview?.country),
    state: overview?.state ?? null,
    city: overview?.city ?? null,
    address: overview?.address ?? null,
    postcode: overview?.zip_code ?? null,
  };
}

/** Institutions have no social-link columns; ownership_type is their one extra field. */
export function institutionExtrasFrom(overview: OverviewRow | undefined) {
  const mapped = overview?.ownership_type ? OWNERSHIP_TYPE_MAP[overview.ownership_type.toLowerCase()] : undefined;
  return { institution_type: mapped ?? null };
}

/** Businesses have social-link columns institutions don't. */
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

export async function backfillSelfServiceProfile(jobId: string): Promise<void> {
  const overview = await findOverviewByJobId(jobId);
  if (!overview) return;

  const institution = await masterKnex("institutions").where({ source_job_id: jobId }).first();
  if (institution) {
    const mapped = {
      ...(await baseProfileFieldsFrom(overview)),
      ...institutionExtrasFrom(overview),
      email: overview.email ?? null,
      phone: overview.phone ?? null,
    };
    const patch = blankFieldsPatch(institution, mapped);
    if (Object.keys(patch).length > 0) {
      await masterKnex("institutions").where({ id: institution.id }).update({ ...patch, updated_at: masterKnex.fn.now() });
      logger.info("Backfilled self-service institution profile", { jobId, institutionId: institution.id, fields: Object.keys(patch) });
    }
    return;
  }

  const business = await masterKnex("businesses").where({ source_job_id: jobId }).first();
  if (!business) return;
  const mapped = {
    ...(await baseProfileFieldsFrom(overview)),
    ...businessExtrasFrom(overview),
    email: overview.email ?? null,
    phone: overview.phone ?? null,
  };
  const patch = blankFieldsPatch(business, mapped);
  if (Object.keys(patch).length > 0) {
    await masterKnex("businesses").where({ id: business.id }).update({ ...patch, updated_at: masterKnex.fn.now() });
    logger.info("Backfilled self-service business profile", { jobId, businessId: business.id, fields: Object.keys(patch) });
  }
}
