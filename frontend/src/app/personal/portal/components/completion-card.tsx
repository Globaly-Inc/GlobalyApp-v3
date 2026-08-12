"use client";

import Link from "next/link";
import { Check, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CompletionCardProps } from "../types";

/**
 * The gate's visible face. Rendered on every breakpoint (V2 hid it in a `lg:`-only rail, so the majority of
 * sessions never saw why enquiries were locked), and absent entirely at 100%.
 *
 * The percentage and the badges both come from the backend's single computation, so they cannot disagree.
 */
export function CompletionCard({ completion }: CompletionCardProps) {
  if (completion.percentage >= 100) return null;

  return (
    <Card className="border-primary/30 bg-primary/[0.03]">
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Complete your profile</p>
          <span className="text-sm font-bold text-primary">{completion.percentage}%</span>
        </div>

        <Progress value={completion.percentage} className="h-2" />

        <p className="text-xs text-muted-foreground">
          A complete profile is required to send enquiries to agents and institutions.
        </p>

        <div className="flex flex-wrap gap-1.5">
          {completion.badges.map((badge) => (
            <span
              key={badge.key}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                badge.done
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                  : "border border-border text-muted-foreground",
              )}
            >
              {badge.done && <Check className="h-3 w-3" />}
              {badge.label}
            </span>
          ))}
        </div>

        <Button className="w-full gap-1.5" render={<Link href="/personal/profile" />}>
          Complete profile <ArrowRight className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
