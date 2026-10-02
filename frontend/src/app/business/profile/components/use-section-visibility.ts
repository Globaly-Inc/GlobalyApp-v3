"use client";

import { toast } from "sonner";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/hooks";
import { updateMyProfile } from "@/app/business/store/business-onboarding-slice";
import type { BusinessProfile } from "@/app/business/apis/types";

/**
 * Per-section public/private control, with V1's rule (`isSecVisible`): a section is public unless
 * `public_visibility` explicitly says `false`, so a profile nobody has touched publishes in full.
 * Toggling writes the whole map back, which is also how V1 persisted it.
 *
 * `canToggle` is false for institution profiles: `institutions` has no `public_visibility` column,
 * so the adapter in `business/apis/real-api.ts` hands back null rather than a map, and a patch
 * would be dropped silently. Businesses always have `{}` at minimum — the column is NOT NULL with
 * a `{}` default — so null is a reliable signal here, not a coincidence.
 */
export function useSectionVisibility(profile: BusinessProfile) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  // Every card mounts its own copy of this hook, so the guard against concurrent writes has to be
  // shared state rather than a local flag — otherwise toggling two different sections races.
  const saving = useAppSelector((s) => s.businessOnboarding.status === "saving");

  const isPublic = (section: string) => profile.public_visibility?.[section] !== false;

  const toggle = async (section: string) => {
    // The patch replaces `public_visibility` wholesale, so it has to be built on the newest map
    // the store holds — not the one captured when this card last rendered, which a save landing
    // mid-click would already have superseded.
    const current = store.getState().businessOnboarding.profile?.public_visibility ?? {};
    const next = { ...current, [section]: !isPublic(section) };
    try {
      await dispatch(updateMyProfile({ public_visibility: next })).unwrap();
    } catch (e) {
      toast.error("Couldn't update visibility", { description: (e as Error).message });
    }
  };

  return {
    isPublic,
    toggle,
    // Held shut while any profile save is in flight: a second toggle started before the first
    // replied would clone a map that is about to be replaced, and the later write would silently
    // drop the earlier choice.
    canToggle: profile.public_visibility !== null && !saving,
  };
}
