"use client";

import { History, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AgentRun } from "../apis/types";

function runStatusClass(status: string) {
  if (status === "completed" || status === "done") return "bg-success/15 text-success";
  if (status === "failed") return "bg-destructive/15 text-destructive";
  if (status === "running") return "bg-info/15 text-info";
  return "bg-muted text-muted-foreground";
}

export function AgentExtractionHistory({
  runs,
  loading,
  rerunning,
  onRerun,
}: Readonly<{ runs: AgentRun[]; loading: boolean; rerunning: boolean; onRerun: () => void }>) {
  const last = runs[0];
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <History className="h-4 w-4 text-primary" />
            Extraction History
          </CardTitle>
          <Button size="sm" className="h-8 gap-1.5 cursor-pointer" onClick={onRerun} disabled={rerunning}>
            <RefreshCw className={cn("h-3.5 w-3.5", rerunning && "animate-spin")} />
            {rerunning ? "Running…" : "Run again"}
          </Button>
        </div>
        {last && (
          <p className="pt-1 text-xs text-muted-foreground">
            Last run: <span className="font-medium text-foreground">{new Date(last.started_at).toLocaleString()}</span>
            {" · "}
            <span className="font-medium text-foreground">{last.agents_found} agents</span>
            {last.agents_new > 0 && <span className="text-success"> (+{last.agents_new} new)</span>}
            {last.agents_removed > 0 && <span className="text-destructive"> (-{last.agents_removed} removed)</span>}
          </p>
        )}
      </CardHeader>
      {!loading && runs.length > 0 && (
        <CardContent className="pt-0">
          <div className="max-h-48 space-y-1.5 overflow-y-auto">
            {runs.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-muted/50">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={cn("inline-flex rounded px-1.5 py-0.5 text-xs font-medium", runStatusClass(r.status))}>
                    {r.status}
                  </span>
                  <span className="text-muted-foreground">{new Date(r.started_at).toLocaleString()}</span>
                  {r.provider && <code className="rounded bg-muted px-1 text-xs">{r.provider}</code>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-medium">{r.agents_found}</span>
                  {r.agents_new > 0 && <span className="text-success">+{r.agents_new}</span>}
                  {r.agents_removed > 0 && <span className="text-destructive">-{r.agents_removed}</span>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
