"use client";

import { CheckCircle2, Eye, EyeOff, Loader2, Trash2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { BusinessService } from "../../apis/types";
import { needsApproval } from "./use-course-approval";

/** Each action shows how many of the selected rows it would actually change, and is disabled
 *  when that's none — e.g. Publish skips courses still awaiting approval. */
export function ServiceBulkBar({
  selected,
  canApprove,
  onApprove,
  onPublish,
  onUnpublish,
  onDelete,
}: Readonly<{
  selected: BusinessService[];
  canApprove: boolean;
  onApprove: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onDelete: () => void;
}>) {
  const toApprove = selected.filter(needsApproval).length;
  const toPublish = selected.filter((s) => !s.is_published && !needsApproval(s)).length;
  const toUnpublish = selected.filter((s) => s.is_published).length;

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-background p-1.5 shadow-sm">
      <span className="flex items-center gap-1.5 px-1.5 text-sm font-medium">
        <span className="rounded-md bg-primary px-1.5 py-0.5 text-xs tabular-nums text-primary-foreground">{selected.length}</span>
        selected
      </span>
      <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
      {canApprove && toApprove > 0 && (
        <CountButton icon={CheckCircle2} label="Approve" count={toApprove} onClick={onApprove}
          className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-950/40" />
      )}
      <CountButton icon={Eye} label="Publish" count={toPublish} onClick={onPublish}
        title={toPublish === 0 ? "Nothing selected can be published — approve courses first" : undefined}
        className="text-primary hover:text-primary" />
      <CountButton icon={EyeOff} label="Unpublish" count={toUnpublish} onClick={onUnpublish} />
      <CountButton icon={Trash2} label="Delete" count={selected.length} onClick={onDelete}
        className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive" />
    </div>
  );
}

/** Icon + label + a count pill; disabled when the count is 0. */
function CountButton({ icon: Icon, label, count, onClick, title, className }: Readonly<{
  icon: LucideIcon; label: string; count: number; onClick: () => void; title?: string; className?: string;
}>) {
  return (
    <Button size="sm" variant="outline" className={cn("h-8 gap-1.5", className)} disabled={count === 0} onClick={onClick} title={title}>
      <Icon className="h-3.5 w-3.5" />
      {label}
      <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">{count}</span>
    </Button>
  );
}

/** Gmail-style: once a whole page is ticked, offer to extend the selection to every page. */
export function SelectAllBanner({
  pageCount,
  total,
  allSelected,
  loading,
  onSelectAll,
  onClear,
}: Readonly<{
  pageCount: number;
  total: number;
  allSelected: boolean;
  loading: boolean;
  onSelectAll: () => void;
  onClear: () => void;
}>) {
  return (
    <div className="mb-3 flex items-center justify-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-foreground">
      {allSelected ? (
        <>
          <span>All <strong>{total}</strong> courses are selected.</span>
          <Button size="sm" variant="link" className="h-auto p-0" onClick={onClear}>Clear selection</Button>
        </>
      ) : (
        <>
          <span>All {pageCount} on this page are selected.</span>
          <Button size="sm" variant="link" className="h-auto p-0" disabled={loading} onClick={onSelectAll}>
            {loading && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Select all {total} courses
          </Button>
        </>
      )}
    </div>
  );
}
