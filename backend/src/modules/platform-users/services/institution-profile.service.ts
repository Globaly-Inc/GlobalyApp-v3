// Self-service institution profile — the institution twin of businesses' getProfile/updateProfile.

import { masterKnex } from "../../../core/db/master-pool.js";
import * as storage from "../../../shared/storage/storageService.js";
import * as repo from "../repositories/platform-users.repository.js";
import * as jobsRepo from "../../superadmin/data-extraction/repositories/jobs.repository.js";
import { createJob, getSelfServiceStatus } from "../../superadmin/data-extraction/services/jobs.service.js";
import { listSiteUrls, getSnapshotMarkdownByUrl } from "../../superadmin/data-extraction/services/site-urls.service.js";
import { ConflictError, BadRequestError, NotFoundError } from "../../../shared/errors.js";
import type {
  InstitutionProfilePatchInput, StartExtractionInput, SiteUrlsQueryInput, SiteUrlSnapshotQueryInput,
} from "../schemas/institution-profile.schema.js";
import type { InstitutionRecord } from "../../../core/types.js";

async function withImagePreviews<
  T extends { logo_url?: string | null; cover_url?: string | null; gallery_images?: string[] | null; video_urls?: string[] | null },
>(inst: T): Promise<T> {
  const [logo_url, cover_url, gallery_images, video_urls] = await Promise.all([
    storage.resolvePreviewUrl(inst.logo_url),
    storage.resolvePreviewUrl(inst.cover_url),
    inst.gallery_images ? Promise.all(inst.gallery_images.map((p) => storage.resolvePreviewUrl(p))) : undefined,
    inst.video_urls ? Promise.all(inst.video_urls.map((p) => storage.resolvePreviewUrl(p))) : undefined,
  ]);
  return {
    ...inst,
    logo_url,
    cover_url,
    ...(gallery_images ? { gallery_images } : {}),
    ...(video_urls ? { video_urls } : {}),
  };
}

/**
 * Every self-registered institution has a non-null `source_job_id` from the moment it signs up —
 * `mintSelfServiceJob` (platform-users.service.ts) auto-creates a placeholder `extraction_jobs`
 * row (`source_type: "self_service"`, a fake `self-service.globalyhub.invalid` URL, status forced
 * "done") purely so the course tables have something to key on. So `source_job_id != null` alone
 * does NOT mean this institution has ever actually been extracted — the self-service API masks it
 * back to null on that placeholder so the rest of the app (and startExtraction's own guard below)
 * can keep treating "has a source_job_id" as "has real extraction data", exactly like businesses.
 */
async function withPublicSourceJobId<T extends { source_job_id: string | null }>(inst: T): Promise<T> {
  if (!inst.source_job_id) return inst;
  const sourceType = await jobsRepo.findJobSourceType(inst.source_job_id);
  return sourceType === "self_service" ? { ...inst, source_job_id: null } : inst;
}

export async function getMyInstitution(institution: InstitutionRecord) {
  return withImagePreviews(await withPublicSourceJobId(institution));
}

export async function updateMyInstitution(institutionId: number, patch: InstitutionProfilePatchInput) {
  const updated = await repo.updateInstitution(institutionId, patch);
  // Onboarding captures no website, so this is usually the first time the institution's own
  // job gets a real URL — and that URL is what scopes its courses in the AI embed widget.
  if (updated?.source_job_id && patch.website?.trim()) {
    await jobsRepo.syncOwnedJobUrl(updated.source_job_id, patch.website.trim());
  }
  return withImagePreviews(await withPublicSourceJobId(updated));
}

/**
 * Owner-triggered extraction for an institution with no REAL extracted data yet. The institution
 * twin of businesses' startExtraction: reuses the same paid pipeline (`createJob`), scoped to this
 * institution's own website, locked to one run (institutions have no category concept to gate on,
 * unlike businesses — every institution qualifies). Must ignore the auto-minted self-service
 * placeholder job (see withPublicSourceJobId) or this would never be callable for any institution.
 */
export async function startExtraction(institution: InstitutionRecord, platformUserId: number, input: StartExtractionInput) {
  return masterKnex.transaction(async (trx) => {
    const locked: InstitutionRecord | undefined = await trx("institutions").where({ id: institution.id }).forUpdate().first();
    if (!locked) throw new NotFoundError("Institution not found");
    if ((await withPublicSourceJobId(locked)).source_job_id) {
      throw new ConflictError("Extraction has already been started for this institution");
    }

    const website = input.website ?? locked.website;
    if (!website) throw new BadRequestError("A website is required to start extraction");

    let job: { id: string };
    try {
      job = await createJob(
        { institution_url: website, institution_name: locked.institution_name, source_type: "institution_self_service" },
        platformUserId,
      );
    } catch (err) {
      // createJob's own conflict means another job already covers this host — not a status this
      // institution can share (source_job_id -> job is a 1:1 link), so surface a distinct message.
      if (err instanceof ConflictError) {
        throw new ConflictError("An extraction for this website already exists. Contact support.");
      }
      throw err;
    }

    // Replaces the placeholder link entirely — the new job is real, so nothing needs masking here.
    const [updated] = await trx("institutions")
      .where({ id: institution.id })
      .update({ website, source_job_id: job.id, updated_at: trx.fn.now() })
      .returning("*");
    return withImagePreviews(updated);
  });
}

/** Progress + counts for the institution's own linked extraction job, or null if none started yet. */
export async function getExtractionStatus(institution: InstitutionRecord) {
  const sourceJobId = (await withPublicSourceJobId(institution)).source_job_id;
  if (!sourceJobId) return null;
  return getSelfServiceStatus(sourceJobId);
}

/**
 * The self-service twin of the admin's Site tab (site-urls.service.ts's listSiteUrls, reused
 * as-is) — scoped to the institution's OWN job only, forced to excluded: false since curating
 * what to exclude is an admin job, not something to expose here.
 */
export async function getExtractionSiteUrls(institution: InstitutionRecord, query: SiteUrlsQueryInput) {
  const sourceJobId = (await withPublicSourceJobId(institution)).source_job_id;
  if (!sourceJobId) {
    return { data: [], meta: { page: query.page, limit: query.limit, total: 0, totalPages: 0 }, counts: null };
  }
  return listSiteUrls(sourceJobId, { ...query, excluded: false });
}

/** The "View" action's content — same stored snapshot markdown the admin's Snapshots tab shows. */
export async function getExtractionSiteUrlSnapshot(institution: InstitutionRecord, query: SiteUrlSnapshotQueryInput) {
  const sourceJobId = (await withPublicSourceJobId(institution)).source_job_id;
  if (!sourceJobId) throw new NotFoundError("No extraction started for this institution");
  return getSnapshotMarkdownByUrl(sourceJobId, query.url);
}
