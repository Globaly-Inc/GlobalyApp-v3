"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { allExtractionsApi } from "../apis";
import { latestTimestamp } from "../utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CourseDetailPanel } from "./course-detail-panel";
import { CourseForm } from "./course-form";
import { CourseListPanel } from "./course-list-panel";
import { StepActionBar } from "./step-action-bar";
import { useConfirmDelete } from "./use-confirm-delete";
import type { CampusFull, CourseFull, CourseLinks, CreateCourseParams, ExtractionJob } from "../apis/types";

const DEFAULT_PAGE_SIZE = 10;

export function CoursesTab({
  jobId,
  job,
  onReload,
  onJumpToContext,
}: Readonly<{
  jobId: string;
  job: ExtractionJob;
  onReload: () => void;
  onJumpToContext: () => void;
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
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const fetchedRef = useRef(false);

  // Accepts overrides so callers that also reset page/search/statusFilter (e.g. after a
  // delete) can force this fetch to use the new values immediately — setState is async,
  // so reading the state variables here right after calling their setters would still
  // see the pre-reset values from this render's closure.
  const load = useCallback(async (overrides?: { page?: number; limit?: number; search?: string; status?: string }) => {
    try {
      const [coursesRes, courseLinks, campusRows, queue] = await Promise.all([
        allExtractionsApi.getCourses(jobId, {
          page: overrides?.page ?? page,
          limit: overrides?.limit ?? limit,
          search: (overrides?.search ?? search).trim() || undefined,
          status: (overrides?.status ?? statusFilter) === "all" ? undefined : (overrides?.status ?? statusFilter),
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
    } catch (e) {
      toast.error("Failed to load courses", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [jobId, page, limit, search, statusFilter]);

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

  // Any filter change invalidates the current page.
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const handleCreate = async (values: CreateCourseParams) => {
    setSaving(true);
    try {
      const created = await allExtractionsApi.createCourse(jobId, values);
      toast.success("Course added");
      setAdding(false);
      await load();
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
    setPage(1);
    setLimit(DEFAULT_PAGE_SIZE);
    setSelectedIds([]);
    setSelectedId(null);
  };

  const deleteCourse = async (id: string) => {
    if (!(await confirm("Delete course?", "This will permanently delete the course and its linked fees, intakes, and other data."))) return;
    setSaving(true);
    try {
      await allExtractionsApi.deleteCourse(id);
      toast.success("Course deleted");
      resetListState();
      await load({ page: 1, limit: DEFAULT_PAGE_SIZE, search: "", status: "all" });
      onReload();
    } catch (e) {
      toast.error("Delete failed", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const bulkDelete = async () => {
    const many = selectedIds.length > 1;
    if (!(await confirm(many ? `Delete ${selectedIds.length} courses?` : "Delete course?", "This will permanently delete the selected courses and their linked fees, intakes, and other data."))) return;
    setSaving(true);
    try {
      const { queued } = await allExtractionsApi.bulkDeleteCourses(selectedIds);
      toast.success(`${queued} course${many ? "s" : ""} queued for deletion`);
      // Fire-and-forget — a background worker does the actual deletes. Remove the rows
      // optimistically first (the server hasn't caught up yet), then reset every other
      // list control back to defaults and force a reload with those defaults explicitly
      // (resetListState's setState calls haven't committed yet, so `load()` alone would
      // still read the pre-reset page/search/status from this render's closure).
      const deletedIds = new Set(selectedIds);
      setCourses((prev) => prev.filter((c) => !deletedIds.has(c.id)));
      setTotal((prev) => Math.max(0, prev - deletedIds.size));
      resetListState();
      await load({ page: 1, limit: DEFAULT_PAGE_SIZE, search: "", status: "all" });
      onReload();
    } catch (e) {
      toast.error("Delete failed", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const bulkVerify = async (approve: boolean) => {
    setSaving(true);
    try {
      await allExtractionsApi.bulkVerifyCourses(selectedIds, approve);
      toast.success(`${selectedIds.length} course${selectedIds.length === 1 ? "" : "s"} ${approve ? "approved" : "flagged"}`);
      setSelectedIds([]);
      await load();
      onReload();
    } catch (e) {
      toast.error("Action failed", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

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
        guidedUrls={job.guided_urls}
        contextKey="course_list_urls"
        contextLabel="course list URLs"
        onChanged={onReload}
        onAddContext={onJumpToContext}
      />

      {!loading && queuedCourseUrls === 0 && (
        <Card className="mb-3">
          <CardContent className="py-3 text-center text-sm text-muted-foreground">
            No course URLs queued yet. Run <span className="font-medium text-foreground">Course Discovery</span> from the
            action bar above to populate the queue.
          </CardContent>
        </Card>
      )}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl p-0 border-0 bg-transparent shadow-none">
          <CourseForm saving={saving} onCancel={() => setAdding(false)} onSave={handleCreate} />
        </DialogContent>
      </Dialog>

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
              // onReload too — the header's "Courses Verified" card reads the job-level course list.
              onChanged={() => { load(); onReload(); }}
            />
          )}
        </div>
      )}

      {confirmDialog}
    </div>
  );
}
