// Anonymous reads: the public ambassador profile and the public program page.
//
// Behavioural spec: V2 routes/ambassadors-public.ts.
//
// ── the projection is the security boundary ──
// These handlers run OUTSIDE the authenticated scope, so nothing upstream is
// filtering the row for them. The rule this module enforces, and tests:
//   NEVER project user_id, email, phone, stripe_account_id,
//   stripe_onboarding_complete, deactivation_reason, or any *_earnings_minor
//   column onto an unauthenticated response.
// The columns are picked one by one below rather than spread from the row, so
// adding a column to `ambassadors` cannot silently widen a public payload.
// (V2's ambassadors_public view did expose user_id; V3 drops it — an internal
// serial identity is not part of a public profile and no V3 page needs it.)

import { NotFoundError } from "../../../shared/errors.js";
import * as repo from "../repositories/programs.repository.js";
import { listPublicCertificatesForUser } from "../../training/repositories/training.repository.js";

const MAX_PUBLIC_REVIEWS = 10;
const MAX_PUBLIC_CERTIFICATES = 50;

export async function getPublicProgram(idOrSlug: string) {
  const program = await repo.findActiveProgramByRef(idOrSlug);
  if (!program) throw new NotFoundError("Program not found");
  return {
    id: program.id,
    business_id: program.business_id,
    name: program.name,
    slug: program.slug,
    description: program.description,
    welcome_video_url: program.welcome_video_url,
    status: program.status,
    application_stages: program.application_stages,
    compensation_model: program.compensation_model,
    requirements: program.requirements,
    created_at: program.created_at,
    updated_at: program.updated_at,
  };
}

export async function getPublicAmbassador(id: number) {
  const row = await repo.findPublicAmbassador(id);
  if (!row) throw new NotFoundError("Ambassador not found");

  const [reviews, certificates] = await Promise.all([
    repo.listPublicReviews(id, MAX_PUBLIC_REVIEWS),
    listPublicCertificatesForUser(row.user_id, MAX_PUBLIC_CERTIFICATES),
  ]);

  return {
    id: row.id,
    program_id: row.program_id,
    bio: row.bio,
    photo_url: row.photo_url,
    major: row.major,
    year: row.year,
    country_of_origin: row.country_of_origin,
    languages: row.languages,
    interests: row.interests,
    avg_rating: Number(row.avg_rating),
    total_inquiries: row.total_inquiries,
    total_resolved: row.total_resolved,
    typical_response_time_minutes: row.typical_response_time_minutes,
    is_online: row.is_online,
    last_active_at: row.last_active_at,
    joined_at: row.joined_at,
    program_name: row.program_name,
    program_slug: row.program_slug,
    business_id: row.business_id,
    institution_name: row.institution_name,
    institution_logo_url: row.institution_logo_url,
    reviews,
    certificates,
  };
}
