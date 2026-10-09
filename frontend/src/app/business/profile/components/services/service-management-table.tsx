"use client";

import { ArrowUp, CheckCircle2, BookOpen, Eye, EyeOff, Package, Pencil, Trash2 } from "lucide-react";
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
import { ACTIONS, STICKY_TD, STICKY_TH, TABLE, TABLE_WRAP, TD, TH, TR, rowDelay } from "../portal-ui/portal-ui";

export type SortColumn = "name" | "category" | "degree_level" | "area_of_study" | "price" | "status";
export type SortState = { column: SortColumn | null; direction: "asc" | "desc" };

export type ColumnKey = "category" | "degree_level" | "area_of_study" | "price" | "status";

export const COLUMN_LABELS: Record<ColumnKey, string> = {
  category: "Category", degree_level: "Degree level", area_of_study: "Subject area",
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
        className={cn("-mx-1 -my-0.5 inline-flex items-center gap-[5px] rounded-md px-1 py-0.5 transition-colors hover:bg-background hover:text-foreground", sort.column === col && "text-foreground")}
        onClick={() => onSortChange(col)}
      >
        {label} {sortArrow(col)}
      </button>
    );
  };

  return (
    // Own scroll box, so the header can stick and a narrow screen scrolls the table, not the page.
    <div className={TABLE_WRAP}>
      {/* Every column needs room to read; the sticky Actions column stays in view while it scrolls. */}
      <table className={cn(TABLE, visibleColumns.size > 3 && "min-w-[1180px]")}>
        <thead>
          <tr>
            {!readOnly && <th className={cn(TH, "w-11")}><Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" /></th>}
            <th className={TH}>{headerButton("name", "Service name")}</th>
            {[...visibleColumns].map((col) => (
              <th key={col} className={TH}>{headerButton(SORTABLE[col], COLUMN_LABELS[col])}</th>
            ))}
            {!readOnly && <th className={cn(TH, STICKY_TH)}>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {services.map((s, i) => {
            const selected = selectedIds.has(s.id);
            // Opaque tint (not /alpha) — the sticky Actions cell must hide the cells scrolling under it.
            const td = cn(TD, selected && "bg-[color-mix(in_srgb,var(--color-primary)_7%,var(--color-card))] group-hover/row:bg-[color-mix(in_srgb,var(--color-primary)_7%,var(--color-card))]");
            return (
            // Mount-only animation: rows rise in when a page loads, not when a checkbox toggles.
            <tr key={s.id} className={TR} style={rowDelay(i)}>
              {!readOnly && (
                <td className={cn(td, selected && "shadow-[inset_3px_0_0_var(--color-primary)]")}>
                  <Checkbox checked={selected} onCheckedChange={() => toggleOne(s.id)} aria-label={`Select ${s.name}`} />
                </td>
              )}
              <td className={td}>
                <div className="flex min-w-60 max-w-100 items-center gap-2.5">
                  <DegreeBadge level={s.degree_level} fallback={isInstitution ? <BookOpen className="h-3.5 w-3.5" /> : <Package className="h-3.5 w-3.5" />} />
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
                    <p className="mt-[3px] flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[11.5px] text-muted-foreground">
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
                <td className={td}>
                  {s.category_name
                    ? <span className="whitespace-nowrap rounded-full bg-primary/10 px-[9px] py-[3px] text-[11px] font-semibold text-primary">{s.category_name}</span>
                    : <span className="text-muted-foreground">—</span>}
                </td>
              )}
              {visibleColumns.has("degree_level") && <td className={cn(td, "whitespace-nowrap")}>{s.degree_level ?? <span className="text-muted-foreground">—</span>}</td>}
              {visibleColumns.has("area_of_study") && (
                <td className={td}>
                  {s.area_of_study
                    ? <span className="block max-w-[260px] truncate" title={s.area_of_study}>{s.area_of_study}</span>
                    : <span className="text-muted-foreground">—</span>}
                </td>
              )}
              {visibleColumns.has("price") && (
                <td className={cn(td, "whitespace-nowrap")}>
                  {/* Institutions' price is whatever the Fees tab says (extraction_course_fees) —
                      there's no single editable price column to back this popover, so it would
                      silently do nothing (see institution-courses.repository.ts's getFeePricesForCourses). */}
                  {readOnly || isInstitution ? (
                    <FeeSummary price={s.price} />
                  ) : (
                    <div className="flex items-center gap-1">
                      <FeeSummary price={s.price} />
                      <PriceEditPopover price={s.price} onSave={(next) => onPriceSave(s.id, next)} />
                    </div>
                  )}
                </td>
              )}
              {visibleColumns.has("status") && !readOnly && (
                <td className={td}>
                  <ServiceStatusBadge s={s} />
                </td>
              )}
              {!readOnly && (
                // Sticky so Edit/Publish/Delete stay reachable when long fees push the table wide.
                <td className={cn(td, STICKY_TD)}>
                  {/* Fixed slots, so every row's icons line up whether or not it still needs approval. */}
                  <div className={ACTIONS}>
                    {onApprove && (needsApproval(s) ? (
                      <Button size="icon-sm" variant="ghost" className={cn(ICON, "text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/40")} onClick={() => onApprove(s.id)} aria-label="Approve course" title="Approve course">
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                    ) : <span className="inline-block size-[30px]" aria-hidden />)}
                    <Button size="icon-sm" variant="ghost" className={ICON} onClick={() => onEdit(s.id)} aria-label="Edit service" title="Edit"><Pencil className="h-4 w-4" /></Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className={cn(ICON, "disabled:opacity-35")}
                      // Approve first — publishing an unapproved course is refused by the backend.
                      disabled={!s.is_published && needsApproval(s)}
                      title={!s.is_published && needsApproval(s) ? "Approve this course before publishing it" : undefined}
                      onClick={() => onTogglePublish(s.id, !s.is_published)}
                      aria-label={s.is_published ? "Unpublish service" : "Publish service"}
                    >
                      {s.is_published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button size="icon-sm" variant="ghost" className={cn(ICON, "hover:bg-destructive/10 hover:text-destructive")} onClick={() => onDelete(s)} aria-label="Delete service" title="Delete">
                      <Trash2 className="h-4 w-4" />
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

/** Row icon button from the mockup: 30px, muted until hovered. */
const ICON = "size-[30px] rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground";

/** An institution's price joins every fee ("USD 33,360 (Per Semester) · USD 75 (Total) · …"),
 * which pushed the table wide. Show the first amount and a "+N" chip; the full list is the tooltip. */
function FeeSummary({ price }: Readonly<{ price: string | null }>) {
  if (!price) return <span className="text-muted-foreground">—</span>;
  const [first, ...rest] = price.split(" · ");
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums" title={[first, ...rest].join("\n")}>
      {first}
      {rest.length > 0 && (
        <span className="rounded-full bg-muted px-1.5 py-px font-mono text-[10px] font-semibold text-muted-foreground">+{rest.length}</span>
      )}
    </span>
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
