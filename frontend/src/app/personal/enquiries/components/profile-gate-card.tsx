import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { REQUIRED_COMPLETION } from "../const";

/**
 * Why the New Enquiry button isn't there. The bar is the point: "82%" alone doesn't
 * say how far off you are, and the number is the backend-computed figure carried on
 * the profile — the same one that decides referral qualification — so this can't
 * disagree with what POST /enquiries would allow.
 */
export function ProfileGateCard({ completion }: Readonly<{ completion: number | null }>) {
  return (
    <Card className="gap-3 bg-amber-50/70 p-4 ring-amber-500/25 dark:bg-amber-500/10 dark:ring-amber-500/20">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
          <Lock className="size-4" aria-hidden />
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">Complete your profile to send enquiries</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Institutions and agents need a full profile before they can answer you. You need{" "}
            {REQUIRED_COMPLETION}% to send an enquiry.
          </p>

          {completion !== null && (
            <Progress value={completion} className="mt-3 gap-1.5">
              <ProgressLabel className="text-xs text-muted-foreground">Profile completion</ProgressLabel>
              <ProgressValue className="text-xs font-medium text-foreground" />
            </Progress>
          )}
        </div>

        <Button variant="outline" size="sm" className="shrink-0" render={<Link href="/personal/profile" />}>
          Complete profile
        </Button>
      </div>
    </Card>
  );
}
