"use client";

import { useEffect, useRef } from "react";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageBody } from "@/components/ui/page-body";
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
    <PageBody className={cn(!onboardingProgress && !progressFailed && "invisible")}>
      {/* Only once the onboarding row has loaded: the server decides whether this plays, and rendering
          before it arrives would flash the splash at someone who has already dismissed it. */}
      {onboardingProgress && (
        <WelcomeTour orgName={profile?.business_name ?? ""} show={onboardingProgress.showWelcome} />
      )}
      <PortalHero orgName={profile?.business_name ?? ""} progress={onboardingProgress} stage={stage} />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          {profile && <StartExtractionCard profile={profile} />}
          <AiEmbedCard
            stage={stage}
            installed={!!onboardingProgress?.steps.find((s) => s.key === "add_chat_widget")?.done}
          />
          <DashboardPreview />
          {/* Recent enquiries card hidden for the short release — <BusinessRecentEnquiries items={enquiries} />,
              fed by fetchDistributions() and state.businessEnquiries.items. */}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {/* The checklist stays up while the crawl runs: it is where the owner sees that putting
              the widget live is the one step that doesn't wait for it. */}
          {onboardingProgress && <GetSetUpChecklist progress={onboardingProgress} />}
          {progressFailed && !onboardingProgress && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">We couldn&apos;t load your setup checklist</CardTitle>
                <CardDescription>Everything else on this page is fine — only the checklist is missing.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" size="sm" onClick={() => dispatch(fetchOnboardingProgress())}>
                  <RotateCw aria-hidden />
                  Try again
                </Button>
              </CardContent>
            </Card>
          )}
          <BusinessQuickActions />
          <NeedAHandCard />
        </div>
      </div>
    </PageBody>
  );
}
