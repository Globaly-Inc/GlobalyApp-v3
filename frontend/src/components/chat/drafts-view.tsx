"use client";

import { useSyncExternalStore } from "react";
import { FileEdit, MessageSquare, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { deleteDraft, getAllDrafts, getServerDrafts, subscribeDrafts } from "./draft-store";
import { fullStamp } from "./utils";
import { SpecialViewHeader } from "./special-view-header";

/**
 * The Drafts shortcut — GlobalyOS V2's `DraftsView`: bordered cards, a rounded icon
 * tile, a "Draft" badge, the draft text clamped to two lines, the timestamp, and a
 * hover-revealed delete.
 *
 * Reads the localStorage store through `useSyncExternalStore`, exactly as V2 does, so
 * typing in the composer updates this list and the sidebar's count with no store round
 * trip and no draft endpoint.
 */
export function DraftsView({
  onBack,
  onOpen,
}: Readonly<{ onBack: () => void; onOpen: (distributionId: string) => void }>) {
  const drafts = useSyncExternalStore(subscribeDrafts, getAllDrafts, getServerDrafts);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <SpecialViewHeader type="drafts" onBack={onBack} />

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {drafts.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <FileEdit className="mx-auto mb-3 size-12 opacity-30" aria-hidden />
            <p>No drafts</p>
            <p className="mt-1 text-sm">Unsent messages will appear here</p>
          </div>
        ) : (
          drafts.map((draft) => (
            <button
              key={draft.distributionId}
              type="button"
              onClick={() => onOpen(draft.distributionId)}
              className="group w-full cursor-pointer rounded-lg border border-border bg-background p-3 text-left transition-colors hover:bg-muted"
            >
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <MessageSquare className="size-4 text-muted-foreground" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{draft.counterpartName}</span>
                    <Badge variant="secondary" className="shrink-0 text-xs">
                      Draft
                    </Badge>
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label="Discard draft"
                      title="Discard draft"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteDraft(draft.distributionId);
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.stopPropagation();
                        deleteDraft(draft.distributionId);
                      }}
                      className="ml-auto flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5 text-destructive" />
                    </span>
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{draft.content}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{fullStamp(draft.updatedAt)}</p>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
