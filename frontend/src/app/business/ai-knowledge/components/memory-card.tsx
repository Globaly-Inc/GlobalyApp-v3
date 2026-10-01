"use client";

import { AlertTriangle, Flag, Pin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/components/feed/utils";
import { MEMORY_TYPE_META, SOURCE_LABEL, STATUS_META } from "../const";
import { actionsFor, confidencePct, isAlwaysOn, provenanceLine } from "../utils";
import type { Memory } from "../apis/types";

const TONE: Record<"ok" | "pending" | "muted", string> = {
  ok: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  pending: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  muted: "border-border bg-muted text-muted-foreground",
};

/**
 * One thing the counsellor knows.
 *
 * The statement itself is the heading — not the type, not the status. Someone scanning this list
 * is deciding whether a sentence is right, and every label around it is there to answer "should I
 * trust this one", which is why provenance sits directly under the text rather than behind the
 * detail sheet.
 */
export function MemoryCard({
  memory, onOpen, onApprove, onDeprecate, onReactivate, busy,
}: Readonly<{
  memory: Memory;
  onOpen: (memory: Memory) => void;
  onApprove: (memory: Memory) => void;
  onDeprecate: (memory: Memory) => void;
  onReactivate: (memory: Memory) => void;
  busy: boolean;
}>) {
  const type = MEMORY_TYPE_META[memory.type];
  const status = STATUS_META[memory.status];
  const actions = actionsFor(memory);
  const Icon = type?.icon;
  const provenance = provenanceLine(memory);
  const learned = memory.source === "extracted" || memory.source === "feedback";

  return (
    <div
      className={cn(
        "rounded-lg border p-4 transition-colors",
        memory.status === "deprecated" && "opacity-60",
        memory.conflicts_with_id && "border-destructive/30 bg-destructive/[0.03]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            {Icon && <Icon className="size-3.5 shrink-0 text-muted-foreground" />}
            <span className="text-xs font-medium text-muted-foreground">{type?.label ?? memory.type}</span>
            <Badge variant="outline" className={cn("text-[11px]", TONE[status.tone])}>{status.label}</Badge>
            {isAlwaysOn(memory) && (
              <Badge variant="outline" className="gap-1 text-[11px]">
                <Pin className="size-3" /> Every reply
              </Badge>
            )}
            {memory.flagged_at && (
              <Badge variant="outline" className="gap-1 border-amber-500/20 bg-amber-500/10 text-[11px] text-amber-700 dark:text-amber-400">
                <Flag className="size-3" /> Flagged
              </Badge>
            )}
          </div>

          <button
            type="button"
            onClick={() => onOpen(memory)}
            className="cursor-pointer text-left text-sm leading-relaxed hover:underline"
          >
            {memory.content}
          </button>

          <p className="mt-1.5 text-xs text-muted-foreground">
            {SOURCE_LABEL[memory.source]}
            {learned && ` · ${confidencePct(memory.confidence)} confident`}
            {` · ${relativeTime(memory.created_at)}`}
          </p>
          {provenance && <p className="mt-0.5 text-xs text-muted-foreground">{provenance}</p>}
        </div>
      </div>

      {memory.conflicts_with_id && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 p-2.5 text-xs">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
          <span>
            This contradicts something your counsellor already follows, so it will never go into
            use on its own. Open it to see both and decide.
          </span>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {actions.canApprove && (
          <Button size="sm" onClick={() => onApprove(memory)} disabled={busy}>
            {memory.conflicts_with_id ? "Use this one instead" : "Put into use"}
          </Button>
        )}
        {actions.canDeprecate && (
          <Button size="sm" variant="outline" onClick={() => onDeprecate(memory)} disabled={busy}>
            {memory.status === "candidate" ? "Discard" : "Retire"}
          </Button>
        )}
        {actions.canReactivate && (
          <Button size="sm" variant="outline" onClick={() => onReactivate(memory)} disabled={busy}>
            Put back into use
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => onOpen(memory)}>
          Details
        </Button>
      </div>
    </div>
  );
}
