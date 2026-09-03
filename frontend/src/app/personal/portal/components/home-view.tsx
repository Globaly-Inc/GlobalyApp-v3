"use client";

import { useAppSelector } from "@/lib/hooks";
import { FeedComposer } from "@/components/feed/components/feed-composer";
import { FeedTimeline } from "@/components/feed/components/feed-timeline";
import { DashboardStats } from "./dashboard-stats";
import { HomeHero } from "./home-hero";
import { ProfileCompletionCard } from "./profile-completion-card";
import { QuickActions } from "./quick-actions";
import { RegionBoundary } from "./region-boundary";

/**
 * Home = hero + feed + quick actions.
 *
 * The rail's invites, position confirmations and recent-enquiries list were removed in PR review
 * along with the notifications table and the personal-home aggregator. The profile-completion card
 * and enquiries/profile stat counts are back — completion.ts and the enquiries list already return
 * real data, unlike favorites (see dashboard-stats.tsx).
 */
export function HomeView() {
  // ponytail: no fetch here — PersonalShell, which wraps this route, already loads the profile on
  // mount. The duplicate dispatch was always skipped by the thunk's `condition` guard anyway.
  const profile = useAppSelector((state) => state.profile.profile);

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
          <RegionBoundary label="profile completion">
            <ProfileCompletionCard />
          </RegionBoundary>
          <RegionBoundary label="dashboard stats">
            <DashboardStats />
          </RegionBoundary>
          <RegionBoundary label="quick actions">
            <QuickActions />
          </RegionBoundary>
        </div>

        <div className="order-1 space-y-4 lg:col-span-2">
          <RegionBoundary label="the composer">
            <FeedComposer
              avatarUrl={profile?.photo_url}
              avatarFallback={profile?.first_name?.[0]?.toUpperCase() ?? "U"}
            />
          </RegionBoundary>
          <RegionBoundary label="the feed">
            <FeedTimeline />
          </RegionBoundary>
        </div>
      </div>
    </div>
  );
}
