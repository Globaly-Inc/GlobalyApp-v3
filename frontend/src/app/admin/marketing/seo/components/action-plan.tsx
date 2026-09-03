"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { regenerateActionPlan } from "../store/seo-slice";

const PRIORITY_VARIANT: Record<1 | 2 | 3, "default" | "secondary" | "outline"> = {
  1: "default",
  2: "secondary",
  3: "outline",
};

export function ActionPlan() {
  const dispatch = useAppDispatch();
  const { actionPlan, actionPlanStatus } = useAppSelector((state) => state.marketingSeo);
  const loading = actionPlanStatus === "loading";

  const handleRegenerate = async () => {
    try {
      await dispatch(regenerateActionPlan()).unwrap();
    } catch {
      toast.error("Failed to generate the action plan. Try again.");
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-lg">Action plan</CardTitle>
        <Button variant="outline" size="sm" className="h-8 cursor-pointer" onClick={handleRegenerate} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Regenerate
        </Button>
      </CardHeader>
      <CardContent>
        {actionPlan.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No action plan yet — click Regenerate to have Gemini draft one from your rankings and readiness data.
          </p>
        ) : (
          <ol className="flex flex-col gap-2.5">
            {actionPlan.map((item, i) => (
              <li key={`${item.priority}-${i}`} className="flex items-start gap-3 rounded-md border border-border px-3 py-2.5">
                <Badge variant={PRIORITY_VARIANT[item.priority]} className="mt-0.5 shrink-0">
                  P{item.priority}
                </Badge>
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{item.action}</p>
                  {(item.keyword || item.blog_slug) && (
                    <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                      {item.keyword && <span className="rounded bg-muted px-1.5 py-0.5">{item.keyword}</span>}
                      {item.blog_slug && <span className="rounded bg-muted px-1.5 py-0.5 font-mono">{item.blog_slug}</span>}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
