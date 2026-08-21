"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { allExtractionsApi } from "../apis";
import { latestTimestamp } from "../utils";
import { CourseDetailPanel } from "./course-detail-panel";
import { CourseForm } from "./course-form";
import { CourseListPanel } from "./course-list-panel";
import { StepActionBar } from "./step-action-bar";
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

  const load = useCallback(async () => {
    try {
      const [coursesRes, courseLinks, campusRows, queue] = await Promise.all([
        allExtractionsApi.getCourses(jobId, {
          page,
          limit,
          search: search.trim() || undefined,
          status: statusFilter === "all" ? undefined : statusFilter,
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

      {adding && (
        <div className="mb-3">
          <CourseForm saving={saving} onCancel={() => setAdding(false)} onSave={handleCreate} />
        </div>
      )}

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

    </div>
  );
}
