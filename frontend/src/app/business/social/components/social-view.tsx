"use client";

import { Share2 } from "lucide-react";
import { useAppSelector } from "@/lib/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { FeedComposer } from "@/components/feed/components/feed-composer";
import { FeedTimeline } from "@/components/feed/components/feed-timeline";
import { BusinessQuickActions } from "@/app/business/portal/components/business-quick-actions";

/** Moved out of the portal home into its own nav tab — a header + identity/shortcuts sidebar
 *  give the feed some visual weight instead of a lone centered column. */
export function SocialView() {
  const profile = useAppSelector((state) => state.businessOnboarding.profile);
  const initial = profile?.business_name?.[0]?.toUpperCase() ?? "B";

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Share2 className="h-4.5 w-4.5" />
        </span>
        <div>
          <h1 className="text-lg font-semibold">Social</h1>
          <p className="text-sm text-muted-foreground">Share updates with the students and partners following your page.</p>
        </div>
      </div>

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
