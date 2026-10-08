"use client";

import { ArrowUp, CheckCircle2, BookOpen, Eye, EyeOff, Package, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PriceEditPopover } from "@/app/admin/platform/businesses/components/services/price-edit-popover";
import { coursePublicHref } from "../../utils";
import type { BusinessService } from "../../apis/types";
import { needsApproval } from "./use-course-approval";
import { OriginChip } from "../origin-chip";
import { cn } from "@/lib/utils";
import { ServiceStatusBadge } from "./service-status-badge";
import { DegreeBadge } from "./degree-badge";

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
  query = "",
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
  /** The current search — its match is highlighted in each name. */
  query?: string;
}>) {
  const allSelected = services.length > 0 && services.every((s) => selectedIds.has(s.id));
  const toggleAll = () => onSelectedIdsChange(allSelected ? new Set() : new Set(services.map((s) => s.id)));
  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedIdsChange(next);
  };

  // One arrow that turns over between asc and desc; faint while its column isn't the sort.
  const sortArrow = (col: SortColumn) => (
    <ArrowUp
      className={cn(
        "h-3 w-3 transition-[transform,opacity] duration-300 ease-[cubic-bezier(.34,1.56,.64,1)]",
        sort.column === col ? "opacity-100" : "opacity-35",
        sort.column === col && sort.direction === "desc" && "rotate-180",
      )}
    />
  );

  const headerButton = (col: SortColumn | undefined, label: string) => {
    if (!col) return <span>{label}</span>;
    return (
      <button
        type="button"
        className={cn("-mx-1 flex items-center gap-1 rounded-md px-1 py-0.5 transition-colors hover:bg-muted hover:text-foreground", sort.column === col && "text-foreground")}
        onClick={() => onSortChange(col)}
      >
        {label} {sortArrow(col)}
      </button>
    );
  };

  return (
    // Own scroll box, so the header can stick and a narrow screen scrolls the table, not the page.
    <div className="max-h-[640px] overflow-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10">
          <tr className="text-xs text-muted-foreground [&>th]:border-b [&>th]:bg-muted [&>th]:font-semibold">
            {!readOnly && <th className="w-10 p-3"><Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" /></th>}
            <th className="p-3 text-left">{headerButton("name", "Service Name")}</th>
            {[...visibleColumns].map((col) => (
              <th key={col} className="p-3 text-left whitespace-nowrap">{headerButton(SORTABLE[col], COLUMN_LABELS[col])}</th>
            ))}
            {!readOnly && <th className="w-px p-3 text-right">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {services.map((s, i) => {
            const selected = selectedIds.has(s.id);
            return (
            <tr
              key={s.id}
              // Mount-only animation: rows rise in when a page loads, not when a checkbox toggles.
              className={cn("group animate-row-rise border-b transition-colors last:border-0", selected ? "bg-primary/5" : "hover:bg-muted/40")}
              style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}
            >
              {!readOnly && (
                <td className={cn("p-3", selected && "shadow-[inset_3px_0_0_var(--color-primary)]")}>
                  <Checkbox checked={selected} onCheckedChange={() => toggleOne(s.id)} aria-label={`Select ${s.name}`} />
                </td>
              )}
              <td className="max-w-96 p-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  {isInstitution ? (
                    <DegreeBadge level={s.degree_level} fallback={<BookOpen className="h-4 w-4" />} />
                  ) : (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Package className="h-4 w-4" />
                    </div>
                  )}
                  <div className="min-w-0">
                  {isInstitution ? (
                    <button
                      type="button"
                      className={cn("block max-w-full truncate text-left font-semibold", UNDERLINE)}
                      title={s.name}
                      onClick={() => {
                        // Opens synchronously (inside the click gesture) so popup blockers don't
                        // catch it, then redirects it once the preview token comes back.
                        const tab = window.open("", "_blank");
                        coursePublicHref(s.name, s.id).then((href) => { if (tab) tab.location.href = href; });
                      }}
                    >
                      <Highlight text={s.name} query={query} />
                    </button>
                  ) : (
                    <span className="block truncate font-semibold" title={s.name}><Highlight text={s.name} query={query} /></span>
                  )}
                  {(s.origin || s.edited_by) && (
                    <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                      {s.origin && <OriginChip origin={s.origin} />}
                      {s.edited_by && (
                        <span className="truncate" title={s.edited_at ? new Date(s.edited_at).toLocaleString() : undefined}>
                          Edited by {s.edited_by}{s.edited_at ? ` · ${new Date(s.edited_at).toLocaleDateString()}` : ""}
                        </span>
                      )}
                    </p>
                  )}
                  </div>
                </div>
              </td>
              {visibleColumns.has("category") && (
                <td className="p-3">
                  {s.category_name ? <Badge variant="secondary" className="text-[10px]">{s.category_name}</Badge> : <span className="text-muted-foreground">—</span>}
                </td>
              )}
              {visibleColumns.has("degree_level") && <td className="p-3 whitespace-nowrap">{s.degree_level ?? <span className="text-muted-foreground">—</span>}</td>}
              {visibleColumns.has("area_of_study") && (
                <td className="max-w-64 truncate p-3 text-muted-foreground" title={s.area_of_study ?? undefined}>{s.area_of_study ?? "—"}</td>
              )}
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
                  <ServiceStatusBadge s={s} />
                </td>
              )}
              {!readOnly && (
                <td className="p-3">
                  {/* Fixed slots, so every row's icons line up whether or not it still needs approval. */}
                  <div className="flex items-center justify-end gap-0.5 whitespace-nowrap opacity-50 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [&_button]:active:scale-90">
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Underline that grows in from the left on hover. */
const UNDERLINE = "bg-[linear-gradient(currentColor,currentColor)] bg-[length:0%_1px] bg-[position:0_100%] bg-no-repeat transition-[background-size] duration-300 hover:bg-[length:100%_1px]";

/** Marks the searched substring; the server matches the same way (case-insensitive contains). */
function Highlight({ text, query }: Readonly<{ text: string; query: string }>) {
  const i = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-primary/20 px-px text-inherit">{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
  );
}
