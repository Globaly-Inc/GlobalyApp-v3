"use client";

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchCredits, fetchDistributions } from "@/app/business/enquiries/store/business-enquiries-slice";
import { fetchOnboardingProgress } from "../../store/business-onboarding-slice";
import { PortalHero } from "./portal-hero";
import { BusinessQuickActions } from "./business-quick-actions";
import { BusinessRecentEnquiries } from "./business-recent-enquiries";
import { StartExtractionCard } from "./start-extraction-card";
import { DashboardPreview } from "./dashboard-preview";
import { GetSetUpChecklist } from "./get-set-up-checklist";
import { NeedAHandCard } from "./need-a-hand-card";
import { EXTRACTION_POLL_INTERVAL_MS, EXTRACTION_MAX_POLLS } from "../const";

/**
 * fetchCredits() below stays even without a credits card here — BusinessShell's header pill still
 * reads the same shared state. `profile` is already guaranteed by BusinessShell (it blocks
 * rendering behind a spinner until the profile loads), so this view doesn't need its own fetch or
 * loading state for it.
 */
export function BusinessPortalView() {
  const dispatch = useAppDispatch();
  const profile = useAppSelector((state) => state.businessOnboarding.profile);
  const onboardingProgress = useAppSelector((state) => state.businessOnboarding.onboardingProgress);
  const { items: enquiries } = useAppSelector((state) => state.businessEnquiries);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current || !profile) return;
    fetchedRef.current = true;
    dispatch(fetchDistributions());
    dispatch(fetchCredits());
    dispatch(fetchOnboardingProgress());
  }, [dispatch, profile]);

  // The checklist's own fetch above only ever runs once — nothing else refetches it, so
  // "Extract your website data" would sit stuck unticked for the whole ~15 min crawl even
  // though the backend flips it done the moment the job finds its first course. Same
  // poll/backoff shape as ExtractionProgressCard's own status polling.
  const pollCountRef = useRef(0);
  useEffect(() => {
    if (!onboardingProgress || onboardingProgress.completed >= onboardingProgress.total) return undefined;
    if (pollCountRef.current >= EXTRACTION_MAX_POLLS) return undefined;
    const timer = setTimeout(() => {
      pollCountRef.current += 1;
      dispatch(fetchOnboardingProgress());
    }, EXTRACTION_POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [dispatch, onboardingProgress]);

  return (
    <div className="space-y-4 md:space-y-6">
      <PortalHero orgName={profile?.business_name ?? ""} progress={onboardingProgress} />

      <div className="flex flex-col gap-4 md:gap-6 lg:grid lg:grid-cols-3 lg:items-start">
        <div className="order-1 space-y-4 lg:col-span-2">
          {profile && <StartExtractionCard profile={profile} />}
          <DashboardPreview />
          <BusinessRecentEnquiries items={enquiries} />
        </div>

        <div className="order-2 space-y-4 lg:col-span-1">
          {onboardingProgress && <GetSetUpChecklist progress={onboardingProgress} />}
          <BusinessQuickActions />
          <NeedAHandCard />
        </div>
      </div>
    </div>
  );
}
