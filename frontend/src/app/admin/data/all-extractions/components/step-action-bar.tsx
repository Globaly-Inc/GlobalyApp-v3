"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertCircle, CheckCircle2, Clock, Loader2, MinusCircle, Play, Settings2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { allExtractionsApi } from "../apis";
import { fmtTime } from "../utils";
import type { ContextKey } from "../const";

/** V3 writes plain strings into pipeline_progress; V2 wrote {status, updated_at}. Accept both. */
function readStatus(progress: unknown): string | undefined {
  if (typeof progress === "string") return progress;
  if (progress && typeof progress === "object") return (progress as { status?: string }).status;
  return undefined;
}

type StepBadge = { label: string; icon: LucideIcon; className: string; spin?: boolean };

const RUNNING: StepBadge = { label: "Running", icon: Loader2, className: "bg-blue-500/15 text-blue-700", spin: true };
const STOPPED: StepBadge = { label: "Stopped", icon: MinusCircle, className: "bg-amber-500/15 text-amber-700" };
const COMPLETE: StepBadge = { label: "Complete", icon: CheckCircle2, className: "bg-emerald-500/15 text-emerald-700" };
const NOT_RUN: StepBadge = { label: "Not run", icon: Clock, className: "border border-border text-muted-foreground" };

const BADGES: Record<string, StepBadge> = {
  running: RUNNING,
  processing: RUNNING,
  failed: { label: "Failed", icon: XCircle, className: "bg-destructive/15 text-destructive" },
  paused: STOPPED,
  halted: STOPPED,
  done: COMPLETE,
  completed: COMPLETE,
  skipped: { label: "Skipped", icon: MinusCircle, className: "border border-border text-muted-foreground" },
};

export function StepActionBar({
  jobId,
  step,
  label,
  runLabel,
  runBlockedReason,
  progress,
  lastUpdated,
  hasData = false,
  guidedUrls,
  contextKey,
  contextLabel,
  onChanged,
  onAddContext,
}: Readonly<{
  jobId: string;
  step: string;
  label: string;
  /** Overrides the default "Run extraction" wording. */
  runLabel?: string;
  /** Set when this step can't be dispatched job-wide — Run stays disabled with this tooltip. */
  runBlockedReason?: string;
  progress?: unknown;
  lastUpdated?: string | null;
  hasData?: boolean;
  guidedUrls?: Record<string, unknown> | null;
  contextKey?: ContextKey;
  contextLabel?: string;
  onChanged: () => void;
  onAddContext: () => void;
}>) {
  const [busy, setBusy] = useState(false);

  const status = readStatus(progress);
  const badge: StepBadge = (status ? BADGES[status] : undefined) ?? (hasData ? COMPLETE : NOT_RUN);
  const running = status === "running" || status === "processing";
  const hasRun = status === "done" || status === "failed" || hasData;

  const contextValue = contextKey ? (guidedUrls ?? {})[contextKey] : undefined;
  const contextOk = !contextKey || (Array.isArray(contextValue) && contextValue.length > 0);

  const run = async () => {
    setBusy(true);
    try {
      await allExtractionsApi.runStep(jobId, step);
      toast.success(`${label} extraction started`, { description: "Running in the background — you can switch tabs." });
      onChanged();
    } catch (e) {
      toast.error("Run failed", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/15 bg-primary/5 p-3">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", badge.className)}>
          <badge.icon className={cn("h-3 w-3", badge.spin && "animate-spin")} />
          {badge.label}
        </span>
        <span className="text-xs text-muted-foreground">Last updated: {fmtTime(lastUpdated)}</span>
        {!contextOk && (
          <span className="inline-flex items-center gap-1 text-xs text-amber-700">
            <AlertCircle className="h-3.5 w-3.5" />
            Missing {contextLabel ?? "context"} — add it in the Context tab to enable Run.
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 cursor-pointer"
          disabled={busy || running || !contextOk || Boolean(runBlockedReason)}
          title={runBlockedReason ?? (contextOk ? undefined : `Add ${contextLabel ?? "context"} in the Context tab first`)}
          onClick={run}
        >
          {busy || running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          {runLabel ?? (hasRun ? "Re-run extraction" : "Run extraction")}
        </Button>
        {!contextOk && (
          <Button size="sm" className="h-8 gap-1.5 cursor-pointer" onClick={onAddContext}>
            <Settings2 className="h-3.5 w-3.5" />
            Add Context
          </Button>
        )}
      </div>
    </div>
  );
}
