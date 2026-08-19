"use client";

import { useEffect, useRef } from "react";
import { GraduationCap, Heart, MessageSquare } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchFullProfile } from "@/app/personal/store/profile-slice";
import { HomeHero } from "@/app/portal/components/home-hero";
import { FeedComposer } from "@/app/portal/components/feed-composer";
import { FeedTimeline } from "@/app/portal/components/feed-timeline";
import { QuickActions } from "@/app/portal/components/quick-actions";
import { RegionBoundary } from "@/app/portal/components/region-boundary";
import { StatTiles } from "@/app/portal/components/stat-tiles";
import { formatNumber } from "@/app/portal/utils";
import { fetchRecentEnquiries } from "../store/home-slice";
import { QUICK_ACTIONS } from "../const";
import { CompletionCard } from "./completion-card";
import { RecentEnquiriesCard } from "./recent-enquiries-card";

/**
 * Layout mirrors V1's StudentDashboard exactly: outer space-y-6, a 3-column grid at lg with gap-6, the feed
 * spanning two columns with space-y-4 between its cards, and the rail on space-y-6 in V1's order —
 * completion, stats, quick actions, recent enquiries. The lg:pr-2 / lg:pl-2 insets are V1's too.
 *
 * Hero, composer, timeline and the two rail primitives come from `@/app/portal` — the same components the
 * business portal renders. Only this page's composition and its personal-specific cards live here.
 */
export function HomeView() {
  const dispatch = useAppDispatch();
  const profile = useAppSelector((state) => state.profile.profile);
  const { enquiries, enquiriesTotal } = useAppSelector((state) => state.home);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    if (!profile) dispatch(fetchFullProfile());
    dispatch(fetchRecentEnquiries());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  const completionPct = profile?.completion?.percentage ?? 0;

  // Favorites is a truthful 0 rather than a placeholder: nothing in this codebase can favourite anything
  // yet, so zero is the real count. It becomes live the moment a favorites endpoint exists.
  const stats = [
    { icon: Heart, label: "Favorites", value: formatNumber(0), color: "bg-rose-100 text-rose-700" },
    { icon: MessageSquare, label: "Enquiries", value: formatNumber(enquiriesTotal), color: "bg-blue-100 text-blue-700" },
    { icon: GraduationCap, label: "Profile", value: `${completionPct}%`, color: "bg-violet-100 text-violet-700" },
  ];

  return (
    <div className="space-y-6">
      {/* Each region is boundaried: a render error in one shows that region's retry, not a blank page. */}
      <RegionBoundary label="the header">
        <HomeHero firstName={profile?.first_name ?? null} />
      </RegionBoundary>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 lg:pr-2 min-w-0 space-y-4">
          <RegionBoundary label="the composer">
            {/* businessId null = this post belongs to the personal profile. */}
            <FeedComposer
              identity={{
                businessId: null,
                name: profile?.first_name ?? null,
                photoUrl: profile?.photo_url ?? null,
              }}
            />
          </RegionBoundary>
          <RegionBoundary label="the feed">
            <FeedTimeline />
          </RegionBoundary>
        </div>

        {/* V1 hides this rail below lg. It stays visible here on purpose: the completion card is the only
            place a user learns why their profile is incomplete, and hiding it on phones was the V2 defect
            this portal was rebuilt to fix. */}
        <div className="space-y-6 lg:pl-2">
          <RegionBoundary label="your profile progress">
            <CompletionCard completion={profile?.completion ?? null} />
          </RegionBoundary>
          <RegionBoundary label="your activity">
            <StatTiles stats={stats} />
          </RegionBoundary>
          <RegionBoundary label="quick actions">
            <QuickActions actions={QUICK_ACTIONS} />
          </RegionBoundary>
          {/* Renders nothing until there is at least one enquiry — V1 does the same. */}
          <RegionBoundary label="recent enquiries">
            <RecentEnquiriesCard enquiries={enquiries} />
          </RegionBoundary>
        </div>
      </div>
    </div>
  );
}
