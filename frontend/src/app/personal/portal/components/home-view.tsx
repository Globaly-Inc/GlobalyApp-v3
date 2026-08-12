"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchFullProfile } from "@/app/personal/store/profile-slice";
import { HomeHero } from "./home-hero";
import { FeedComposer } from "./feed-composer";
import { FeedTimeline } from "./feed-timeline";
import { QuickActions } from "./quick-actions";
import { RegionBoundary } from "./region-boundary";

/**
 * Home = hero + feed + quick actions.
 *
 * The rail's counts, invites, position confirmations, recent enquiries and the profile-completion card were
 * all removed in PR review along with their data sources (the enquiries/favorites/notifications tables, the
 * personal-home aggregator and the backend completion service). The profile page keeps its own progress bar.
 */
export function HomeView() {
  const dispatch = useAppDispatch();
  const profile = useAppSelector((state) => state.profile.profile);

  useEffect(() => {
    if (!profile) dispatch(fetchFullProfile());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Each region is boundaried: a render error in one shows that region's retry, not a blank page. */}
      <RegionBoundary label="the header">
        <HomeHero firstName={profile?.first_name ?? null} />
      </RegionBoundary>

      {/*
        lg+: feed spans two columns with the rail beside it.
        below lg: single column — feed first, quick actions after.
        One spacing scale: 4 (16px) between cards, 6 (24px) between regions and columns.
      */}
      <div className="flex flex-col gap-4 md:gap-6 lg:grid lg:grid-cols-3 lg:items-start">
        <div className="order-2 space-y-4 lg:col-span-1">
          <RegionBoundary label="quick actions">
            <QuickActions />
          </RegionBoundary>
        </div>

        <div className="order-1 space-y-4 lg:col-span-2">
          <RegionBoundary label="the composer">
            <FeedComposer />
          </RegionBoundary>
          <RegionBoundary label="the feed">
            <FeedTimeline />
          </RegionBoundary>
        </div>
      </div>
    </div>
  );
}
