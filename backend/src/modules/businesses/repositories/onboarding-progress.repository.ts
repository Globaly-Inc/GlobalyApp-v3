import { masterKnex } from "../../../core/db/master-pool.js";

export interface OnboardingProgressRow {
  reviewed_courses_at: string | null;
}

export async function findByBusinessId(businessId: number): Promise<OnboardingProgressRow | undefined> {
  return masterKnex("business_onboarding_progress").where({ business_id: businessId }).first("reviewed_courses_at");
}

export async function findByInstitutionId(institutionId: number): Promise<OnboardingProgressRow | undefined> {
  return masterKnex("business_onboarding_progress").where({ institution_id: institutionId }).first("reviewed_courses_at");
}

export async function markCoursesReviewedForBusiness(businessId: number): Promise<void> {
  await masterKnex.raw(
    `insert into business_onboarding_progress (business_id, reviewed_courses_at)
     values (?, now())
     on conflict (business_id) where business_id is not null
     do update set reviewed_courses_at = now(), updated_at = now()`,
    [businessId],
  );
}

export async function markCoursesReviewedForInstitution(institutionId: number): Promise<void> {
  await masterKnex.raw(
    `insert into business_onboarding_progress (institution_id, reviewed_courses_at)
     values (?, now())
     on conflict (institution_id) where institution_id is not null
     do update set reviewed_courses_at = now(), updated_at = now()`,
    [institutionId],
  );
}
