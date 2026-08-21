"use client";

import { BookOpen, CheckCircle2, ExternalLink, Flag, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { VERIFICATION_DOT } from "../const";
import type { CourseFull } from "../apis/types";

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
  compact: boolean;
}>) {
  const filtering = search.trim() !== "" || statusFilter !== "all";
  const allSelected = courses?.length > 0 && selectedIds?.length === courses?.length;
  const overallTotal = statusCounts.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search courses…"
            className="h-9 pl-7 text-xs"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => onStatusFilterChange(v ?? "all")}>
          <SelectTrigger className="h-9 w-[160px] text-xs cursor-pointer">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses ({overallTotal})</SelectItem>
            {[...statusCounts].sort((a, b) => a.status.localeCompare(b.status)).map(({ status, count }) => (
              <SelectItem key={status} value={status}>
                <span className="flex items-center gap-2">
                  <span className={cn("h-1.5 w-1.5 rounded-full", VERIFICATION_DOT[status] ?? "bg-muted-foreground/30")} />
                  <span className="capitalize">{status}</span> ({count})
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button className="h-9 gap-1.5 cursor-pointer" disabled={adding} onClick={onAdd}>
          <Plus className="h-4 w-4" />
          Add Course
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <Checkbox checked={allSelected} onCheckedChange={onToggleSelectAll} disabled={courses?.length === 0} />
          {total} course{total === 1 ? "" : "s"}
          {filtering && ` · ${courses.length} on this page`}
        </label>

        {selectedIds.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs cursor-pointer"
              disabled={saving}
              onClick={() => onBulkVerify(true)}
            >
              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
              Approve {selectedIds.length}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs text-destructive cursor-pointer"
              disabled={saving}
              onClick={() => onBulkVerify(false)}
            >
              <Flag className="h-3 w-3" />
              Flag {selectedIds.length}
            </Button>
          </div>
        )}
      </div>

      <div className={cn("space-y-2 overflow-y-auto pr-1", compact ? "max-h-[70vh]" : "max-h-[calc(100vh-22rem)]")}>
        {courses?.map((course) => (
          <div
            key={course.id}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:bg-accent",
              selectedId === course.id && "border-primary ring-1 ring-primary",
            )}
          >
            <Checkbox checked={selectedIds.includes(course.id)} onCheckedChange={() => onToggleSelect(course.id)} />
            <button
              type="button"
              onClick={() => onSelect(course.id)}
              className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left text-sm cursor-pointer"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  title={course.verification_status ?? "unverified"}
                  className={cn("h-1.5 w-1.5 shrink-0 rounded-full", VERIFICATION_DOT[course.verification_status ?? "unverified"] ?? "bg-muted-foreground/30")}
                />
                <span className="truncate">{course.name}</span>
              </span>
              {course.source_url && <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            </button>
          </div>
        ))}
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
