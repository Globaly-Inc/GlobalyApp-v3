// Profile completion — the single source of truth.
//
// This was previously computed ONLY in the browser (frontend profile-completion.ts), and
// platform_user_profiles.completion_percentage was never written by anything. Referral qualification
// needs a server-side figure, and two implementations of the same 8-item rule would inevitably drift,
// so the browser copy is deleted and everything reads this.

import { createChildLogger } from "../../../shared/logger.js";
import { onIndividualQualified } from "../../referrals/services/qualification.service.js";
import * as repo from "../repositories/platform-users.repository.js";

const logger = createChildLogger("profile-completion");

export interface CompletionItem {
  label: string;
  met: boolean;
}

export interface Completion {
  percentage: number;
  items: CompletionItem[];
}

/**
 * The 8 criteria, ported verbatim from the frontend so the percentage users already see is unchanged.
 * Labels are part of the contract — the UI renders them as the "what is still missing" checklist.
 */
export function computeCompletion(
  user: { first_name?: string | null; last_name?: string | null; photo_url?: string | null },
  profile: Record<string, unknown> | null,
  qualificationCount: number,
  languageTestCount: number,
): Completion {
  const p = profile ?? {};
  const items: CompletionItem[] = [
    { label: "Full name", met: !!(user.first_name && user.last_name) },
    { label: "Profile photo", met: !!user.photo_url },
    { label: "Nationality", met: !!p.nationality_id },
    { label: "Country of residence", met: !!p.country_of_residence_id },
    { label: "Education background", met: qualificationCount > 0 },
    { label: "Test scores", met: languageTestCount > 0 },
    { label: "Budget range", met: !!(p.budget_min && p.budget_max) },
    {
      label: "Preferred destinations",
      met: Array.isArray(p.preferred_destinations) && p.preferred_destinations.length > 0,
    },
  ];
  const percentage = Math.round((items.filter((i) => i.met).length / items.length) * 100);
  return { percentage, items };
}

/** Read-only: compute from current data without writing. Used by getProfile. */
export async function loadCompletion(userId: number): Promise<Completion> {
  const [user, profile, qualifications, languageTests] = await Promise.all([
    repo.findById(userId),
    repo.findProfileByUserId(userId),
    repo.listQualifications(userId),
    repo.listLanguageTests(userId),
  ]);
  if (!user) return { percentage: 0, items: [] };
  return computeCompletion(user, profile ?? null, qualifications.length, languageTests.length);
}

/**
 * Recompute, persist, and fire referral qualification at 100%.
 *
 * Called from every mutator that can change one of the 8 inputs. Never called from a read: money must
 * not move as a side effect of a GET.
 *
 * Idempotency is REQUIRED here and is what makes redundant calls correct — there is deliberately no
 * "did it just cross from <100 to 100" edge detection, because onIndividualQualified is a no-op once
 * the referral is credited (the award claims the row with `WHERE state = 'signed_up'`).
 *
 * Never throws: a profile save must not fail because a referral could not be evaluated.
 */
export async function syncCompletion(userId: number): Promise<void> {
  try {
    const { percentage } = await loadCompletion(userId);
    await repo.updateProfile(userId, { completion_percentage: percentage });

    if (percentage === 100) {
      // Must NOT mutate any completion input, or award -> profile write -> syncCompletion -> award
      // would cycle. INV-1 would prevent a double payment, but the repeated work would still be wrong.
      await onIndividualQualified(userId);
    }
  } catch (err) {
    logger.warn("completion sync failed", { userId, err: (err as Error).message });
  }
}
