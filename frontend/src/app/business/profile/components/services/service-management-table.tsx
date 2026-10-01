"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, CheckCircle2, BookOpen, Eye, EyeOff, Package, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PriceEditPopover } from "@/app/admin/platform/businesses/components/services/price-edit-popover";
import { coursePublicHref } from "../../utils";
import type { BusinessService } from "../../apis/types";
import { needsApproval } from "./use-course-approval";
import { OriginChip } from "../origin-chip";

export type SortColumn = "name" | "category" | "degree_level" | "area_of_study" | "price" | "status";
export type SortState = { column: SortColumn | null; direction: "asc" | "desc" };

export type ColumnKey = "category" | "degree_level" | "area_of_study" | "price" | "status";

export const COLUMN_LABELS: Record<ColumnKey, string> = {
  category: "Category", degree_level: "Degree Level", area_of_study: "Subject Area",
  price: "Fee", status: "Status",
};

const SORTABLE: Partial<Record<ColumnKey, SortColumn>> = {
  category: "category", degree_level: "degree_level", area_of_study: "area_of_study",
  price: "price", status: "status",
};

export function ServiceManagementTable({
  services,
  visibleColumns,
  sort,
  onSortChange,
  selectedIds,
  onSelectedIdsChange,
  onEdit,
  onTogglePublish,
  onPriceSave,
  onDelete,
  onApprove,
  readOnly = false,
  isInstitution = false,
}: Readonly<{
  services: BusinessService[];
  visibleColumns: Set<ColumnKey>;
  sort: SortState;
  onSortChange: (column: SortColumn) => void;
  selectedIds: Set<string>;
  onSelectedIdsChange: (next: Set<string>) => void;
  onEdit: (id: string) => void;
  onTogglePublish: (id: string, next: boolean) => void;
  onPriceSave: (id: string, price: number) => Promise<void>;
  onDelete: (service: BusinessService) => void;
  /** Set only for someone allowed to approve (owner/admin) — adds Approve on unapproved rows. */
  onApprove?: (id: string) => void;
  /** Institutions' rows are extracted courses, not real business_services — no edit/publish/delete backing them. */
  readOnly?: boolean;
  /** Only courses have a public page — the service name
   *  opens it directly, independent of readOnly (an institution's rows are fully editable now,
   *  but still only ever courses with a real public URL to preview). */
  isInstitution?: boolean;
}>) {
  const allSelected = services.length > 0 && services.every((s) => selectedIds.has(s.id));
  const toggleAll = () => onSelectedIdsChange(allSelected ? new Set() : new Set(services.map((s) => s.id)));
  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedIdsChange(next);
  };

  const sortIcon = (col: ColumnKey) => {
    const sortCol = SORTABLE[col];
    if (!sortCol) return null;
    if (sort.column !== sortCol) return <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />;
    return sort.direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const headerButton = (col: ColumnKey, label: string) => {
    const sortCol = SORTABLE[col];
    if (!sortCol) return <span>{label}</span>;
    return (
      <button type="button" className="flex items-center gap-1 hover:text-foreground" onClick={() => onSortChange(sortCol)}>
        {label} {sortIcon(col)}
      </button>
    );
  };

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
            {!readOnly && <th className="w-10 p-3"><Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" /></th>}
            <th className="p-3 text-left">
              <button type="button" className="flex items-center gap-1 hover:text-foreground" onClick={() => onSortChange("name")}>
                Service Name
                {sort.column === "name" ? (sort.direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />}
              </button>
            </th>
            {[...visibleColumns].map((col) => (
              <th key={col} className="p-3 text-left whitespace-nowrap">{headerButton(col, COLUMN_LABELS[col])}</th>
            ))}
            {!readOnly && <th className="w-px p-3 text-right">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {services.map((s) => (
            <tr key={s.id} className="border-b last:border-0 hover:bg-muted/20">
              {!readOnly && <td className="p-3"><Checkbox checked={selectedIds.has(s.id)} onCheckedChange={() => toggleOne(s.id)} aria-label={`Select ${s.name}`} /></td>}
              <td className="max-w-80 p-3">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    {isInstitution ? <BookOpen className="h-4 w-4" /> : <Package className="h-4 w-4" />}
                  </div>
                  {isInstitution ? (
                    <button
                      type="button"
                      className="min-w-0 truncate text-left font-medium hover:underline"
                      title={s.name}
                      onClick={() => {
                        // Opens synchronously (inside the click gesture) so popup blockers don't
                        // catch it, then redirects it once the preview token comes back.
                        const tab = window.open("", "_blank");
                        coursePublicHref(s.name, s.id).then((href) => { if (tab) tab.location.href = href; });
                      }}
                    >
                      {s.name}
                    </button>
                  ) : (
                    <span className="min-w-0 truncate font-medium" title={s.name}>{s.name}</span>
                  )}
                  {s.origin && <OriginChip origin={s.origin} />}
                </div>
                {s.edited_by && (
                  <p className="mt-0.5 truncate pl-10 text-[11px] text-muted-foreground" title={s.edited_at ? new Date(s.edited_at).toLocaleString() : undefined}>
                    Edited by {s.edited_by}{s.edited_at ? ` · ${new Date(s.edited_at).toLocaleDateString()}` : ""}
                  </p>
                )}
              </td>
              {visibleColumns.has("category") && (
                <td className="p-3">
                  {s.category_name ? <Badge variant="secondary" className="text-[10px]">{s.category_name}</Badge> : <span className="text-muted-foreground">—</span>}
                </td>
              )}
              {visibleColumns.has("degree_level") && <td className="p-3 whitespace-nowrap">{s.degree_level ?? <span className="text-muted-foreground">—</span>}</td>}
              {visibleColumns.has("area_of_study") && <td className="p-3 whitespace-nowrap">{s.area_of_study ?? <span className="text-muted-foreground">—</span>}</td>}
              {visibleColumns.has("price") && (
                <td className="p-3 whitespace-nowrap">
                  {/* Institutions' price is whatever the Fees tab says (extraction_course_fees) —
                      there's no single editable price column to back this popover, so it would
                      silently do nothing (see institution-courses.repository.ts's getFeePricesForCourses). */}
                  {readOnly || isInstitution ? (
                    s.price ?? <span className="text-muted-foreground">—</span>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span>{s.price ?? <span className="text-muted-foreground">—</span>}</span>
                      <PriceEditPopover price={s.price} onSave={(next) => onPriceSave(s.id, next)} />
                    </div>
                  )}
                </td>
              )}
              {visibleColumns.has("status") && !readOnly && (
                <td className="p-3">
                  <StatusBadge s={s} />
                </td>
              )}
              {!readOnly && (
                <td className="p-3">
                  {/* Fixed slots, so every row's icons line up whether or not it still needs approval. */}
                  <div className="flex items-center justify-end gap-0.5 whitespace-nowrap">
                    {onApprove && (needsApproval(s) ? (
                      <Button size="icon-sm" variant="ghost" className="text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700" onClick={() => onApprove(s.id)} aria-label="Approve course" title="Approve course">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </Button>
                    ) : <span className="inline-block size-7" aria-hidden />)}
                    <Button size="icon-sm" variant="ghost" onClick={() => onEdit(s.id)} aria-label="Edit service" title="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      // Approve first — publishing an unapproved course is refused by the backend.
                      disabled={!s.is_published && needsApproval(s)}
                      title={!s.is_published && needsApproval(s) ? "Approve this course before publishing it" : undefined}
                      onClick={() => onTogglePublish(s.id, !s.is_published)}
                      aria-label={s.is_published ? "Unpublish service" : "Publish service"}
                    >
                      {s.is_published ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                    <Button size="icon-sm" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => onDelete(s)} aria-label="Delete service" title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Live only when approved AND published — an unapproved course never shows "Published". */
function StatusBadge({ s }: Readonly<{ s: BusinessService }>) {
  if (s.approval_status === "pending") {
    return (
      <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 text-[10px] text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
        title={s.is_published ? "Goes live as soon as it's approved." : "Waiting for approval."}>
        <span className="size-1.5 rounded-full bg-amber-500" /> Awaiting approval
      </Badge>
    );
  }
  if (s.approval_status === "needs_changes") {
    return (
      <Badge variant="outline" className="gap-1 border-red-200 bg-red-50 text-[10px] text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300" title="A problem was found with this course — check its details.">
        <span className="size-1.5 rounded-full bg-red-500" /> Needs changes
      </Badge>
    );
  }
  if (s.is_published) {
    return (
      <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
        <span className="size-1.5 rounded-full bg-emerald-500" /> Published
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground">
      <span className="size-1.5 rounded-full bg-muted-foreground/50" /> Draft
    </Badge>
  );
}
