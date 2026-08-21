"use client";

import type { LucideIcon } from "lucide-react";
import { AlertCircle, CheckCircle2, Circle, Lock, Loader2, MoreVertical, Play, RefreshCcw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { fmtTime } from "../utils";
import { useConfirmDelete } from "./use-confirm-delete";
import type { JobTab } from "./job-tabs-bar";
import type { ExtractionJob } from "../apis/types";

export type ContextKey = "branches_urls" | "agents_urls" | "course_list_urls" | "extract_fields";

export type TabCard = {
  key: string;
  label: string;
  icon: LucideIcon;
  count: number;
  updated: string | null;
  tab: JobTab;
  /** Pipeline step to dispatch for a re-run. Absent = no Run button. */
  step?: string;
  /** Guided-URL key that must be filled in before the step can run. */
  contextKey?: ContextKey;
  contextLabel?: string;
  /** Set when the card shows a Run button the backend can't serve job-wide yet. */
  runBlockedReason?: string;
};

type CardState = "not_extracted" | "processing" | "completed" | "failed";

// Individual tabs don't have their own tracked status — only the job as a whole does.
// A tab with data is "completed" regardless of job status (the data is real and stays).
// Only an empty tab inherits the job's in-flight/failed state as a reasonable guess.
function deriveState(hasData: boolean, jobStatus: ExtractionJob["status"], jobActive: boolean): CardState {
  if (hasData) return "completed";
  if (jobStatus === "failed") return "failed";
  if (jobActive) return "processing";
  return "not_extracted";
}

const STATE_META: Record<CardState, { icon: LucideIcon; className: string; label: (count: number) => string }> = {
  completed: { icon: CheckCircle2, className: "text-emerald-600", label: (n) => `${n} record${n === 1 ? "" : "s"} extracted` },
  processing: { icon: Loader2, className: "text-purple-600", label: () => "Extraction in progress" },
  failed: { icon: AlertCircle, className: "text-red-600", label: () => "Extraction failed — you can retry" },
  not_extracted: { icon: Circle, className: "text-muted-foreground", label: () => "Not extracted yet" },
};

function CardActions({
  card, runnable, hasContext, hasData, busy, onRun, onJumpToTab,
}: Readonly<{
  card: TabCard; runnable: boolean; hasContext: boolean; hasData: boolean; busy: boolean;
  onRun: () => void; onJumpToTab: (tab: JobTab) => void;
}>) {
  if (runnable && hasContext) {
    return (
      <div className="flex items-center gap-1.5">
        <Button
          variant={hasData ? "outline" : "default"}
          size="sm"
          className="h-8 flex-1 gap-1.5 text-xs cursor-pointer"
          disabled={busy || Boolean(card.runBlockedReason)}
          title={card.runBlockedReason}
          onClick={onRun}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : hasData ? <RefreshCcw className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          {hasData ? "Re-run" : "Run"}
        </Button>
        {card.contextKey && (
          <DropdownMenu>
            <DropdownMenuTrigger title="More actions" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground">
              <MoreVertical className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onJumpToTab("context")}>
                <Settings2 className="h-3.5 w-3.5" /> Add Context
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    );
  }

  if (runnable && !hasContext) {
    return (
      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="sm" className="h-8 flex-1 gap-1.5 text-xs" disabled title={`Add ${card.contextLabel} in the Context tab first`}>
          <Lock className="h-3 w-3" />
          Run
        </Button>
        <Button size="sm" className="h-8 flex-1 gap-1.5 text-xs cursor-pointer" onClick={() => onJumpToTab("context")}>
          <Settings2 className="h-3 w-3" />
          Add Context
        </Button>
      </div>
    );
  }

  if (!runnable && card.contextKey && !hasContext && !hasData) {
    return (
      <Button size="sm" className="h-8 w-full gap-1.5 text-xs cursor-pointer" onClick={() => onJumpToTab("context")}>
        <Settings2 className="h-3 w-3" />
        Add Context
      </Button>
    );
  }

  return null;
}

export function TabSummaryCard({
  card, jobStatus, jobActive, busy, hasContext, onRun, onJumpToTab,
}: Readonly<{
  card: TabCard;
  jobStatus: ExtractionJob["status"];
  jobActive: boolean;
  busy: boolean;
  hasContext: boolean;
  onRun: () => void;
  onJumpToTab: (tab: JobTab) => void;
}>) {
  const { confirm, dialog } = useConfirmDelete();
  const hasData = card.count > 0 || Boolean(card.updated);
  const state = deriveState(hasData, jobStatus, jobActive);
  const meta = STATE_META[state];
  const runnable = Boolean(card.step) || Boolean(card.runBlockedReason);

  async function handleRun() {
    if (hasData) {
      const ok = await confirm(
        `Re-run ${card.label}?`,
        `This re-extracts ${card.label.toLowerCase()} data. Existing records are kept and updated, not deleted.`,
        { confirmLabel: "Re-run", variant: "default" },
      );
      if (!ok) return;
    }
    onRun();
  }

  return (
    <Card className="flex h-full flex-col overflow-hidden transition-shadow hover:shadow-sm">
      <button
        onClick={() => onJumpToTab(card.tab)}
        className="group -mt-4 flex items-center justify-between gap-2 border-b bg-primary/5 px-4 py-3 text-left cursor-pointer"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <card.icon className="h-4 w-4" />
          </div>
          <span className="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-primary">{card.label}</span>
        </div>
        <span className={cn("shrink-0 text-2xl font-bold leading-none", state === "not_extracted" ? "text-muted-foreground/40" : "text-foreground")}>
          {card.count}
        </span>
      </button>

      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex-1 space-y-1">
          <div className={cn("flex items-center gap-1.5 text-xs font-medium", meta.className)}>
            <meta.icon className={cn("h-3.5 w-3.5", state === "processing" && "animate-spin")} />
            {meta.label(card.count)}
          </div>
          {hasData && <p className="text-xs text-muted-foreground">Updated {fmtTime(card.updated)}</p>}
        </div>

        <CardActions card={card} runnable={runnable} hasContext={hasContext} hasData={hasData} busy={busy} onRun={handleRun} onJumpToTab={onJumpToTab} />
      </CardContent>
      {dialog}
    </Card>
  );
}
