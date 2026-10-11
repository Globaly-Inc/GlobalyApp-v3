"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, Loader2, Plus, Search, Trash2 } from "lucide-react";
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
import { StepActionBar } from "./step-action-bar";
import { useConfirmDelete } from "./use-confirm-delete";
import { StudyOptionForm } from "./study-option-form";
import { StudyOptionCard, type LinkedCourse } from "./study-options-tab-card";
import type { CourseLinks, ExtractionJob, StudyOption } from "../apis/types";

const DEFAULT_PAGE_SIZE = 10;

export function StudyOptionsTab({
  jobId,
  job,
  onReload,
}: Readonly<{
  jobId: string;
  job: ExtractionJob;
  onReload: () => void;
}>) {
  const [links, setLinks] = useState<CourseLinks | null>(null);
  const [options, setOptions] = useState<StudyOption[]>([]);
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

  // Accepts overrides for the same reason study-units-tab.tsx does — setState is async, so a
  // caller that also resets page/search right before reloading needs the new values applied
  // to THIS fetch immediately, not next render's stale closure.
  const load = useCallback(async (overrides?: { page?: number; limit?: number; search?: string }) => {
    try {
      const [optionsRes, courseLinks] = await Promise.all([
        allExtractionsApi.getStudyOptions(jobId, {
          page: overrides?.page ?? page,
          limit: overrides?.limit ?? limit,
          search: (overrides?.search ?? search).trim() || undefined,
        }),
        allExtractionsApi.getCourseLinks(jobId),
      ]);
      setOptions(optionsRes.data);
      setTotal(optionsRes.meta?.total ?? 0);
      setLinks(courseLinks);
    } catch (e) {
      toast.error("Failed to load study options", { description: (e as Error).message });
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
    // Debounce so typing in the search box doesn't fire a request per keystroke.
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  // A search change invalidates the current page.
  useEffect(() => {
    setPage(1);
  }, [search]);

  const saveField = useFieldSaver(jobId, load);
  const { confirm, dialog } = useConfirmDelete();

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

  const coursesForOption = (id: string): LinkedCourse[] =>
    (links?.study_option_assignments ?? [])
      .filter((a) => a.study_option_id === id)
      .map((a) => ({ id: a.course_id, name: a.course_name }));

  return (
    <div>
      {dialog}
      <StepActionBar
        jobId={jobId}
        step="courses"
        label="Study Options"
        runLabel="Run Study Options Extraction"
        progress={(job.pipeline_progress as Record<string, unknown> | null)?.courses}
        lastUpdated={latestTimestamp(options)}
        hasData={total > 0}
        onChanged={onReload}
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search study options…"
            className="h-8 pl-7 text-sm"
          />
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={options.length > 0 && selectedIds.length === options.length}
              onCheckedChange={() => setSelectedIds(selectedIds.length === options.length ? [] : options.map((o) => o.id))}
              disabled={options.length === 0}
            />
            {total} option{total === 1 ? "" : "s"}
            {search.trim() && ` · ${options.length} on this page`}
          </label>
          {selectedIds.length > 0 && (
            <Button
              variant="destructive" size="sm" className="h-8 gap-1.5 cursor-pointer"
              disabled={saving}
              onClick={async () => {
                if (!(await confirm(`Delete ${selectedIds.length} study options?`))) {
                  return;
                }
                await run(async () => {
                  await Promise.all(selectedIds.map((id) => allExtractionsApi.deleteStudyOption(id)));
                  setSelectedIds([]);
                }, `${selectedIds.length} study options deleted`);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete {selectedIds.length}
            </Button>
          )}
          <span className="text-sm text-muted-foreground">{options.length} option{options.length === 1 ? "" : "s"}</span>
        </div>
        <Button className="gap-1.5 cursor-pointer" disabled={adding} onClick={() => { setAdding(true); setEditingId(null); }}>
          <Plus className="h-4 w-4" />
          Add study option
        </Button>
      </div>

      <div className="space-y-3">
        <Dialog open={adding} onOpenChange={setAdding}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl p-0 border-0 bg-transparent shadow-none">
            <StudyOptionForm
              saving={saving}
              onCancel={() => setAdding(false)}
              onSave={(values) =>
                run(async () => {
                  await allExtractionsApi.createStudyOption({ job_id: jobId, ...values });
                  setAdding(false);
                }, "Study option created")
              }
            />
          </DialogContent>
        </Dialog>

        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && options.length === 0 && !adding && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              <Clock className="mx-auto mb-3 h-8 w-8 opacity-40" />
              <p className="text-sm">{search.trim() ? "No study options match your search" : "No study options yet"}</p>
              {!search.trim() && (
                <p className="mt-1 text-xs">Add one manually, or extract them from a course in the Courses tab.</p>
              )}
            </CardContent>
          </Card>
        )}

        {options.map((option) =>
          editingId === option.id ? (
            <StudyOptionForm
              key={option.id}
              option={option}
              saving={saving}
              onCancel={() => setEditingId(null)}
              onSave={(values) =>
                run(async () => {
                  await saveFormAndLearn("extraction_study_options", option, values, jobId);
                  setEditingId(null);
                }, "Study option updated")
              }
            />
          ) : (
            <StudyOptionCard
              key={option.id}
              jobId={jobId}
              option={option}
              linked={coursesForOption(option.id)}
              busy={saving}
              selected={selectedIds.includes(option.id)}
              onToggleSelect={() =>
                setSelectedIds((prev) => (prev.includes(option.id) ? prev.filter((x) => x !== option.id) : [...prev, option.id]))
              }
              onEdit={() => { setEditingId(option.id); setAdding(false); }}
              onDelete={async () => {
                if (!(await confirm("Delete study option?"))) {
                  return;
                }
                await run(() => allExtractionsApi.deleteStudyOption(option.id), "Study option deleted");
              }}
              onLinkCourse={(courseId) =>
                run(() => allExtractionsApi.assignJunction("study-options", { job_id: jobId, course_id: courseId, entity_id: option.id }), "Linked to course")
              }
              onUnlinkCourse={(courseId) =>
                run(() => allExtractionsApi.unassignJunction("study-options", { job_id: jobId, course_id: courseId, entity_id: option.id }), "Unlinked")
              }
              onSaveField={(column, next) => saveField("extraction_study_options", option.id, column, next)}
            />
          ),
        )}
      </div>

      {total > 0 && (
        <Pagination
          page={page}
          total={total}
          limit={limit}
          onPageChange={setPage}
          align="end"
          onPageSizeChange={(next) => { setLimit(next); setPage(1); }}
        />
      )}
    </div>
  );
}
