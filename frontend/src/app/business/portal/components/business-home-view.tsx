"use client";

import { useEffect, useRef } from "react";
import { CreditCard, Inbox, Package, TrendingUp } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchFullProfile } from "@/app/personal/store/profile-slice";
import { HomeHero } from "@/app/portal/components/home-hero";
import { FeedComposer } from "@/app/portal/components/feed-composer";
import { FeedTimeline } from "@/app/portal/components/feed-timeline";
import { QuickActions } from "@/app/portal/components/quick-actions";
import { RegionBoundary } from "@/app/portal/components/region-boundary";
import { StatTiles } from "@/app/portal/components/stat-tiles";
import { BUSINESS_VISIBILITY_OPTIONS } from "@/app/portal/const";
import { formatNumber } from "@/app/portal/utils";
import { fetchBusinessHome } from "../store/business-home-slice";
import { businessQuickActions, EMPTY_FEED_HINT } from "../const";
import { CreditBalanceCard } from "./credit-balance-card";
import { BusinessEnquiriesCard } from "./business-enquiries-card";

/** A tile whose number failed to load shows a dash — a wrong zero reads as a real answer. */
const count = (value: number | null) => (value === null ? "—" : formatNumber(value));

/**
 * The business portal's Home. Same shell, same grid and the same feed components as the personal portal
 * (`@/app/portal`) — only the rail and the posting identity differ.
 *
 * The identity is the important part. Everything here is scoped to `profile.id`: the composer publishes as
 * the business, and the timeline reads the business portal's context. A post made here does NOT
 * automatically appear in the same user's personal portal — only an "Everyone" post crosses over. The rule
 * is enforced in the feed's list query, not by hiding rows after they arrive.
 *
 * BusinessShell resolves the active business and holds children back until it has, so `profile` is
 * non-null by the time this renders.
 */
export function BusinessHomeView() {
  const dispatch = useAppDispatch();
  const profile = useAppSelector((state) => state.businessOnboarding.profile);
  // The greeting is addressed to the person, not the business — and this is the same GET /platform-users/me
  // the personal portal already loads, so a member who arrives here directly still gets their own name.
  // It also gives the reaction reducer a face to put in the avatar stack.
  const person = useAppSelector((state) => state.profile.profile);
  const { credits, enquiries, enquiriesTotal, servicesTotal } = useAppSelector((state) => state.businessHome);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    if (!person) dispatch(fetchFullProfile());
    dispatch(fetchBusinessHome());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  const businessId = profile?.id ?? null;

  const stats = [
    { icon: Inbox, label: "Enquiries", value: count(enquiriesTotal), color: "bg-blue-100 text-blue-700" },
    { icon: Package, label: "Services", value: count(servicesTotal), color: "bg-emerald-100 text-emerald-700" },
    { icon: CreditCard, label: "Credits", value: count(credits), color: "bg-amber-100 text-amber-700" },
    // A truthful 0: V3 has no profile-view counter yet, so there is nothing to report. It goes live the
    // moment a views metric exists, rather than inventing one here.
    { icon: TrendingUp, label: "Views", value: formatNumber(0), color: "bg-violet-100 text-violet-700" },
  ];

  return (
    <div className="space-y-6">
      <RegionBoundary label="the header">
        <HomeHero firstName={person?.first_name ?? null} subtitle={profile?.business_name ?? "Your business"} />
      </RegionBoundary>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 lg:pr-2 min-w-0 space-y-4">
          <RegionBoundary label="the composer">
            {/* businessId set = this post belongs to the business profile, never to the user's personal one. */}
            <FeedComposer
              identity={{
                businessId,
                name: profile?.business_name ?? null,
                photoUrl: profile?.logo_url ?? null,
              }}
              visibilityOptions={BUSINESS_VISIBILITY_OPTIONS}
            />
          </RegionBoundary>
          <RegionBoundary label="the feed">
            <FeedTimeline businessId={businessId} emptyHint={EMPTY_FEED_HINT} />
          </RegionBoundary>
        </div>

        <div className="space-y-6 lg:pl-2">
          <RegionBoundary label="your credit balance">
            <CreditBalanceCard balance={credits} />
          </RegionBoundary>
          <RegionBoundary label="your activity">
            <StatTiles stats={stats} columns={2} align="left" />
          </RegionBoundary>
          <RegionBoundary label="quick actions">
            {businessId !== null && <QuickActions actions={businessQuickActions(businessId)} />}
          </RegionBoundary>
          {/* Renders nothing until there is at least one enquiry — the personal rail behaves the same. */}
          <RegionBoundary label="recent enquiries">
            <BusinessEnquiriesCard enquiries={enquiries} />
          </RegionBoundary>
        </div>
      </div>
    </div>
  );
}
