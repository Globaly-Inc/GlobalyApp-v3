"use client";

import { AlertTriangle, Flag, Pin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/components/feed/utils";
import { MEMORY_TYPE_META } from "../const";
import { actionsFor, confidencePct, isAlwaysOn, needsDecision, provenanceLine, sourceLine } from "../utils";
import type { Memory } from "../apis/types";

/**
 * The spine colour down the card's left edge, by what the row needs from you.
 *
 * STATE, not type. Eleven memory types would mean eleven hues nobody can hold in their head, and
 * the question someone is actually answering while scanning this list is "does this need me" —
 * so there are four states and the colour answers that. The label beside the icon still names
 * the type, so identity never rests on colour alone.
 */
const SPINE: Record<"attention" | "pending" | "live" | "retired", string> = {
  attention: "bg-destructive",
  pending: "bg-[hsl(var(--gold))]",
  live: "bg-emerald-500",
  retired: "bg-border",
};

function spineOf(memory: Memory): keyof typeof SPINE {
  if (memory.conflicts_with_id || memory.flagged_at) return "attention";
  if (memory.status === "candidate") return "pending";
  if (memory.status === "deprecated") return "retired";
  return "live";
}

/**
 * One thing the counsellor knows.
 *
 * The statement is the card — it is set at reading size with the metadata shrunk around it,
 * because someone scanning this list is deciding whether a sentence is right and everything else
 * is there to answer "should I trust this one". Provenance stays on the card rather than behind
 * the sheet for the same reason: "seen in 2 conversations, 1 more puts it to work" is the line
 * that decides whether to act now or wait.
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
  const actions = actionsFor(memory);
  const Icon = type?.icon;
  const provenance = provenanceLine(memory);
  const learned = memory.source === "extracted" || memory.source === "feedback";
  const needsYou = needsDecision(memory);

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-card pl-5 transition-all",
        "hover:border-foreground/15 hover:shadow-sm",
        memory.status === "deprecated" && "opacity-65",
        memory.conflicts_with_id && "border-destructive/25",
      )}
    >
      {/* The spine. Inset rather than a border so the card keeps one radius and the colour
          doesn't have to be re-stated on every edge. */}
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1.5", SPINE[spineOf(memory)])} />

      <div className="p-4">
        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {Icon && <Icon className="size-3.5 shrink-0 text-muted-foreground" />}
          <span className="font-medium text-muted-foreground">{type?.label ?? memory.type}</span>

          {isAlwaysOn(memory) && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              <Pin className="size-2.5" /> Every reply
            </span>
          )}
          {memory.flagged_at && (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
              <Flag className="size-2.5" /> Flagged
            </span>
          )}
          {memory.status === "candidate" && (
            <span className="rounded-full bg-[hsl(var(--gold)/0.15)] px-2 py-0.5 text-[11px] font-medium text-[hsl(187_92%_28%)] dark:text-[hsl(var(--gold))]">
              Awaiting review
            </span>
          )}
          {memory.status === "deprecated" && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              Retired
            </span>
          )}
        </div>

        {/* The statement, at reading size. A button so the whole sentence is the target — a
            "Details" link at the end of a three-line paragraph is a 60px target after 300px of
            unclickable text. */}
        <button
          type="button"
          onClick={() => onOpen(memory)}
          className="cursor-pointer text-left text-[15px] font-medium leading-relaxed text-foreground decoration-muted-foreground/40 underline-offset-4 hover:underline"
        >
          {memory.content}
        </button>

        <p className="mt-2 text-xs text-muted-foreground">
          {sourceLine(memory)}
          {learned && ` · ${confidencePct(memory.confidence)} confident`}
          {` · ${relativeTime(memory.created_at)}`}
          {provenance && ` · ${provenance}`}
        </p>

        {memory.conflicts_with_id && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-destructive/[0.07] p-3 text-xs text-destructive">
            <AlertTriangle className="mt-px size-3.5 shrink-0" />
            <span className="text-destructive/90">
              This contradicts something your counsellor already follows, so it will never go into
              use on its own. Open it to see both and decide.
            </span>
          </div>
        )}

        {/*
          Actions are always on screen for a row that needs a decision, and appear on hover or
          keyboard focus for one that does not.

          `focus-within` is the half that makes this keyboard-reachable: a hover-only control is
          invisible to someone tabbing through, and these are the primary actions of the page.
          The retired/in-use rows still carry Details, so no row is ever actionless.
        */}
        <div
          className={cn(
            "flex flex-wrap items-center gap-1.5 transition-opacity",
            needsYou
              ? "mt-3"
              : "mt-3 opacity-0 group-hover:opacity-100 focus-within:opacity-100",
          )}
        >
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
    </article>
  );
}
