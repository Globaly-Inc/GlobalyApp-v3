"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Award, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { allExtractionsApi } from "../apis";
import { saveFormAndLearn, useFieldSaver } from "./editable-field";
import { latestTimestamp } from "../utils";
import { ScholarshipForm } from "./scholarship-form";
import { StepActionBar } from "./step-action-bar";
import { useConfirmDelete } from "./use-confirm-delete";
import type { CourseLinks, ExtractionJob, Scholarship, ScholarshipParams } from "../apis/types";
import { ScholarshipCard, type LinkedCourse } from "./scholarships-tab-card";

const DEFAULT_PAGE_SIZE = 10;

export function ScholarshipsTab({ jobId, job, onReload }: Readonly<{ jobId: string; job: ExtractionJob; onReload: () => void }>) {
  const [links, setLinks] = useState<CourseLinks | null>(null);
  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const fetchedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const [res, courseLinks] = await Promise.all([
        allExtractionsApi.getScholarships(jobId, { page, limit, search: search.trim() || undefined }),
        allExtractionsApi.getCourseLinks(jobId),
      ]);
      setScholarships(res.data);
      setTotal(res.meta?.total ?? 0);
      setLinks(courseLinks);
    } catch (e) {
      toast.error("Failed to load scholarships", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [jobId, page, limit, search]);

  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      load();
      return;
    }
    const t = setTimeout(load, 300); // debounce the search box
    return () => clearTimeout(t);
  }, [load]);

  const allSelected = scholarships.length > 0 && selectedIds.length === scholarships.length;
  const { confirm, dialog } = useConfirmDelete();
  const saveField = useFieldSaver(jobId, load);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setSaving(true);
    try {
      await action();
      toast.success(success);
      await load();
    } catch (e) {
      toast.error("Action failed", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const coursesFor = (id: string): LinkedCourse[] =>
    (links?.scholarship_assignments ?? [])
      .filter((a) => a.scholarship_id === id)
      .map((a) => ({ id: a.course_id, name: a.course_name }));

  return (
    <div>
      {dialog}
      <StepActionBar
        jobId={jobId}
        step="courses"
        label="Scholarships"
        runLabel="Run Scholarship Extraction"
        // Scholarships are written by the course crawl (writeCourse's scholarships[] sink); no step
        // extracts them on their own, and dispatching "courses" on a finished job processes zero
        // pages while reporting success. Disabled until a scholarships step exists.
        runBlockedReason="Scholarships are extracted with the course crawl — re-run a course from the Courses tab"
        progress={(job.pipeline_progress as Record<string, unknown> | null)?.courses}
        lastUpdated={latestTimestamp(scholarships)}
        hasData={total > 0}
        onChanged={onReload}
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search scholarships…"
            className="h-8 pl-7 text-sm"
          />
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={allSelected}
              onCheckedChange={() => setSelectedIds(allSelected ? [] : scholarships.map((r) => r.id))}
              disabled={scholarships.length === 0}
            />
            {total} scholarship{total === 1 ? "" : "s"}
            {search.trim() && ` · ${scholarships.length} on this page`}
          </label>
          {selectedIds.length > 0 && (
            <Button
              variant="destructive" size="sm" className="h-8 gap-1.5 cursor-pointer" disabled={saving}
              onClick={async () => {
                if (!(await confirm(`Delete ${selectedIds.length} scholarships?`))) return;
                await run(async () => {
                  await Promise.all(selectedIds.map((id) => allExtractionsApi.deleteScholarship(id)));
                  setSelectedIds([]);
                }, `${selectedIds.length} scholarships deleted`);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete {selectedIds.length}
            </Button>
          )}
        </div>
        <Button className="gap-1.5 cursor-pointer" disabled={adding} onClick={() => { setAdding(true); setEditingId(null); }}>
          <Plus className="h-4 w-4" />
          Add Scholarship
        </Button>
      </div>

      <div className="space-y-3">
        <Dialog open={adding} onOpenChange={setAdding}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl p-0 border-0 bg-transparent shadow-none">
            <ScholarshipForm
              saving={saving}
              onCancel={() => setAdding(false)}
              onSave={(values: ScholarshipParams) =>
                run(async () => {
                  await allExtractionsApi.createScholarship({ job_id: jobId, ...values });
                  setAdding(false);
                }, "Scholarship created")
              }
            />
          </DialogContent>
        </Dialog>

        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && scholarships.length === 0 && !adding && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              <Award className="mx-auto mb-3 h-8 w-8 opacity-40" />
              <p className="text-sm">{search.trim() ? "No scholarships match your search" : "No scholarships yet"}</p>
              {!search.trim() && <p className="mt-1 text-xs">Add one manually and link it to the courses it applies to.</p>}
            </CardContent>
          </Card>
        )}

        {scholarships.map((scholarship) =>
          editingId === scholarship.id ? (
            <ScholarshipForm
              key={scholarship.id}
              scholarship={scholarship}
              saving={saving}
              onCancel={() => setEditingId(null)}
              onSave={(values) =>
                run(async () => {
                  await saveFormAndLearn("extraction_scholarships", scholarship, values, jobId);
                  setEditingId(null);
                }, "Scholarship updated")
              }
            />
          ) : (
            <ScholarshipCard
              key={scholarship.id}
              jobId={jobId}
              scholarship={scholarship}
              linked={coursesFor(scholarship.id)}
              selected={selectedIds.includes(scholarship.id)}
              busy={saving}
              onToggleSelect={() =>
                setSelectedIds((prev) => (prev.includes(scholarship.id) ? prev.filter((x) => x !== scholarship.id) : [...prev, scholarship.id]))
              }
              onEdit={() => { setEditingId(scholarship.id); setAdding(false); }}
              onDelete={async () => {
                if (!(await confirm("Delete scholarship?"))) return;
                await run(() => allExtractionsApi.deleteScholarship(scholarship.id), "Scholarship deleted");
              }}
              onSaveField={(column, next) => saveField("extraction_scholarships", scholarship.id, column, next)}
              onLinkCourse={(courseId) =>
                run(() => allExtractionsApi.assignJunction("scholarships", { job_id: jobId, course_id: courseId, entity_id: scholarship.id }), "Linked to course")
              }
              onUnlinkCourse={(courseId) =>
                run(() => allExtractionsApi.unassignJunction("scholarships", { job_id: jobId, course_id: courseId, entity_id: scholarship.id }), "Unlinked")
              }
            />
          ),
        )}
      </div>

      {total > 0 && (
        <Pagination page={page} total={total} limit={limit} onPageChange={setPage} align="end" onPageSizeChange={(next) => { setLimit(next); setPage(1); }} />
      )}
    </div>
  );
}
