"use client";

import { Circle, CircleCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function ServiceSetupChecklist({
  steps,
}: Readonly<{ steps: { label: string; done: boolean }[] }>) {
  const doneCount = steps.filter((s) => s.done).length;
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-sm">
          Service profile setup
          <span className="text-xs font-normal text-muted-foreground">{doneCount}/{steps.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
        </div>
        <div className="space-y-2">
          {steps.map((s) => (
            <div key={s.label} className={cn("flex items-center gap-2 text-sm", s.done ? "text-foreground" : "text-muted-foreground")}>
              {s.done ? <CircleCheck className="h-4 w-4 text-primary" /> : <Circle className="h-4 w-4" />}
              {s.label}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
