// Public student profiles — the anonymous read, plus the student's own publish switch.
//
// Two rules govern this file:
//
//   1. A profile with no slug is not published, and an unpublished profile is a 404 — not an
//      empty shell, not a 200 with nulls. An empty shell still confirms the account exists.
//   2. A section the student switched off is ABSENT from the payload, not null. A null tells a
//      scraper the field exists and is worth re-checking later; absence tells it nothing. It
//      also means a future field cannot leak by defaulting to "render null" — it has to be
//      added to the assembler on purpose.

import { NotFoundError } from "../../../shared/errors.js";
import * as repo from "../repositories/public-profiles.repository.js";
import * as usersRepo from "../repositories/platform-users.repository.js";
import {
  DEFAULT_VISIBILITY,
  resolveVisibility,
  type PublishProfileInput,
  type Visibility,
} from "../schemas/public-profile.schema.js";

/** Adds `key` only when `show` — the absence-not-null rule, in one place. */
function when<T>(show: boolean, key: string, value: T): Record<string, T> {
  return show ? { [key]: value } : {};
}

export async function getPublicProfile(slug: string) {
  const row = await repo.findPublishedProfileBySlug(slug);
  if (!row) throw new NotFoundError("Profile not found");

  const vis: Visibility = resolveVisibility(row.public_visibility);
  const userId = row.user_id;

  // A hidden section's child rows are never queried — cheaper, and nothing to leak by accident.
  const [education, work_experience, language_tests, academic_tests, destinations] = await Promise.all([
    vis.education ? repo.listPublicQualifications(userId) : [],
    vis.work_experience ? repo.listPublicWorkExperiences(userId) : [],
    vis.language_tests ? repo.listPublicTests(userId, "language") : [],
    vis.academic_tests ? repo.listPublicTests(userId, "academic") : [],
    vis.about ? repo.countryNames(Array.isArray(row.preferred_destinations) ? row.preferred_destinations : []) : [],
  ]);

  const profile = {
    // Always shown — V1's page renders these unconditionally (headline, avatar, Preferences card).
    slug: row.slug,
    first_name: row.first_name,
    last_name: row.last_name,
    photo_url: row.photo_url,
    institution_attended: row.institution_attended,
    nationality: row.nationality,
    budget_min: row.budget_min,
    budget_max: row.budget_max,
    // `about` — V1's "About" card.
    ...when(vis.about, "highest_degree_level", row.highest_degree_level),
    ...when(
      vis.about,
      "fields_of_study",
      (Array.isArray(row.fields_of_study) ? row.fields_of_study : [])
        .map((f) => f?.name)
        .filter((name): name is string => !!name),
    ),
    ...when(vis.about, "preferred_destinations", destinations),
    // `social_links` — V1 had five; V3 stores two.
    ...when(vis.social_links, "linkedin_url", row.linkedin_url),
    ...when(vis.social_links, "website_url", row.website_url),
    // `contact_info` — off by default. The city, street, postcode and coordinates that sit next
    // to this column in the table are never exposed at all, at any visibility setting.
    ...when(vis.contact_info, "country_of_residence", row.country_of_residence),
  };

  return { profile, education, work_experience, language_tests, academic_tests };
}

/** Publish or unpublish. Setting the slug IS the publish action; clearing it unpublishes. */
export async function setPublishState(userId: number, input: PublishProfileInput) {
  const user = await usersRepo.findById(userId);
  if (!user) throw new NotFoundError("User not found");
  const existing = await repo.findPublishState(userId);
  if (!existing) throw new NotFoundError("Profile not found");

  const visibility = input.visibility
    ? { ...resolveVisibility(existing.public_visibility), ...input.visibility }
    : (existing.public_visibility ?? null);

  // Re-derived rather than remembered: the derivation is deterministic from (name, id), so a
  // student who unpublishes and republishes gets the same URL back and their old links resolve.
  const profile_slug = input.published
    ? await repo.deriveSlug(userId, String(user.first_name ?? ""), String(user.last_name ?? ""))
    : null;

  await repo.setPublishState(userId, {
    profile_slug,
    public_visibility: visibility === null ? null : JSON.stringify(visibility),
  });

  return { profile_slug, public_visibility: visibility ?? DEFAULT_VISIBILITY };
}
