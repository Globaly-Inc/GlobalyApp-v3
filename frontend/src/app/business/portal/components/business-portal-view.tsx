"use client";

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { FeedComposer } from "@/components/feed/components/feed-composer";
import { FeedTimeline } from "@/components/feed/components/feed-timeline";
import { fetchCredits, fetchDistributions } from "@/app/business/enquiries/store/business-enquiries-slice";
import { fetchServices } from "@/app/business/profile/store/business-profile-detail-slice";
import { BusinessHero } from "./business-hero";
import { BusinessQuickActions } from "./business-quick-actions";
import { BusinessStatsSidebar } from "./business-stats-sidebar";
import { BusinessRecentEnquiries } from "./business-recent-enquiries";

/**
 * Home = hero + stats rail + feed, mirroring legacy V2's BusinessDashboard. `profile` is already
 * guaranteed by BusinessShell (it blocks rendering behind a spinner until the profile loads), so this
 * view doesn't need its own fetch or loading state for it.
 */
export function BusinessPortalView() {
  const dispatch = useAppDispatch();
  const profile = useAppSelector((state) => state.businessOnboarding.profile);
  const { items: enquiries, credits } = useAppSelector((state) => state.businessEnquiries);
  const servicesTotal = useAppSelector((state) => state.businessProfileDetail.services.total);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current || !profile) return;
    fetchedRef.current = true;
    dispatch(fetchDistributions());
    dispatch(fetchCredits());
    dispatch(fetchServices({ id: profile.id, params: { page: 1, limit: 1 } }));
  }, [dispatch, profile]);

  return (
    <div className="space-y-4 md:space-y-6">
      <BusinessHero businessName={profile?.business_name ?? ""} />

      <div className="flex flex-col gap-4 md:gap-6 lg:grid lg:grid-cols-3 lg:items-start">
        <div className="order-2 space-y-4 lg:col-span-1">
          <BusinessStatsSidebar
            enquiriesCount={enquiries.length}
            servicesCount={servicesTotal}
            creditBalance={credits ?? 0}
          />
          <BusinessQuickActions />
          <BusinessRecentEnquiries items={enquiries} />
        </div>

        <div className="order-1 space-y-4 lg:col-span-2">
          <FeedComposer
            businessId={profile?.id ?? null}
            avatarUrl={profile?.logo_url}
            avatarFallback={profile?.business_name?.[0]?.toUpperCase() ?? "B"}
            placeholder="Share an update with your audience..."
          />
          <FeedTimeline />
        </div>
      </div>
    </div>
  );
}
