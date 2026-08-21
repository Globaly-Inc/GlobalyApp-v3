"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { ProfileCompletion } from "@/app/personal/apis/types";

/**
 * V1's completion card, measurement for measurement: p-5 content, the percentage right-aligned against a
 * text-sm label, a h-2 progress bar, the criteria as wrap-around badges, and a full-width CTA.
 *
 * Hidden at 100%, exactly as V1 does — the card exists to say what is missing.
 */
export function CompletionCard({ completion }: { completion: ProfileCompletion | null }) {
  if (!completion || completion.percentage >= 100) return null;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-2">
          <p className="font-semibold text-sm">Complete your profile</p>
          <span className="text-sm font-bold text-primary">{completion.percentage}%</span>
        </div>

        <Progress value={completion.percentage} className="h-2 mb-3" />

        <div className="flex flex-wrap gap-1.5 mb-3">
          {completion.items.map((item) => (
            <Badge
              key={item.label}
              variant={item.met ? "default" : "outline"}
              className={cn(
                "text-xs",
                item.met && "bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100",
              )}
            >
              {item.met && <CheckCircle className="h-3 w-3 mr-1" />}
              {item.label}
            </Badge>
          ))}
        </div>

        <Button size="sm" className="w-full" render={<Link href="/personal/profile" />}>
          Complete profile <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
