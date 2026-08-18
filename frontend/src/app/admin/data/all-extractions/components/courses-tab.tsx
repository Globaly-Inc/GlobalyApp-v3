"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, CheckCircle2, ExternalLink, Flag, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { allExtractionsApi } from "../apis";
import { VERIFICATION_DOT } from "../const";
import { latestTimestamp } from "../utils";
import { CourseDetailPanel } from "./course-detail-panel";
import { CourseForm } from "./course-form";
import { StepActionBar } from "./step-action-bar";
import type { CampusFull, CourseFull, CourseLinks, CreateCourseParams, ExtractionJob } from "../apis/types";

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
  const [links, setLinks] = useState<CourseLinks | null>(null);
  const [campuses, setCampuses] = useState<CampusFull[]>([]);
  const [queuedCourseUrls, setQueuedCourseUrls] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const fetchedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const [courseRows, courseLinks, campusRows, queue] = await Promise.all([
        allExtractionsApi.getCourses(jobId),
        allExtractionsApi.getCourseLinks(jobId),
        allExtractionsApi.getCampuses(jobId),
        allExtractionsApi.getQueue(jobId),
      ]);
      setCourses(courseRows);
      setLinks(courseLinks);
      setCampuses(campusRows);
      setQueuedCourseUrls(queue.filter((q) => q.kind === "course").length);
    } catch (e) {
      toast.error("Failed to load courses", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    load();
  }, [load]);

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

  const query = search.trim().toLowerCase();
  const visible = query ? courses.filter((c) => c.name.toLowerCase().includes(query)) : courses;
  const selected = courses.find((c) => c.id === selectedId) ?? null;
  const allSelected = visible.length > 0 && selectedIds.length === visible.length;

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
        hasData={courses.length > 0}
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
          {/* Course list */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search courses…"
                  className="h-9 pl-7 text-xs"
                />
              </div>
              <Button className="h-9 gap-1.5 cursor-pointer" disabled={adding} onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4" />
                Add Course
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={() => setSelectedIds(allSelected ? [] : visible.map((c) => c.id))}
                  disabled={visible.length === 0}
                />
                {courses.length} course{courses.length === 1 ? "" : "s"}
                {query && ` · ${visible.length} matching`}
              </label>

              {selectedIds.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-xs cursor-pointer"
                    disabled={saving}
                    onClick={() => bulkVerify(true)}
                  >
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                    Approve {selectedIds.length}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-xs text-destructive cursor-pointer"
                    disabled={saving}
                    onClick={() => bulkVerify(false)}
                  >
                    <Flag className="h-3 w-3" />
                    Flag {selectedIds.length}
                  </Button>
                </div>
              )}
            </div>

            <div className={cn("space-y-2 overflow-y-auto pr-1", selected ? "max-h-[70vh]" : "max-h-[calc(100vh-22rem)]")}>
              {visible.map((course) => (
                <div
                  key={course.id}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:bg-accent",
                    selectedId === course.id && "border-primary ring-1 ring-primary",
                  )}
                >
                  <Checkbox
                    checked={selectedIds.includes(course.id)}
                    onCheckedChange={() =>
                      setSelectedIds((ids) => (ids.includes(course.id) ? ids.filter((i) => i !== course.id) : [...ids, course.id]))
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedId(course.id)}
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
              {visible.length === 0 && (
                <Card className="border-dashed">
                  <CardContent className="py-10 text-center text-muted-foreground">
                    <BookOpen className="mx-auto mb-3 h-7 w-7 opacity-40" />
                    <p className="text-sm">{query ? "No courses match your search" : "No courses yet"}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

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
