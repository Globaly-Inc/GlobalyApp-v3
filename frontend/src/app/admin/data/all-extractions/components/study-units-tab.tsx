"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookMarked, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { allExtractionsApi } from "../apis";
import { saveFormAndLearn, useFieldSaver } from "./editable-field";
import { StudyUnitForm } from "./study-unit-form";
import { StudyUnitCard, type LinkedCourse } from "./study-units-tab-card";
import { latestTimestamp } from "../utils";
import { StepActionBar } from "./step-action-bar";
import { useConfirmDelete } from "./use-confirm-delete";
import type { CourseLinks, ExtractionJob, StudyUnit } from "../apis/types";

const DEFAULT_PAGE_SIZE = 10;

export function StudyUnitsTab({
  jobId,
  job,
  onReload,
}: Readonly<{
  jobId: string;
  job: ExtractionJob;
  onReload: () => void;
}>) {
  const [links, setLinks] = useState<CourseLinks | null>(null);
  const [units, setUnits] = useState<StudyUnit[]>([]);
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

  // Accepts overrides for the same reason courses-tab.tsx does — setState is async, so a
  // caller that also resets page/search right before reloading needs the new values applied
  // to THIS fetch immediately, not next render's stale closure.
  const load = useCallback(async (overrides?: { page?: number; limit?: number; search?: string }) => {
    try {
      const [unitsRes, courseLinks] = await Promise.all([
        allExtractionsApi.getStudyUnits(jobId, {
          page: overrides?.page ?? page,
          limit: overrides?.limit ?? limit,
          search: (overrides?.search ?? search).trim() || undefined,
        }),
        allExtractionsApi.getCourseLinks(jobId),
      ]);
      setUnits(unitsRes.data);
      setTotal(unitsRes.meta?.total ?? 0);
      setLinks(courseLinks);
    } catch (e) {
      toast.error("Failed to load study units", { description: (e as Error).message });
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

  const allSelected = units.length > 0 && selectedIds.length === units.length;

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

  const coursesForUnit = (id: string): LinkedCourse[] =>
    (links?.study_unit_assignments ?? [])
      .filter((a) => a.study_unit_id === id)
      .map((a) => ({ id: a.course_id, name: a.course_name }));

  return (
    <div>
      {dialog}
      <StepActionBar
        jobId={jobId}
        step="courses"
        label="Study Units"
        runLabel="Run Study Units Extraction"
        progress={(job.pipeline_progress as Record<string, unknown> | null)?.courses}
        lastUpdated={latestTimestamp(units)}
        hasData={total > 0}
        onChanged={onReload}
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search study units…"
            className="h-8 pl-7 text-sm"
          />
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={allSelected}
              onCheckedChange={() => setSelectedIds(allSelected ? [] : units.map((u) => u.id))}
              disabled={units.length === 0}
            />
            {total} unit{total === 1 ? "" : "s"}
            {search.trim() && ` · ${units.length} on this page`}
          </label>
          {selectedIds.length > 0 && (
            <Button
              variant="destructive" size="sm" className="h-8 gap-1.5 cursor-pointer"
              disabled={saving}
              onClick={async () => {
                if (!(await confirm(`Delete ${selectedIds.length} study units?`))) {
                  return;
                }
                await run(async () => {
                  await Promise.all(selectedIds.map((id) => allExtractionsApi.deleteStudyUnit(id)));
                  setSelectedIds([]);
                }, `${selectedIds.length} units deleted`);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete {selectedIds.length}
            </Button>
          )}
        </div>
        <Button className="gap-1.5 cursor-pointer" disabled={adding} onClick={() => { setAdding(true); setEditingId(null); }}>
          <Plus className="h-4 w-4" />
          Add Study Unit
        </Button>
      </div>

      <div className="space-y-3">
        <Dialog open={adding} onOpenChange={setAdding}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl p-0 border-0 bg-transparent shadow-none">
            <StudyUnitForm
              saving={saving}
              onCancel={() => setAdding(false)}
              onSave={(values) =>
                run(async () => {
                  await allExtractionsApi.createStudyUnit({ job_id: jobId, ...values });
                  setAdding(false);
                }, "Study unit added")
              }
            />
          </DialogContent>
        </Dialog>

        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && units.length === 0 && !adding && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              <BookMarked className="mx-auto mb-3 h-8 w-8 opacity-40" />
              <p className="text-sm">{search.trim() ? "No study units match your search" : "No study units yet"}</p>
              {!search.trim() && (
                <p className="mt-1 text-xs">Add one manually, or extract units from a course in the Courses tab.</p>
              )}
            </CardContent>
          </Card>
        )}

        {units.map((unit) =>
          editingId === unit.id ? (
            <StudyUnitForm
              key={unit.id}
              unit={unit}
              saving={saving}
              onCancel={() => setEditingId(null)}
              onSave={(values) =>
                run(async () => {
                  await saveFormAndLearn("extraction_study_units", unit, values, jobId);
                  setEditingId(null);
                }, "Study unit updated")
              }
            />
          ) : (
            <StudyUnitCard
              key={unit.id}
              jobId={jobId}
              unit={unit}
              linked={coursesForUnit(unit.id)}
              selected={selectedIds.includes(unit.id)}
              busy={saving}
              onToggleSelect={() =>
                setSelectedIds((prev) => (prev.includes(unit.id) ? prev.filter((x) => x !== unit.id) : [...prev, unit.id]))
              }
              onEdit={() => { setEditingId(unit.id); setAdding(false); }}
              onDelete={async () => {
                if (!(await confirm("Delete study unit?"))) {
                  return;
                }
                await run(() => allExtractionsApi.deleteStudyUnit(unit.id), "Study unit deleted");
              }}
              onSaveField={(column, next) => saveField("extraction_study_units", unit.id, column, next)}
              onToggleType={() =>
                run(
                  () => allExtractionsApi.updateStudyUnit(unit.id, {
                    unit_type: unit.unit_type === "elective" ? "compulsory" : "elective",
                  }),
                  "Unit type updated",
                )
              }
              onLinkCourse={(courseId) =>
                run(() => allExtractionsApi.assignJunction("study-units", { job_id: jobId, course_id: courseId, entity_id: unit.id }), "Linked to course")
              }
              onUnlinkCourse={(courseId) =>
                run(() => allExtractionsApi.unassignJunction("study-units", { job_id: jobId, course_id: courseId, entity_id: unit.id }), "Unlinked")
              }
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
