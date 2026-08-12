"use client";

import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchFullProfile } from "@/app/personal/store/profile-slice";
import { fetchHomeSummary } from "../store/home-slice";
import { HomeHero } from "./home-hero";
import { FeedComposer } from "./feed-composer";
import { FeedTimeline } from "./feed-timeline";
import { CompletionCard } from "./completion-card";
import { StatTiles } from "./stat-tiles";
import { QuickActions } from "./quick-actions";
import { RecentEnquiriesCard } from "./recent-enquiries-card";
import { PendingInvitesCard } from "./pending-invites-card";
import { PendingPositionsCard } from "./pending-positions-card";
import { SectionError } from "./section-error";
import { RegionBoundary } from "./region-boundary";

function RailSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-2 pt-5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-8 w-full" />
      </CardContent>
    </Card>
  );
}

export function HomeView() {
  const dispatch = useAppDispatch();
  const profile = useAppSelector((state) => state.profile.profile);
  const { summary, summaryStatus, summaryError } = useAppSelector((state) => state.home);

  useEffect(() => {
    dispatch(fetchHomeSummary());
    if (!profile) dispatch(fetchFullProfile());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retrySummary = () => dispatch(fetchHomeSummary());

  // `degraded` names the sources that failed. A degraded source shows an error, not a confident zero.
  const degraded = summary?.degraded ?? [];
  const countsFailed = degraded.includes("enquiries") || degraded.includes("favorites");
  const completionFailed = degraded.includes("completion");

  // Anything requiring a decision. Below lg these render ABOVE the feed — the whole point of the rebuild:
  // in V2 every one of these lived in a `hidden lg:block` rail, so phones never saw them.
  const actionableCards = (
    <>
      {summaryStatus === "loading" && !summary ? (
        <RailSkeleton />
      ) : summaryStatus === "failed" ? (
        <SectionError message={summaryError ?? "Couldn't load your dashboard."} onRetry={retrySummary} />
      ) : summary ? (
        <>
          {completionFailed ? (
            <SectionError message="Couldn't load your profile progress." onRetry={retrySummary} />
          ) : (
            <CompletionCard completion={summary.completion} />
          )}
          <PendingInvitesCard invites={summary.pending_invites} />
          <PendingPositionsCard positions={summary.position_updates} />
        </>
      ) : null}
    </>
  );

  const informationalCards = summary ? (
    <>
      {countsFailed ? (
        <SectionError message="Couldn't load your activity counts." onRetry={retrySummary} />
      ) : (
        <StatTiles
          favorites={summary.favorites_count}
          enquiries={summary.enquiries_count}
          completionPct={summary.completion.percentage}
        />
      )}
      <QuickActions />
      {!degraded.includes("enquiries") && <RecentEnquiriesCard enquiries={summary.recent_enquiries} />}
    </>
  ) : null;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Each region is boundaried: a render error in one shows that region's retry, not a blank page. */}
      <RegionBoundary label="the header">
        <HomeHero firstName={profile?.first_name ?? null} />
      </RegionBoundary>

      {/*
        lg+: feed spans two columns with the full rail beside it.
        below lg: single column ordered actionable → feed → informational.
        The informational block appears at two breakpoint-exclusive positions (only one is ever visible).
        That is safe because these cards are pure renders of `summary` — they fetch nothing, so there is one
        source of data and no chance of the two copies drifting.
      */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-3 lg:items-start lg:gap-6">
        <div className="order-1 space-y-3 lg:order-2 lg:col-span-1">
          <RegionBoundary label="your pending items">
            <div className="space-y-3">{actionableCards}</div>
          </RegionBoundary>
          <RegionBoundary label="your activity">
            <div className="hidden space-y-3 lg:block">{informationalCards}</div>
          </RegionBoundary>
        </div>

        <div className="order-2 space-y-3 lg:order-1 lg:col-span-2">
          <RegionBoundary label="the composer">
            <FeedComposer />
          </RegionBoundary>
          <RegionBoundary label="the feed">
            <FeedTimeline />
          </RegionBoundary>
        </div>

        <RegionBoundary label="your activity">
          <div className="order-3 space-y-3 lg:hidden">{informationalCards}</div>
        </RegionBoundary>
      </div>
    </div>
  );
}
