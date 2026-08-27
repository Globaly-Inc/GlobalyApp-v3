"use client";

import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { useAppSelector } from "@/lib/hooks";

/**
 * Nudge shown above the chat while the student's profile is incomplete. Reads the
 * backend-computed percentage off the profile slice — the same figure the enquiry
 * gate uses, so the two screens can't disagree. PersonalShell already fetched it.
 *
 * mx-4 mb-2 because the chat column is full-bleed — same self-layout as CreditBanner.
 */
export function ProfileCompletionBanner() {
  const completion = useAppSelector((s) => s.profile.profile?.completion?.percentage ?? null);
  const userType = useAppSelector((s) => s.auth.user?.type ?? null);

  // Admins aren't students — nagging them to fill grades/budget is noise.
  if (userType === "admin") return null;

  // null covers "not fetched yet" on its own, so don't also gate on status === "loading" —
  // that would blink the banner out during the refetch after every profile edit.
  if (completion === null) return null;
  // Percentage only. Deliberately NOT also checking profile.onboarding_completed like the
  // enquiry gate does: nothing sets that flag today, so a finished profile would sit here
  // being told to "finish it" forever.
  if (completion >= 100) return null;

  return (
    <div className="mx-4 mb-2 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-900/60 dark:bg-amber-950/30">
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
      <p className="text-amber-900 dark:text-amber-200">
        Your profile is <span className="font-semibold">{completion}%</span> complete. Finish it so
        recommendations match your grades, budget and destination.{" "}
        <Link href="/personal/profile" className="font-semibold underline underline-offset-2">
          Complete now →
        </Link>
      </p>
    </div>
  );
}
