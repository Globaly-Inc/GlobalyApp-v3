"use client";

import { BookOpen, CheckCircle2, ExternalLink, Flag, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/combobox";
import { Input } from "@/components/ui/input";
import { LookupCombobox } from "@/components/lookup-combobox";
import { Pagination } from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import { SORT_OPTIONS, STUDY_MODE_OPTIONS, type SortOrder } from "../const";
import type { CourseFilters, CourseFull } from "../apis/types";

// Extractors write "on_campus", "on-campus" and "On Campus" alike — match on the normalised form.
const studyModeLabel = (mode: string) => {
  const key = mode.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return STUDY_MODE_OPTIONS.find((o) => o.value === key)?.label
    ?? mode.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

/** Mirrors the backend's APPROVED_COURSE_STATUSES: only these reach public pages and the AI. */
const APPROVED = ["confirmed", "manual"];

// "" = filter off. Same choices as the institution portal's Services tab filters.
const ALL = "";
const PUBLISHED_OPTIONS = [
  { value: ALL, label: "Published & draft" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
];
/** Active filters get a tinted border so it's obvious which ones narrow the list. */
const filterClass = (active: boolean, width: string) =>
  cn("h-9 text-xs", width, active && "border-primary bg-primary/5 text-primary");
const ORIGIN_OPTIONS = [
  { value: ALL, label: "All sources" },
  { value: "extracted", label: "Extracted" },
  { value: "manual", label: "Manually added" },
];

function ApprovalBadge({ status }: Readonly<{ status: string | null }>) {
  const s = status ?? "unverified";
  if (APPROVED.includes(s)) {
    return <span className="rounded bg-success/10 px-1.5 py-0.5 text-xs font-medium text-success">Approved</span>;
  }
  if (s === "flagged") {
    return <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive">Flagged</span>;
  }
  return <span className="rounded bg-warning/10 px-1.5 py-0.5 text-xs font-medium text-warning">Awaiting approval</span>;
}

export function CourseListPanel({
  courses,
  total,
  page,
  limit,
  onLimitChange,
  statusCounts,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  filters,
  onFiltersChange,
  sort,
  onSortChange,
  onPageChange,
  selectedId,
  onSelect,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  adding,
  onAdd,
  saving,
  onBulkVerify,
  onApproveAll,
  onBulkUpdate,
  onDelete,
  onBulkDelete,
  compact,
}: Readonly<{
  courses: CourseFull[];
  total: number;
  page: number;
  limit: number;
  onLimitChange: (limit: number) => void;
  statusCounts: { status: string; count: number }[];
  search: string;
  onSearchChange: (v: string) => void;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  filters: CourseFilters;
  onFiltersChange: (v: CourseFilters) => void;
  sort: SortOrder;
  onSortChange: (v: SortOrder) => void;
  onPageChange: (page: number) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  adding: boolean;
  onAdd: () => void;
  saving: boolean;
  onBulkVerify: (approve: boolean) => void;
  /** Whole job, every page — the checkboxes only ever select the page on screen. */
  onApproveAll: (count: number) => void;
  onBulkUpdate: () => void;
  onDelete: (id: string) => void;
  onBulkDelete: () => void;
  compact: boolean;
}>) {
  const filtering = search.trim() !== "" || statusFilter !== "all" || Object.values(filters).some(Boolean);
  const setFilter = <K extends keyof CourseFilters>(key: K, v: string) =>
    onFiltersChange({ ...filters, [key]: v === ALL ? undefined : (v as CourseFilters[K]) });
  const allSelected = courses?.length > 0 && selectedIds?.length === courses?.length;
  const overallTotal = statusCounts.reduce((sum, s) => sum + s.count, 0);
  // What "Approve all" will actually touch — mirrors the backend: approved, flagged and mismatch stay put.
  const awaitingApproval = statusCounts
    .filter((s) => !["confirmed", "manual", "flagged", "mismatch"].includes(s.status))
    .reduce((sum, s) => sum + s.count, 0);

  const statusOptions = [
    { value: "all", label: `All statuses (${overallTotal})` },
    ...[...statusCounts].sort((a, b) => a.status.localeCompare(b.status)).map(({ status, count }) => ({
      value: status,
      label: `${status.charAt(0).toUpperCase()}${status.slice(1)} (${count})`,
    })),
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className={cn("relative", compact ? "min-w-0 flex-1" : "min-w-[220px] flex-1")}>
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search courses…"
            className="h-9 pl-8 text-xs"
          />
        </div>
        {compact && (
          <Button className="h-9 w-9 shrink-0 cursor-pointer p-0" disabled={adding} onClick={onAdd} title="Add Course">
            <Plus className="h-4 w-4" />
          </Button>
        )}
        {/* Fixed widths side by side; in the narrow sidebar each takes half a row. */}
        <div className={cn("flex flex-wrap items-center gap-2", compact && "w-full [&>*]:min-w-0 [&>*]:flex-[1_1_45%]")}>
          <Combobox options={statusOptions} value={statusFilter} onChange={(v) => onStatusFilterChange(v || "all")} className={filterClass(statusFilter !== "all", "w-[170px]")} />
          <LookupCombobox
            kind="degree-levels"
            by="slug"
            value={filters.degree_level ?? ALL}
            onChange={(v) => setFilter("degree_level", v)}
            pinnedOptions={[{ value: ALL, label: "All degree levels" }]}
            placeholder="Degree level"
            className={filterClass(!!filters.degree_level, "w-[170px]")}
          />
          <Combobox options={PUBLISHED_OPTIONS} value={filters.published ?? ALL} onChange={(v) => setFilter("published", v)} className={filterClass(!!filters.published, "w-[150px]")} />
          <Combobox options={ORIGIN_OPTIONS} value={filters.origin ?? ALL} onChange={(v) => setFilter("origin", v)} className={filterClass(!!filters.origin, "w-[150px]")} />
          <Combobox options={SORT_OPTIONS} value={sort} onChange={(v) => onSortChange(v as SortOrder)} className={filterClass(false, "w-[140px]")} />
        </div>
        {!compact && (
          <Button className="h-9 shrink-0 cursor-pointer gap-1.5" disabled={adding} onClick={onAdd}>
            <Plus className="h-4 w-4" />
            Add Course
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border-b bg-primary/5 px-3 py-2">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <Checkbox checked={allSelected} onCheckedChange={onToggleSelectAll} disabled={courses?.length === 0} />
          {selectedIds.length > 0 ? `${selectedIds.length} selected on this page` : `Select page · ${total} course${total === 1 ? "" : "s"}`}
        </label>

        {awaitingApproval > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto h-7 gap-1.5 text-xs cursor-pointer"
            disabled={saving}
            onClick={() => onApproveAll(awaitingApproval)}
            title="Approve every course in this extraction, on all pages"
          >
            <CheckCircle2 className="h-3 w-3 text-success" />
            {compact ? `All ${awaitingApproval}` : `Approve all ${awaitingApproval}`}
          </Button>
        )}

        {selectedIds.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size={compact ? "icon-sm" : "sm"}
              className={cn("cursor-pointer", compact ? "h-7 w-7" : "h-7 gap-1.5 text-xs")}
              disabled={saving}
              onClick={onBulkUpdate}
              title={`Update ${selectedIds.length}`}
            >
              <Pencil className="h-3 w-3" />
              {!compact && `Update ${selectedIds.length}`}
            </Button>
            <Button
              variant="outline"
              size={compact ? "icon-sm" : "sm"}
              className={cn("cursor-pointer", compact ? "h-7 w-7" : "h-7 gap-1.5 text-xs")}
              disabled={saving}
              onClick={() => onBulkVerify(true)}
              title={`Approve ${selectedIds.length}`}
            >
              <CheckCircle2 className="h-3 w-3 text-success" />
              {!compact && `Approve ${selectedIds.length}`}
            </Button>
            <Button
              variant="outline"
              size={compact ? "icon-sm" : "sm"}
              className={cn("cursor-pointer text-destructive", compact ? "h-7 w-7" : "h-7 gap-1.5 text-xs")}
              disabled={saving}
              onClick={() => onBulkVerify(false)}
              title={`Flag ${selectedIds.length}`}
            >
              <Flag className="h-3 w-3" />
              {!compact && `Flag ${selectedIds.length}`}
            </Button>
            <Button
              variant="outline"
              size={compact ? "icon-sm" : "sm"}
              className={cn("cursor-pointer text-destructive", compact ? "h-7 w-7" : "h-7 gap-1.5 text-xs")}
              disabled={saving}
              onClick={onBulkDelete}
              title={`Delete ${selectedIds.length}`}
            >
              <Trash2 className="h-3 w-3" />
              {!compact && `Delete ${selectedIds.length}`}
            </Button>
          </div>
        )}
      </div>

      <div className={cn("space-y-2 overflow-x-hidden overflow-y-auto px-1.5 py-1", compact ? "max-h-[70vh]" : "max-h-[calc(100vh-22rem)]")}>
        {courses?.map((course) => {
          const selected = selectedId === course.id;
          return (
            <div
              key={course.id}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-3 transition-[translate,box-shadow,border-color] duration-300 ease-out hover:-translate-y-0.5 hover:border-primary hover:shadow-md",
                selected ? "border-primary bg-primary/5" : "border-border",
              )}
            >
              <Checkbox checked={selectedIds.includes(course.id)} onCheckedChange={() => onToggleSelect(course.id)} />
              <button
                type="button"
                onClick={() => onSelect(course.id)}
                className="flex min-w-0 flex-1 flex-col gap-1 text-left cursor-pointer"
              >
                <span className={cn("truncate text-sm font-semibold", selected ? "text-primary" : "text-foreground")}>
                  {course.name}
                </span>
                {/* Degree + mode under the name, like the institution's own course listing —
                    tells "Aerospace Engineering BEng" from "…BEng(Hons)" at a glance. */}
                {(course.degree_level || course.study_mode) && (
                  <span className="flex items-center gap-2 text-xs">
                    {course.degree_level && (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">{course.degree_level}</span>
                    )}
                    {course.study_mode && <span className="text-muted-foreground">{studyModeLabel(course.study_mode)}</span>}
                  </span>
                )}
              </button>
              <ApprovalBadge status={course.verification_status ?? null} />
              {course.source_url && (
                <a
                  href={course.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded p-1 text-muted-foreground"
                  title="Open source page"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              {/* Plain button, not <Button>: the design-system one carries hover + transition styles. */}
              <button
                type="button"
                className="shrink-0 cursor-pointer rounded p-1 text-muted-foreground"
                title="Delete course"
                onClick={() => onDelete(course.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
        {courses?.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-muted-foreground">
              <BookOpen className="mx-auto mb-3 h-7 w-7 opacity-40" />
              <p className="text-sm">{filtering ? "No courses match your filters" : "No courses yet"}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {total > 0 && (
        <Pagination page={page} total={total} limit={limit} onPageChange={onPageChange} align="end" onPageSizeChange={onLimitChange} />
      )}
    </div>
  );
}
