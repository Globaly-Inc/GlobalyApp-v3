"use client";

import { useAppSelector } from "@/lib/hooks";
import { PageBody } from "@/components/ui/page-body";
import { FeedComposer } from "@/components/feed/components/feed-composer";
import { FeedTimeline } from "@/components/feed/components/feed-timeline";
import { DashboardStats } from "./dashboard-stats";
import { GreetingHero } from "@/components/greeting-hero/greeting-hero";
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
    <PageBody>
      {/* Each region is boundaried: a render error in one shows that region's retry, not a blank page. */}
      <RegionBoundary label="the header">
        <GreetingHero name={profile?.first_name ?? null} subtitle="Your personal dashboard" storagePrefix="personal" />
      </RegionBoundary>

      {/*
        lg+: a 2/3 main stack (stats, composer, feed) with the 1/3 rail beside it.
        below lg: single column — stats and feed first, the rail after.
      */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <RegionBoundary label="dashboard stats">
            <DashboardStats />
          </RegionBoundary>
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

        <div className="flex min-w-0 flex-col gap-6">
          <RegionBoundary label="profile completion">
            <ProfileCompletionCard />
          </RegionBoundary>
          <RegionBoundary label="quick actions">
            <QuickActions />
          </RegionBoundary>
        </div>
      </div>
    </PageBody>
  );
}
