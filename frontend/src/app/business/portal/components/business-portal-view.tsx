"use client";

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchCredits } from "@/app/business/enquiries/store/business-enquiries-slice";
import { fetchOnboardingProgress, isExtractionRunning } from "../../store/business-onboarding-slice";
import { PortalHero } from "./portal-hero";
import { BusinessQuickActions } from "./business-quick-actions";
import { StartExtractionCard } from "./start-extraction-card";
import { AiEmbedCard } from "./ai-embed-card";
import { DashboardPreview } from "./dashboard-preview";
import { GetSetUpChecklist } from "./get-set-up-checklist";
import { NeedAHandCard } from "./need-a-hand-card";
import { WelcomeTour } from "./welcome-tour";

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
  // Widgets and setup act on profile data the crawl is still writing — they appear once it ends.
  const extracting = useAppSelector((state) => isExtractionRunning(state.businessOnboarding.profile, state.businessOnboarding.extractionStatus));

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current || !profile) return;
    fetchedRef.current = true;
    dispatch(fetchCredits());
    dispatch(fetchOnboardingProgress());
  }, [dispatch, profile]);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Only once the onboarding row has loaded: the server decides whether this plays, and rendering
          before it arrives would flash the splash at someone who has already dismissed it. */}
      {onboardingProgress && (
        <WelcomeTour orgName={profile?.business_name ?? ""} show={onboardingProgress.showWelcome} />
      )}
      <PortalHero orgName={profile?.business_name ?? ""} progress={onboardingProgress} />

      <div className="flex flex-col gap-4 md:gap-6 lg:grid lg:grid-cols-3 lg:items-start">
        <div className="order-1 space-y-4 lg:col-span-2">
          {profile && <StartExtractionCard profile={profile} />}
          {!extracting && (
            <>
              <AiEmbedCard installed={!!onboardingProgress?.steps.find((s) => s.key === "add_chat_widget")?.done} />
              <DashboardPreview />
            </>
          )}
          {/* Recent enquiries card hidden for the short release — <BusinessRecentEnquiries items={enquiries} />,
              fed by fetchDistributions() and state.businessEnquiries.items. */}
        </div>

        <div className="order-2 space-y-4 lg:col-span-1">
          {!extracting && onboardingProgress && <GetSetUpChecklist progress={onboardingProgress} />}
          {!extracting && <BusinessQuickActions />}
          <NeedAHandCard />
        </div>
      </div>
    </div>
  );
}
