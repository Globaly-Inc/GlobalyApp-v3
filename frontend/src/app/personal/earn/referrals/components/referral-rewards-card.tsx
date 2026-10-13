import { Building2, Gift, UserPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/utils";
import type { ReferralConfig } from "../apis/types";

/** How rewards work: per-referral amounts from the config endpoint, plus the static credit-timing rule. */
export function ReferralRewardsCard({ config }: Readonly<{ config: ReferralConfig }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>How you earn</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <RewardRow icon={UserPlus}>
          Earn <strong>{formatNumber(config.student_referral_reward)} credits</strong> for each student you refer
        </RewardRow>
        <RewardRow icon={Building2}>
          Earn <strong>{formatNumber(config.business_referral_reward)} credits</strong> for each business you refer
        </RewardRow>

        {/* Without this the user cannot understand why credits have not arrived yet. Static rule,
            no per-referral data — the per-row countdown is Phase 2. */}
        <p className="flex items-start gap-2 border-t pt-4 text-xs text-muted-foreground">
          <Gift className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Credits arrive when they complete their profile (students) or verify their account
            (businesses), within {config.w2_days} days of signing up.
          </span>
        </p>
      </CardContent>
    </Card>
  );
}

function RewardRow({ icon: Icon, children }: Readonly<{ icon: typeof Gift; children: React.ReactNode }>) {
  return (
    <div className="flex items-start gap-3">
      <span className="inline-flex shrink-0 rounded-md bg-primary/10 p-1.5 text-primary">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="pt-0.5">{children}</span>
    </div>
  );
}
