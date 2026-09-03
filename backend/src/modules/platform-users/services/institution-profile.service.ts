// Self-service institution profile — the institution twin of businesses' getProfile/updateProfile.

import * as storage from "../../../shared/storage/storageService.js";
import * as repo from "../repositories/platform-users.repository.js";
import type { InstitutionProfilePatchInput } from "../schemas/institution-profile.schema.js";
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

export async function getMyInstitution(institution: InstitutionRecord) {
  return withImagePreviews(institution);
}

export async function updateMyInstitution(institutionId: number, patch: InstitutionProfilePatchInput) {
  const updated = await repo.updateInstitution(institutionId, patch);
  return withImagePreviews(updated);
}
