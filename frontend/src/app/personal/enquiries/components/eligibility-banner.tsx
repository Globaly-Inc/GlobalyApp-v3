"use client";

import { EligibilityVerdictPanel, EligibilityVerdictSkeleton } from "@/components/eligibility-verdict";
import type { EligibilityVerdict } from "../apis/types";

/**
 * How the student's profile lines up with the course they're writing to.
 *
 * Informational, and only that — it never disables Send and there is nothing to acknowledge. It
 * is here so a student can see where they stand before they write, not to talk them out of it.
 *
 * A verdict that failed to load renders nothing: this is context, and missing context must not
 * be the thing that stops someone enquiring.
 */
export function EligibilityBanner({
  verdict,
  loading,
}: Readonly<{ verdict: EligibilityVerdict | null; loading: boolean }>) {
  if (loading) return <EligibilityVerdictSkeleton />;
  if (!verdict) return null;
  return <EligibilityVerdictPanel verdict={verdict} />;
}
