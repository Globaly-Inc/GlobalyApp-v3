"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { BusinessService } from "../../apis/types";
import { needsApproval } from "./use-course-approval";

/** Each action shows how many of the selected rows it would actually change, and is disabled
 *  when that's none — e.g. Publish skips courses still awaiting approval. Floats at the bottom of
 *  the viewport and slides up while anything is selected. */
export function ServiceBulkBar({
  selected,
  canApprove,
  onApprove,
  onPublish,
  onUnpublish,
  onDelete,
  onClear,
}: Readonly<{
  selected: BusinessService[];
  canApprove: boolean;
  onApprove: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onDelete: () => void;
  onClear: () => void;
}>) {
  const open = selected.length > 0;
  const toApprove = selected.filter(needsApproval).length;
  const toPublish = selected.filter((s) => !s.is_published && !needsApproval(s)).length;
  const toUnpublish = selected.filter((s) => s.is_published).length;

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      inert={!open}
      className={cn(
        "fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 rounded-[14px] bg-foreground p-2 text-background shadow-[0_18px_40px_-12px_rgb(10_14_30/0.45)]",
        "transition-[translate,opacity] duration-350 ease-[cubic-bezier(.3,1.3,.5,1)] motion-reduce:transition-none",
        open ? "translate-y-0 opacity-100" : "translate-y-[150%] opacity-0",
      )}
    >
      <span className="rounded-[7px] bg-primary px-2 py-[3px] font-mono text-xs font-semibold tabular-nums text-primary-foreground">{selected.length}</span>
      <span className="pr-1.5 text-[13px] font-semibold">selected</span>
      {canApprove && toApprove > 0 && (
        <CountButton label="Approve" count={toApprove} of={selected.length} onClick={onApprove} className="text-emerald-300 hover:text-emerald-200 dark:text-emerald-700 dark:hover:text-emerald-800" />
      )}
      <CountButton label="Publish" count={toPublish} of={selected.length} onClick={onPublish}
        title={toPublish === 0 ? "Nothing selected can be published — approve courses first" : undefined} />
      <CountButton label="Unpublish" count={toUnpublish} of={selected.length} onClick={onUnpublish} />
      <CountButton label="Delete" count={selected.length} of={selected.length} onClick={onDelete} className="text-[#ff9d9d] hover:text-[#ffb8b8] dark:text-red-600 dark:hover:text-red-700" />
      <button type="button" onClick={onClear} aria-label="Clear selection" className="flex size-[34px] items-center justify-center rounded-[9px] bg-background/12 text-background/70 transition-colors hover:bg-background/15 hover:text-background">
        <X className="size-4" />
      </button>
    </div>
  );
}

/** Disabled when it would change nothing; shows a count only when it skips some of the selection. */
function CountButton({ label, count, of, onClick, title, className }: Readonly<{
  label: string; count: number; of: number; onClick: () => void; title?: string; className?: string;
}>) {
  return (
    <Button
      size="sm"
      variant="ghost"
      className={cn("h-[34px] gap-1.5 rounded-[9px] bg-background/12 px-[11px] text-[12.5px] font-semibold text-background hover:bg-background/22 hover:text-background active:scale-95 disabled:opacity-40", className)}
      disabled={count === 0}
      onClick={onClick}
      title={title}
    >
      {label}
      {count > 0 && count < of && <span className="font-mono text-[10px] font-semibold tabular-nums opacity-75">{count}</span>}
    </Button>
  );
}
