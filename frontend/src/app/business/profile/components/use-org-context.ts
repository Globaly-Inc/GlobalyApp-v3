"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAppDispatch } from "@/lib/hooks";
import { fetchMe, switchAccount, useAuthState } from "@/app/auth/store/auth-slice";
import { fetchMyProfile } from "@/app/business/store/business-onboarding-slice";

/**
 * Switches the session to the org named in the URL (`/business/profile/:id/...`) before a page
 * sends org-scoped requests — they go to the ACTIVE org, not the id in the URL, so a saved link to
 * another org's page would otherwise act on the wrong tenant. Returns true once the right org is
 * active. Same logic as business-profile-detail-view.tsx's switch effect.
 */
export function useOrgContext(orgNumericId: number, preferredOrgId?: string | null): boolean {
  const dispatch = useAppDispatch();
  const { user, initializing } = useAuthState();
  const refetchedMeRef = useRef(false);
  // Per-target, not a one-shot flag: a failed switch must not block a later attempt, and a changed
  // `?org=` target must be switched to even while this page stays mounted.
  const inFlightRef = useRef<string | null>(null);
  const failedRef = useRef<string | null>(null);

  // Business and institution ids can collide — prefer the org the link was made for (`?org=`),
  // then whichever match is already active.
  const candidates = user
    ? [
        ...user.businesses.filter((b) => b.id === orgNumericId),
        ...user.institutions.filter((i) => i.id === orgNumericId),
      ]
    : [];
  const target = candidates.find((c) => c.org_id === preferredOrgId)
    ?? candidates.find((c) => c.org_id === user?.orgId)
    ?? candidates[0];
  const targetOrgId = target?.org_id ?? null;

  useEffect(() => {
    if (initializing || !user) return;
    if (!targetOrgId) {
      // Access granted after login — refetch /auth/me once before giving up.
      if (!refetchedMeRef.current) {
        refetchedMeRef.current = true;
        dispatch(fetchMe());
      } else {
        toast.error("Couldn't load this organisation", { description: "You may not have access to it, or your session is out of date." });
      }
      return;
    }
    // ponytail: a failed target isn't retried automatically (that would loop on every /auth/me
    // refresh) — a new target or a reload tries again.
    if (targetOrgId === user.orgId || inFlightRef.current === targetOrgId || failedRef.current === targetOrgId) return;
    inFlightRef.current = targetOrgId;
    dispatch(switchAccount(targetOrgId))
      .unwrap()
      .then(() => {
        failedRef.current = null;
        dispatch(fetchMyProfile());
      })
      .catch((e: Error) => {
        failedRef.current = targetOrgId;
        toast.error("Couldn't switch organisation", { description: e.message });
      })
      .finally(() => {
        if (inFlightRef.current === targetOrgId) inFlightRef.current = null;
      });
  }, [initializing, user, targetOrgId, dispatch]);

  // Ready exactly when the session is on the URL's org — switchAccount refetches /auth/me, so
  // user.orgId flips once the switch has actually succeeded.
  return !initializing && !!targetOrgId && user?.orgId === targetOrgId;
}
