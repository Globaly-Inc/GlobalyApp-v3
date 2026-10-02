"use client";

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { FeedComposer } from "@/components/feed/components/feed-composer";
import { FeedTimeline } from "@/components/feed/components/feed-timeline";
import { fetchCredits, fetchDistributions } from "@/app/business/enquiries/store/business-enquiries-slice";
import { fetchServices } from "@/app/business/profile/store/business-profile-detail-slice";
import { BusinessQuickActions } from "@/app/business/portal/components/business-quick-actions";
import { BusinessHero } from "@/app/business/portal/components/business-hero";
import { BusinessStatsSidebar } from "@/app/business/portal/components/business-stats-sidebar";

export function SocialView() {
  const dispatch = useAppDispatch();
  const profile = useAppSelector((state) => state.businessOnboarding.profile);
  const { items: enquiries, credits } = useAppSelector((state) => state.businessEnquiries);
  const servicesTotal = useAppSelector((state) => state.businessProfileDetail.services.total);
  const initial = profile?.business_name?.[0]?.toUpperCase() ?? "B";

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
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Posting as</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-3">
              <Avatar className="size-10">
                <AvatarImage src={profile?.logo_url ?? undefined} alt={profile?.business_name} />
                <AvatarFallback>{initial}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="truncate font-medium">{profile?.business_name || "Your business"}</div>
                {profile?.business_category_name && (
                  <div className="truncate text-xs text-muted-foreground">{profile.business_category_name}</div>
                )}
              </div>
            </CardContent>
          </Card>
          <BusinessStatsSidebar
            enquiriesCount={enquiries.length}
            servicesCount={servicesTotal}
            creditBalance={credits ?? 0}
          />
          <BusinessQuickActions />
        </div>

        <div className="order-1 space-y-4 lg:col-span-2">
          <FeedComposer
            businessId={profile?.id ?? null}
            avatarUrl={profile?.logo_url}
            avatarFallback={initial}
            placeholder="Share an update with your audience..."
          />
          <FeedTimeline />
        </div>
      </div>
    </div>
  );
}
