import { masterKnex } from "../../../core/db/master-pool.js";

const COLUMNS = ["reviewed_courses_at", "welcome_pending"] as const;

export interface OnboardingProgressRow {
  reviewed_courses_at: string | null;
  /** Owes its owner the welcome splash. True only between accepting an invite and dismissing it. */
  welcome_pending: boolean;
}

export async function findByBusinessId(businessId: number): Promise<OnboardingProgressRow | undefined> {
  return masterKnex("business_onboarding_progress").where({ business_id: businessId }).first(...COLUMNS);
}

export async function findByInstitutionId(institutionId: number): Promise<OnboardingProgressRow | undefined> {
  return masterKnex("business_onboarding_progress").where({ institution_id: institutionId }).first(...COLUMNS);
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

/* Each `do update set` names ONLY its own column, so arming or clearing the splash never touches a
 * courses review on a row that already exists. */

/** Owe this org a welcome splash — called when an onboarding invitation is accepted. The org is
 *  created moments earlier in that same flow, so the upsert's insert branch is the live one. */
export async function markWelcomePendingForBusiness(businessId: number): Promise<void> {
  await masterKnex.raw(
    `insert into business_onboarding_progress (business_id, welcome_pending)
     values (?, true)
     on conflict (business_id) where business_id is not null
     do update set welcome_pending = true, updated_at = now()`,
    [businessId],
  );
}

export async function markWelcomePendingForInstitution(institutionId: number): Promise<void> {
  await masterKnex.raw(
    `insert into business_onboarding_progress (institution_id, welcome_pending)
     values (?, true)
     on conflict (institution_id) where institution_id is not null
     do update set welcome_pending = true, updated_at = now()`,
    [institutionId],
  );
}

/** The splash has played. An UPDATE, not an upsert: nothing is owed to an org with no row, so
 *  there is nothing to record for one. */
export async function clearWelcomePendingForBusiness(businessId: number): Promise<void> {
  await masterKnex("business_onboarding_progress")
    .where({ business_id: businessId })
    .update({ welcome_pending: false, updated_at: masterKnex.fn.now() });
}

export async function clearWelcomePendingForInstitution(institutionId: number): Promise<void> {
  await masterKnex("business_onboarding_progress")
    .where({ institution_id: institutionId })
    .update({ welcome_pending: false, updated_at: masterKnex.fn.now() });
}
