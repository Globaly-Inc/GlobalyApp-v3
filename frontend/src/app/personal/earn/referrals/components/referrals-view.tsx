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
import { Building2, Coins, Copy, Gift, Loader2, Share2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { buildReferralLink } from "@/lib/referral-token";
import { cn, formatNumber } from "@/lib/utils";
import { fetchMyReferrals } from "../store/referrals-slice";
import { ACTION_META } from "../const";

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

  const shareText = `Join me on Globaly — the all-in-one platform for international education! Sign up here: ${link}`;

  const shareWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank");
  };

  const shareNative = async () => {
    try {
      await navigator.share({ title: "Join me on Globaly", text: shareText, url: link });
    } catch {
      /* the user dismissed the sheet — not an error worth surfacing */
    }
  };

  return (
    <div className="mx-auto max-w-[800px] space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Refer &amp; earn</h1>
        <p className="text-muted-foreground">Invite friends and businesses to Globaly and earn credits.</p>
      </div>

      {status === "loading" && !data ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : status === "failed" ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="font-medium text-foreground">We could not load your referrals</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            <Button
              variant="outline"
              className="mt-4 cursor-pointer"
              onClick={() => dispatch(fetchMyReferrals())}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : !data ? null : !data.code ? (
        // Should be impossible: codes are issued at registration and a reconciliation job repairs any
        // gap. But this page NEVER writes a code as a side effect of being viewed, so if one is missing
        // it says so and offers a way out.
        <Card>
          <CardContent className="p-8 text-center">
            <p className="font-medium text-foreground">Your referral code isn&apos;t ready yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              This is unusual and it should appear shortly. If it doesn&apos;t, contact support and
              we&apos;ll sort it out.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="outline" className="cursor-pointer" onClick={() => dispatch(fetchMyReferrals())}>
                Refresh
              </Button>
              <a
                href="mailto:support@globalyhub.com?subject=Missing%20referral%20code"
                className={cn(buttonVariants({ variant: "ghost" }), "cursor-pointer")}
              >
                Contact support
              </a>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* A. Code card */}
          <Card className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
            <CardContent className="p-8">
              <p className="mb-1 text-sm font-medium opacity-80">Your referral code</p>
              <p className="mb-2 text-4xl font-bold tracking-widest">{data.code}</p>
              {/* Selectable, so a blocked clipboard is still recoverable by hand. */}
              <p className="mb-4 select-all font-mono text-sm opacity-70">{link}</p>

              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" className="cursor-pointer font-semibold" onClick={copyLink}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy link
                </Button>
                <Button
                  variant="secondary"
                  className="cursor-pointer bg-emerald-600 font-semibold text-white hover:bg-emerald-700"
                  onClick={shareWhatsApp}
                >
                  Share on WhatsApp
                </Button>
                {canShare && (
                  <Button variant="secondary" className="cursor-pointer font-semibold" onClick={shareNative}>
                    <Share2 className="mr-2 h-4 w-4" />
                    Share
                  </Button>
                )}
              </div>

              <div className="mt-6 flex flex-col gap-4 text-sm opacity-90 sm:flex-row">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  <span>
                    Earn <strong>{formatNumber(data.config.student_referral_reward)} credits</strong> for
                    each student you refer
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  <span>
                    Earn <strong>{formatNumber(data.config.business_referral_reward)} credits</strong> for
                    each business you refer
                  </span>
                </div>
              </div>

              {/* Without this the user cannot understand why credits have not arrived yet. Static rule,
                  no per-referral data — the per-row countdown is Phase 2. */}
              <p className="mt-4 flex items-start gap-2 text-xs opacity-80">
                <Gift className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Credits arrive when they complete their profile (students) or verify their account
                  (businesses), within {data.config.w2_days} days of signing up.
                </span>
              </p>

              {/* Credits are being built as their own feature. Saying so is better than advertising a
                  reward the platform cannot pay yet — the referral itself is fully tracked either way. */}
              <p className="mt-2 text-xs opacity-80">
                Your qualified referrals are tracked now and credited once the credits system launches.
              </p>
            </CardContent>
          </Card>

          {/* B. Stats */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              icon={Coins}
              value={formatNumber(data.stats.pending_reward_credits)}
              label="Credits pending"
            />
            <StatCard icon={UserPlus} value={String(data.stats.students_referred)} label="Students referred" />
            <StatCard icon={Building2} value={String(data.stats.businesses_referred)} label="Businesses referred" />
          </div>

          {/* C. History */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Referral history</CardTitle>
            </CardHeader>
            <CardContent>
              {data.referrals.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-4 font-medium">Date</th>
                        <th className="pb-2 pr-4 font-medium">Type</th>
                        <th className="pb-2 pr-4 text-right font-medium">Reward</th>
                        <th className="pb-2 text-right font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.referrals.map((r) => {
                        const meta = r.action_type ? ACTION_META[r.action_type] : null;
                        const Icon = meta?.icon;
                        return (
                          <tr key={r.id} className="border-b last:border-0">
                            <td className="py-2.5 pr-4 text-muted-foreground">
                              {new Date(r.date).toLocaleDateString("en-AU")}
                            </td>
                            <td className="py-2.5 pr-4">
                              <span className="flex items-center gap-1.5">
                                {Icon && <Icon className="h-3.5 w-3.5" />}
                                {meta?.label ?? "—"}
                              </span>
                            </td>
                            <td className="py-2.5 pr-4 text-right font-semibold text-foreground">
                              {formatNumber(r.reward_credits ?? 0)}
                            </td>
                            <td className="py-2.5 text-right">
                              <Badge className="border-0 bg-amber-100 text-amber-800">
                                {r.state === "credited" ? "Credited" : "Qualified"}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  <UserPlus className="mx-auto mb-2 h-10 w-10 opacity-30" />
                  <p>No referrals yet. Share your link to start earning!</p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  value,
  label,
}: Readonly<{ icon: typeof Coins; value: string; label: string }>) {
  return (
    <Card>
      <CardContent className="p-5 text-center">
        <Icon className="mx-auto mb-2 h-8 w-8 text-primary" />
        <p className="text-3xl font-bold text-foreground">{value}</p>
        <p className="mt-1 text-sm text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}
