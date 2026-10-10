"use client";

import { AlertTriangle, Flag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { relativeTime } from "@/components/feed/utils";
import { CANDIDATE_TTL_DAYS, MEMORY_TYPE_META, STATUS_META } from "../const";
import { actionsFor, confidencePct, isAlwaysOn, metadataPairs, sourceLine } from "../utils";
import type { Memory, MemoryHistoryEntry } from "../apis/types";

const BY_LABEL: Record<string, string> = {
  admin: "your team", counsellor: "a counsellor", student: "a visitor", system: "the system",
};

const EVENT_LABEL: Record<MemoryHistoryEntry["event"], string> = {
  created: "Added", reinforced: "Seen again", promoted: "Put into use", deprecated: "Retired",
  reactivated: "Put back into use", deleted: "Deleted", voted: "Voted on",
  flagged: "Flagged for review", edited: "Edited", conflict_flagged: "Found to contradict another rule",
};

function Row({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-sm">{value}</span>
    </div>
  );
}

/**
 * Everything behind one statement: where it came from, what has happened to it, and the
 * decisions available.
 *
 * SheetContent carries no padding of its own, so the body is wrapped — matching the visitor
 * drawer next door.
 */
export function MemoryDetailSheet({
  memory, conflictsWith, open, onOpenChange, onApprove, onDeprecate, onReactivate, onUnflag, onDelete, onEdit, busy,
}: Readonly<{
  memory: Memory | null;
  /** The memory this one contradicts, when the list happens to hold it. */
  conflictsWith: Memory | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: (memory: Memory) => void;
  onDeprecate: (memory: Memory) => void;
  onReactivate: (memory: Memory) => void;
  onUnflag: (memory: Memory) => void;
  onDelete: (memory: Memory) => void;
  onEdit: (memory: Memory) => void;
  busy: boolean;
}>) {
  if (!memory) return null;
  const type = MEMORY_TYPE_META[memory.type];
  const actions = actionsFor(memory);
  const pairs = metadataPairs(memory.metadata);
  const learned = memory.source === "extracted" || memory.source === "feedback";
  const history = [...memory.history].reverse();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{type?.label ?? memory.type}</SheetTitle>
          <SheetDescription>{type?.hint}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-4 pb-4">
          <p className="text-sm leading-relaxed">{memory.content}</p>

          {memory.conflicts_with_id && (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                <AlertTriangle className="size-3.5" /> Contradicts something already in use
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {conflictsWith
                  ? `“${conflictsWith.content}”`
                  : "The rule it contradicts isn't in the current filter — switch to All to see it."}
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Putting this one into use clears the contradiction. The other stays as it is, so
                retire it too if they genuinely cannot both be true.
              </p>
            </div>
          )}

          {memory.flagged_at && (
            <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                <Flag className="size-3.5" /> Visitors pushed back on this
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Enough visitors thumbed down replies that followed it. It is still in use — votes
                never retire something a person wrote, they only ask you to look.
              </p>
            </div>
          )}

          <div className="rounded-lg border p-3">
            <p className="mb-1 text-xs font-medium">Where it came from</p>
            <Row label="Source" value={sourceLine(memory)} />
            <Row label="Status" value={STATUS_META[memory.status].label} />
            {learned && <Row label="Model confidence" value={confidencePct(memory.confidence)} />}
            <Row label="Conversations it came from" value={String(memory.source_reference.actors.length)} />
            <Row label="Replies it has shaped" value={String(memory.use_count)} />
            <Row label="Last used" value={memory.last_used_at ? relativeTime(memory.last_used_at) : "Never"} />
            <Row label="Added" value={relativeTime(memory.created_at)} />
            {memory.expires_at && <Row label="Expires" value={relativeTime(memory.expires_at)} />}
            <Row label="Importance" value={`${memory.importance} of 5`} />
            {isAlwaysOn(memory) && <Row label="Applied" value="To every reply" />}
            {!memory.has_embedding && (
              <p className="mt-2 text-xs text-muted-foreground">
                This one has no search index yet, so it is only used when it applies to every
                reply — it won&apos;t be matched to a specific question.
              </p>
            )}
          </div>

          {memory.status === "candidate" && !memory.conflicts_with_id && (
            <p className="text-xs text-muted-foreground">
              Left alone, this is discarded after {CANDIDATE_TTL_DAYS} days.
            </p>
          )}

          {pairs.length > 0 && (
            <div className="rounded-lg border p-3">
              <p className="mb-1 text-xs font-medium">Details</p>
              {pairs.map((p) => <Row key={p.label} label={p.label} value={p.value} />)}
            </div>
          )}

          <div className="rounded-lg border p-3">
            <p className="mb-2 text-xs font-medium">History</p>
            <ol className="flex flex-col gap-2">
              {history.map((h, i) => (
                <li key={`${h.at}-${i}`} className="flex items-baseline justify-between gap-3 text-xs">
                  <span>
                    {EVENT_LABEL[h.event] ?? h.event}
                    {/* The one actor we can name. `by.id` is a platform user id for an admin entry
                        and a hash for a student one, so only the row's own author is resolvable —
                        and leaving "by your team" under a line that already names them reads as a
                        second, vaguer person. */}
                    {h.by && (
                      <span className="text-muted-foreground">
                        {" by "}
                        {h.event === "created" && memory.created_by_name
                          ? memory.created_by_name
                          : BY_LABEL[h.by.kind] ?? h.by.kind}
                      </span>
                    )}
                    {h.reason && <span className="block text-muted-foreground">{h.reason}</span>}
                  </span>
                  <span className="shrink-0 text-muted-foreground">{relativeTime(h.at)}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {actions.canApprove && <Button size="sm" onClick={() => onApprove(memory)} disabled={busy}>Put into use</Button>}
            {actions.canReactivate && <Button size="sm" onClick={() => onReactivate(memory)} disabled={busy}>Put back into use</Button>}
            {actions.canUnflag && <Button size="sm" variant="outline" onClick={() => onUnflag(memory)} disabled={busy}>Looked, it stays</Button>}
            {actions.canEdit && <Button size="sm" variant="outline" onClick={() => onEdit(memory)} disabled={busy}>Edit</Button>}
            {actions.canDeprecate && <Button size="sm" variant="outline" onClick={() => onDeprecate(memory)} disabled={busy}>Retire</Button>}
            {actions.canDelete && (
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onDelete(memory)} disabled={busy}>
                <Trash2 className="size-3.5" /> Delete
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Retiring keeps the record and stops it being used — and your counsellor will not learn
            it again. Deleting removes it entirely.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
