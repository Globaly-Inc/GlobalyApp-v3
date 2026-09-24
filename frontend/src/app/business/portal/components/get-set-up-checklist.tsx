"use client";

import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { businessApi } from "../../apis";
import type { OnboardingProgress } from "../../apis/types";

/** Where each step's "Start now" sends the owner. extract_website has no route of its own — its
 * card is already the main thing on this page, so it just scrolls to it. */
const STEP_LINKS: Record<string, string> = {
  extract_website: "#extraction-card",
  review_courses: "/business/profile?tab=services",
  customize_assistant: "/business/settings/ai-embed",
  add_chat_widget: "/business/settings/ai-embed",
  invite_team: "/business/profile?tab=members",
};

export function GetSetUpChecklist({ progress }: Readonly<{ progress: OnboardingProgress }>) {
  const firstIncompleteIndex = progress.steps.findIndex((s) => !s.done);
  const percent = progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;

  return (
    <Card id="get-set-up">
      <CardHeader className="space-y-2 pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Get set up</CardTitle>
          <span className="text-xs font-medium tabular-nums text-muted-foreground">
            {progress.completed}/{progress.total}
          </span>
        </div>
        <Progress value={percent} className="h-1.5" />
      </CardHeader>
      <CardContent className="space-y-0.5 pb-4">
        {progress.steps.map((step, i) => {
          const isCurrent = i === firstIncompleteIndex;
          const href = STEP_LINKS[step.key];
          return (
            <div key={step.key} className="flex items-start gap-3 py-2">
              <span className="mt-0.5 shrink-0">
                {step.done ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : isCurrent ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-primary">
                    <span className="h-2 w-2 rounded-full bg-primary" />
                  </span>
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground/30" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className={cn("text-sm font-medium", step.done ? "text-muted-foreground line-through" : "text-foreground")}>
                    {step.label}
                  </p>
                  {step.duration && !step.done && (
                    <span className="shrink-0 text-xs text-muted-foreground">{step.duration}</span>
                  )}
                </div>
                {step.detail && !step.done && <p className="text-xs text-muted-foreground">{step.detail}</p>}
                {isCurrent && href && (
                  <Link
                    href={href}
                    onClick={() => {
                      if (step.key === "review_courses") businessApi.markCoursesReviewed().catch(() => {});
                    }}
                    className="mt-1.5 inline-flex h-7 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Start now
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
