"use client";

import { CheckCircle2, Circle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

/**
 * Progress towards a complete service profile — V1's "Service profile setup" card.
 *
 * Two things V1 does that a plain checklist doesn't: the card disappears once everything is done
 * (a permanent 5/5 is clutter on a finished service), and only the outstanding steps are listed,
 * so it reads as a to-do rather than a report card.
 */
export function ServiceSetupChecklist({
  steps,
}: Readonly<{ steps: { label: string; done: boolean }[] }>) {
  const remaining = steps.filter((s) => !s.done);
  if (steps.length === 0 || remaining.length === 0) return null;

  const doneCount = steps.length - remaining.length;

  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-3 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
          <span className="shrink-0">Service profile setup</span>
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <Progress value={Math.round((doneCount / steps.length) * 100)} className="h-1.5 flex-1" />
            <span className="shrink-0 text-xs font-normal text-muted-foreground">
              {doneCount}/{steps.length}
            </span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
          {remaining.map((step) => (
            <div key={step.label} className="flex items-center gap-2 text-sm text-muted-foreground">
              <Circle className="h-4 w-4" />
              {step.label}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
