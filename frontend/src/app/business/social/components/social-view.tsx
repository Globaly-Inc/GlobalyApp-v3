"use client";

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageBody } from "@/components/ui/page-body";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { FeedComposer } from "@/components/feed/components/feed-composer";
import { FeedTimeline } from "@/components/feed/components/feed-timeline";
import { fetchCredits, fetchDistributions } from "@/app/business/enquiries/store/business-enquiries-slice";
import { fetchServices } from "@/app/business/profile/store/business-profile-detail-slice";
import { BusinessQuickActions } from "@/app/business/portal/components/business-quick-actions";
import { GreetingHero } from "@/components/greeting-hero/greeting-hero";
import { SocialStats } from "./social-stats";

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
    <PageBody>
      <GreetingHero subtitle={profile?.business_name || "Your business dashboard"} storagePrefix="business" />

      {/* Feed is the 2/3 main stack; on phones it comes first, the side stack follows */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <FeedComposer
            businessId={profile?.id ?? null}
            avatarUrl={profile?.logo_url}
            avatarFallback={initial}
            placeholder="Share an update with your audience..."
          />
          <FeedTimeline />
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Posting as</CardTitle>
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
          <SocialStats
            enquiriesCount={enquiries.length}
            servicesCount={servicesTotal}
            creditBalance={credits ?? 0}
          />
          <BusinessQuickActions />
        </div>
      </div>
    </PageBody>
  );
}
