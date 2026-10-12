"use client";

// Earn → Referrals. Layout, copy, icons and empty/loading states are inherited from V2's
// StudentReferrals.tsx so the two read as the same product. The differences are deliberate:
//
//  * the link is absolute and built from ONE helper (V2 split the literal across two files and
//    prepended "https://" only at copy time, pointing at a host the app was never served from)
//  * reward amounts come from the config endpoint (V2 hard-coded 20/100 in three files)
//  * native share is offered where supported
//  * a missing code renders an error state with a support path, never V2's silent "—"
//  * only CREDITED rows render, so the "Credited" badge is accurate rather than fabricated for
//    every row as V2 did

import { useEffect, useRef, useSyncExternalStore } from "react";
import { AlertCircle, Building2, Coins, Gift, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { HeroCard } from "@/components/ui/hero-card";
import { PageBody } from "@/components/ui/page-body";
import { StatCard } from "@/components/ui/stat-card";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { buildReferralLink } from "@/lib/referral-token";
import { cn, formatNumber } from "@/lib/utils";
import { fetchMyReferrals } from "../store/referrals-slice";
import { ReferralCodePanel } from "./referral-code-panel";
import { ReferralHistoryCard } from "./referral-history-card";
import { ReferralRewardsCard } from "./referral-rewards-card";

export function ReferralsView() {
  const dispatch = useAppDispatch();
  const { data, status, error } = useAppSelector((s) => s.referrals);

  // Strict Mode double-invokes effects in dev, so a bare dispatch fires the request twice on every
  // mount. Guard per AGENTS.md.
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchMyReferrals());
  }, [dispatch]);

  // navigator.share is unavailable on most desktops, so the button is hidden rather than rendered
  // inert. A static browser capability is exactly what useSyncExternalStore's server/client snapshot
  // pair is for: reading it during render would hydrate false-then-true, and setting it in an effect
  // triggers a cascading render (and the lint rule that forbids it).
  const canShare = useSyncExternalStore(
    () => () => {}, // never changes, so nothing to subscribe to
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
    () => false, // server snapshot
  );

  const link = data?.code ? buildReferralLink(data.code) : "";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied!", { description: "Share it with friends to earn credits." });
    } catch {
      // Clipboard API can be blocked (insecure origin, permissions). The link stays selectable below.
      toast.error("Could not copy", { description: "Select and copy the link shown above." });
    }
  };

  const shareText = `Join me on GlobalyAI — the all-in-one platform for international education! Sign up here: ${link}`;

  const shareWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank");
  };

  const shareNative = async () => {
    try {
      await navigator.share({ title: "Join me on GlobalyAI", text: shareText, url: link });
    } catch {
      /* the user dismissed the sheet — not an error worth surfacing */
    }
  };

  return (
    <PageBody>
      <HeroCard title="Refer & earn" subtitle="Invite friends and businesses to GlobalyAI and earn credits.">
        {status !== "failed" && data?.code && (
          <ReferralCodePanel
            code={data.code}
            link={link}
            canShare={canShare}
            onCopy={copyLink}
            onShareWhatsApp={shareWhatsApp}
            onShareNative={shareNative}
          />
        )}
      </HeroCard>

      {status === "loading" && !data ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : status === "failed" ? (
        <Card>
          <EmptyState
            compact
            icon={AlertCircle}
            title="We could not load your referrals"
            description={error}
            action={
              <Button variant="outline" className="cursor-pointer" onClick={() => dispatch(fetchMyReferrals())}>
                Try again
              </Button>
            }
          />
        </Card>
      ) : !data ? null : !data.code ? (
        // Should be impossible: codes are issued at registration and a reconciliation job repairs any
        // gap. But this page NEVER writes a code as a side effect of being viewed, so if one is missing
        // it says so and offers a way out.
        <Card>
          <EmptyState
            compact
            icon={Gift}
            title="Your referral code isn't ready yet"
            description="This is unusual and it should appear shortly. If it doesn't, contact support and we'll sort it out."
            action={
              <Button variant="outline" className="cursor-pointer" onClick={() => dispatch(fetchMyReferrals())}>
                Refresh
              </Button>
            }
            secondaryAction={
              <a
                href="mailto:support@globalyai.com?subject=Missing%20referral%20code"
                className={cn(buttonVariants({ variant: "ghost" }), "cursor-pointer")}
              >
                Contact support
              </a>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard icon={Coins} value={formatNumber(data.stats.total_credits)} label="Total credits earned" />
              <StatCard icon={UserPlus} value={String(data.stats.students_referred)} label="Students referred" />
              <StatCard icon={Building2} value={String(data.stats.businesses_referred)} label="Businesses referred" />
            </div>
            <ReferralHistoryCard referrals={data.referrals} />
          </div>
          <div className="flex min-w-0 flex-col gap-6">
            <ReferralRewardsCard config={data.config} />
          </div>
        </div>
      )}
    </PageBody>
  );
}
