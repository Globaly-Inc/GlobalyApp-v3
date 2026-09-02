"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAccessToken } from "@/lib/session";
import { enquiriesApi } from "@/app/personal/enquiries/apis";
import { EligibilityVerdictPanel, EligibilityVerdictSkeleton } from "@/components/eligibility-verdict";

import type { EligibilityVerdict } from "@/app/personal/enquiries/apis/types";

/**
 * Answers "Check Eligibility" against the signed-in student's own profile.
 *
 * A client component because the page around it is a cached server render (`revalidate: 30`) —
 * the verdict is per-viewer and must never be baked into that cache.
 *
 * Signed out, it says so and links to sign-in rather than hiding: the requirements card below is
 * still the useful half, and the hero's `#eligibility` anchor lands here either way.
 *
 * A failed fetch renders nothing. This is an informational panel on a public page; the enquiry
 * form is where eligibility actually has consequences, and that path re-checks server-side.
 */
/**
 * The session token is an external store, and reading it during render would disagree with the
 * server-rendered HTML — hence useSyncExternalStore with an "unknown" server snapshot, which
 * renders nothing until hydration rather than flashing a sign-in prompt at a signed-in student.
 *
 * No real subscription: the token cannot change without a navigation away from this page.
 */
const subscribeToSession = () => () => {};
const readSession = () => (getAccessToken() ? "in" : "out");
const readSessionOnServer = () => "unknown" as const;

export function CourseEligibilityCheck({ courseId }: Readonly<{ courseId: string }>) {
  const session = useSyncExternalStore(subscribeToSession, readSession, readSessionOnServer);
  const [verdict, setVerdict] = useState<EligibilityVerdict | null>(null);

  useEffect(() => {
    if (session !== "in") return;
    let cancelled = false;
    enquiriesApi
      .getEligibility(courseId)
      .then((v) => {
        if (!cancelled) setVerdict(v);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [courseId, session]);

  if (session === "unknown") return null;

  if (session === "out") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-3 ring-1 ring-border">
        <div className="flex items-start gap-2.5">
          <GraduationCap className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-foreground">Check your eligibility</p>
            <p className="text-xs text-muted-foreground">
              Sign in and we&apos;ll compare these requirements against your profile.
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" render={<Link href="/auth/sign-in" />}>
          Sign in
        </Button>
      </div>
    );
  }

  return verdict ? <EligibilityVerdictPanel verdict={verdict} /> : <EligibilityVerdictSkeleton />;
}
