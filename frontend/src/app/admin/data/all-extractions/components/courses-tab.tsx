"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { allExtractionsApi } from "../apis";
import { latestTimestamp } from "../utils";
import { createCourseActions, DEFAULT_PAGE_SIZE } from "./courses-tab-actions";
import { CourseDetailPanel } from "./course-detail-panel";
import { CourseFormDialogs } from "./course-form-dialogs";
import { CourseListPanel } from "./course-list-panel";
import { StepActionBar } from "./step-action-bar";
import { useConfirmDelete } from "./use-confirm-delete";
import type { SortOrder } from "../const";
import type { CampusFull, CourseFull, CourseLinks, CreateCourseParams, ExtractionJob } from "../apis/types";

export function CoursesTab({
  jobId,
  job,
  onReload,
}: Readonly<{
  jobId: string;
  job: ExtractionJob;
  onReload: () => void;
}>) {
  const [courses, setCourses] = useState<CourseFull[]>([]);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<{ status: string; count: number }[]>([]);
  const [links, setLinks] = useState<CourseLinks | null>(null);
  const [campuses, setCampuses] = useState<CampusFull[]>([]);
  const [queuedCourseUrls, setQueuedCourseUrls] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState<SortOrder>("name_asc");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [adding, setAdding] = useState(false);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const fetchedRef = useRef(false);

  const load = useCallback(async (overrides?: { page?: number; limit?: number; search?: string; status?: string; sort?: SortOrder }): Promise<boolean> => {
    try {
      const [coursesRes, courseLinks, campusRows, queue] = await Promise.all([
        allExtractionsApi.getCourses(jobId, {
          page: overrides?.page ?? page,
          limit: overrides?.limit ?? limit,
          search: (overrides?.search ?? search).trim() || undefined,
          status: (overrides?.status ?? statusFilter) === "all" ? undefined : (overrides?.status ?? statusFilter),
          sort: overrides?.sort ?? sort,
        }),
        allExtractionsApi.getCourseLinks(jobId),
        allExtractionsApi.getCampuses(jobId),
        allExtractionsApi.getQueue(jobId),
      ]);
      setCourses(coursesRes.data);
      setTotal(coursesRes.meta?.total ?? 0);
      setStatusCounts(coursesRes.statusCounts ?? []);
      setLinks(courseLinks);
      setCampuses(campusRows);
      setQueuedCourseUrls(queue.filter((q) => q.kind === "course").length);
      return true;
    } catch (e) {
      toast.error("Failed to load courses", { description: (e as Error).message });
      return false;
    } finally {
      setLoading(false);
    }
  }, [jobId, page, limit, search, statusFilter, sort]);

  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      load();
      return;
    }
    // Debounce so typing in the search box doesn't fire a request per keystroke.
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  // Any filter/sort change invalidates the current page.
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, sort]);

  const handleCreate = async (values: CreateCourseParams) => {
    setSaving(true);
    try {
      const created = await allExtractionsApi.createCourse(jobId, values);
      toast.success("Course added");
      setAdding(false);
      await load();
      onReload(); // other tabs' course-linking pickers read the job-level course list too
      setSelectedId(created.id);
    } catch (e) {
      toast.error("Failed to add course", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const selected = courses?.find((c) => c.id === selectedId) ?? null;
  const { confirm, dialog: confirmDialog } = useConfirmDelete();

  // Clears every list-level UI control back to defaults — used after a delete so the
  // view doesn't sit on a stale filter/page/selection pointing at rows that are gone.
  const resetListState = () => {
    setSearch("");
    setStatusFilter("all");
    setSort("name_asc");
    setPage(1);
    setLimit(DEFAULT_PAGE_SIZE);
    setSelectedIds([]);
    setSelectedId(null);
  };

  const { deleteCourse, bulkDelete, bulkUpdate, approveAll, bulkVerify } = createCourseActions({
    jobId, links, selectedIds, confirm, load, onReload, resetListState,
    setSaving, setCourses, setTotal, setSelectedIds, setBulkUpdating,
  });

  return (
    <div>
      <StepActionBar
        jobId={jobId}
        step="discovery"
        label="Course Discovery"
        runLabel="Run Course Discovery"
        progress={(job.pipeline_progress as Record<string, unknown> | null)?.discovery}
        lastUpdated={latestTimestamp(courses)}
        hasData={total > 0}
        onChanged={onReload}
      />

      {!loading && queuedCourseUrls === 0 && (
        <Card className="mb-3">
          <CardContent className="py-3 text-center text-sm text-muted-foreground">
            No course URLs queued yet. Run <span className="font-medium text-foreground">Course Discovery</span> from the
            action bar above to populate the queue.
          </CardContent>
        </Card>
      )}

      <CourseFormDialogs
        jobId={jobId}
        adding={adding}
        onAddingChange={setAdding}
        onCreate={handleCreate}
        bulkUpdating={bulkUpdating}
        onBulkUpdatingChange={setBulkUpdating}
        bulkCount={selectedIds.length}
        onBulkUpdate={bulkUpdate}
        saving={saving}
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        // Full-width list until a course is picked; then it collapses to a sidebar next to the form.
        <div className={cn("gap-4", selected ? "grid md:grid-cols-[300px_1fr]" : "block")}>
          <CourseListPanel
            courses={courses}
            total={total}
            page={page}
            limit={limit}
            onLimitChange={(next) => { setLimit(next); setPage(1); }}
            statusCounts={statusCounts}
            search={search}
            onSearchChange={setSearch}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            sort={sort}
            onSortChange={setSort}
            onPageChange={setPage}
            selectedId={selectedId}
            onSelect={setSelectedId}
            selectedIds={selectedIds}
            onToggleSelect={(id) => setSelectedIds((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]))}
            onToggleSelectAll={() => setSelectedIds((ids) => (ids.length === courses.length ? [] : courses.map((c) => c.id)))}
            adding={adding}
            onAdd={() => setAdding(true)}
            saving={saving}
            onBulkVerify={bulkVerify}
            onApproveAll={approveAll}
            onBulkUpdate={() => setBulkUpdating(true)}
            onDelete={deleteCourse}
            onBulkDelete={bulkDelete}
            compact={!!selected}
          />

          {/* Detail — only once a course is selected */}
          {selected && links && (
            <CourseDetailPanel
              key={selected.id}
              course={selected}
              links={links}
              campuses={campuses}
              jobId={jobId}
              onClose={() => setSelectedId(null)}
              onChanged={async () => {
                const ok = await load();
                onReload();
                if (!ok) throw new Error("The list failed to refresh — reopen the panel to see the update.");
              }}
            />
          )}
        </div>
      )}

      {confirmDialog}
    </div>
  );
}
