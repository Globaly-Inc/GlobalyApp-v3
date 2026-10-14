"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { allExtractionsApi } from "../apis";
import { latestTimestamp } from "../utils";
import { useFieldSaver } from "./editable-field";
import { IntakeForm } from "./intake-form";
import { StepActionBar } from "./step-action-bar";
import { useConfirmDelete } from "./use-confirm-delete";
import type { CourseLinks, ExtractionJob, Intake } from "../apis/types";
import { IntakeCard, type LinkedCourse } from "./intakes-tab-card";

const DEFAULT_PAGE_SIZE = 10;

export function IntakesTab({
  jobId,
  job,
  onReload,
}: Readonly<{
  jobId: string;
  job: ExtractionJob;
  onReload: () => void;
}>) {
  const [links, setLinks] = useState<CourseLinks | null>(null);
  const [intakes, setIntakes] = useState<Intake[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const fetchedRef = useRef(false);

  // Accepts overrides for the same reason study-units-tab.tsx does — setState is async, so a
  // caller that also resets page/search right before reloading needs the new values applied
  // to THIS fetch immediately, not next render's stale closure.
  const load = useCallback(async (overrides?: { page?: number; limit?: number; search?: string }) => {
    try {
      const [intakesRes, courseLinks] = await Promise.all([
        allExtractionsApi.getIntakes(jobId, {
          page: overrides?.page ?? page,
          limit: overrides?.limit ?? limit,
          search: (overrides?.search ?? search).trim() || undefined,
        }),
        allExtractionsApi.getCourseLinks(jobId),
      ]);
      setIntakes(intakesRes.data);
      setTotal(intakesRes.meta?.total ?? 0);
      setLinks(courseLinks);
    } catch (e) {
      toast.error("Failed to load intakes", { description: (e as Error).message });
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

  const saveField = useFieldSaver(jobId, load);
  const { confirm, dialog } = useConfirmDelete();
  const allSelected = intakes.length > 0 && selectedIds.length === intakes.length;

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

  const coursesForIntake = (intakeId: string): LinkedCourse[] =>
    (links?.intake_assignments ?? [])
      .filter((a) => a.intake_id === intakeId)
      .map((a) => ({ id: a.course_id, name: a.course_name }));

  return (
    <div>
      {dialog}
      <StepActionBar
        jobId={jobId}
        step="courses"
        label="Intakes"
        runLabel="Run Intakes Extraction"
        progress={(job.pipeline_progress as Record<string, unknown> | null)?.courses}
        lastUpdated={latestTimestamp(intakes)}
        hasData={total > 0}
        onChanged={onReload}
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              // A search change invalidates the current page. Done here rather than in an
              // effect on [search]: same result, and the repo lints against set-state-in-effect.
              setPage(1);
            }}
            placeholder="Search intakes…"
            className="h-8 pl-7 text-sm"
          />
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={allSelected}
              onCheckedChange={() => setSelectedIds(allSelected ? [] : intakes.map((i) => i.id))}
              disabled={intakes.length === 0}
            />
            {total} intake{total === 1 ? "" : "s"}
            {search.trim() && ` · ${intakes.length} on this page`}
          </label>
          {selectedIds.length > 0 && (
            <Button
              variant="destructive" size="sm" className="h-8 gap-1.5 cursor-pointer"
              disabled={saving}
              onClick={async () => {
                if (!(await confirm(`Delete ${selectedIds.length} intakes?`))) {
                  return;
                }
                await run(async () => {
                  await Promise.all(selectedIds.map((id) => allExtractionsApi.deleteIntake(id)));
                  setSelectedIds([]);
                }, `${selectedIds.length} intakes deleted`);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete {selectedIds.length}
            </Button>
          )}
        </div>
        <Button className="gap-1.5 cursor-pointer" disabled={creating} onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          Create Intake
        </Button>
      </div>

      <div className="space-y-3">
        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl p-0 border-0 bg-transparent shadow-none">
            <IntakeForm
              saving={saving}
              onCancel={() => setCreating(false)}
              onSave={(values) =>
                run(async () => {
                  await allExtractionsApi.createIntake({ job_id: jobId, ...values });
                  setCreating(false);
                }, "Intake created")
              }
            />
          </DialogContent>
        </Dialog>

        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && intakes.length === 0 && !creating && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              <CalendarDays className="mx-auto mb-3 h-8 w-8 opacity-40" />
              <p className="text-sm">{search.trim() ? "No intakes match your search" : "No intakes yet"}</p>
              {!search.trim() && (
                <p className="mt-1 text-xs">Create one manually, or extract intakes from a course in the Courses tab.</p>
              )}
            </CardContent>
          </Card>
        )}

        {intakes.map((intake) => (
          <IntakeCard
            key={intake.id}
            jobId={jobId}
            intake={intake}
            linked={coursesForIntake(intake.id)}
            selected={selectedIds.includes(intake.id)}
            busy={saving}
            onToggleSelect={() =>
              setSelectedIds((prev) => (prev.includes(intake.id) ? prev.filter((x) => x !== intake.id) : [...prev, intake.id]))
            }
            onSaveField={(column, next) => saveField("extraction_intakes", intake.id, column, next)}
            onDelete={async () => {
              if (!(await confirm("Delete intake?"))) {
                return;
              }
              await run(() => allExtractionsApi.deleteIntake(intake.id), "Intake deleted");
            }}
            onLinkCourse={(courseId) =>
              run(() => allExtractionsApi.assignJunction("intakes", { job_id: jobId, course_id: courseId, entity_id: intake.id }), "Linked to course")
            }
            onUnlinkCourse={(courseId) =>
              run(() => allExtractionsApi.unassignJunction("intakes", { job_id: jobId, course_id: courseId, entity_id: intake.id }), "Unlinked")
            }
          />
        ))}
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
