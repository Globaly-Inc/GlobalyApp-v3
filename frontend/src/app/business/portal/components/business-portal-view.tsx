"use client";

import { useEffect, useRef } from "react";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchCredits } from "@/app/business/enquiries/store/business-enquiries-slice";
import { fetchOnboardingProgress, isExtractionRunning } from "../../store/business-onboarding-slice";
import { PortalHero, type PortalStage } from "./portal-hero";
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
  const progressFailed = useAppSelector((state) => state.businessOnboarding.onboardingProgressFailed);
  const extracting = useAppSelector((state) => isExtractionRunning(state.businessOnboarding.profile, state.businessOnboarding.extractionStatus));
  /** Day one, mid-crawl, or built — every card on the page reads differently in each. */
  const stage: PortalStage = extracting ? "extracting" : profile?.source_job_id || profile?.extraction_parent_name ? "built" : "new";

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current || !profile) return;
    fetchedRef.current = true;
    dispatch(fetchCredits());
    dispatch(fetchOnboardingProgress());
  }, [dispatch, profile]);

  return (
    <div className={cn("space-y-4 md:space-y-6", !onboardingProgress && !progressFailed && "invisible")}>
      {/* Only once the onboarding row has loaded: the server decides whether this plays, and rendering
          before it arrives would flash the splash at someone who has already dismissed it. */}
      {onboardingProgress && (
        <WelcomeTour orgName={profile?.business_name ?? ""} show={onboardingProgress.showWelcome} />
      )}
      <PortalHero orgName={profile?.business_name ?? ""} progress={onboardingProgress} stage={stage} />

      <div className="flex flex-col gap-4 md:gap-6 lg:grid lg:grid-cols-3 lg:items-start">
        <div className="order-1 space-y-4 lg:col-span-2">
          {profile && <StartExtractionCard profile={profile} />}
          <AiEmbedCard
            stage={stage}
            installed={!!onboardingProgress?.steps.find((s) => s.key === "add_chat_widget")?.done}
          />
          <DashboardPreview />
          {/* Recent enquiries card hidden for the short release — <BusinessRecentEnquiries items={enquiries} />,
              fed by fetchDistributions() and state.businessEnquiries.items. */}
        </div>

        <div className="order-2 space-y-4 lg:col-span-1">
          {/* The checklist stays up while the crawl runs: it is where the owner sees that putting
              the widget live is the one step that doesn't wait for it. */}
          {onboardingProgress && <GetSetUpChecklist progress={onboardingProgress} />}
          {progressFailed && !onboardingProgress && (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-medium">We couldn&apos;t load your setup checklist</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Everything else on this page is fine — only the checklist is missing.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 h-8 cursor-pointer gap-1.5 text-xs"
                onClick={() => dispatch(fetchOnboardingProgress())}
              >
                <RotateCw className="size-3.5" aria-hidden />
                Try again
              </Button>
            </div>
          )}
          <BusinessQuickActions />
          <NeedAHandCard />
        </div>
      </div>
    </div>
  );
}
