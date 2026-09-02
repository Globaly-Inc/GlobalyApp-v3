"use client";

import { z } from "zod";
import { useCallback, useEffect, useRef, useState } from "react";
import { Calendar, CalendarClock, CalendarDays, Link2, Loader2, Pencil, Plus, Save, Search, Trash2, Type, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FieldError } from "@/components/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pagination } from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import { allExtractionsApi } from "../apis";
import { latestTimestamp } from "../utils";
import { CourseLinkPicker } from "./course-link-picker";
import { EditableField, useFieldSaver, type EditableFieldProps } from "./editable-field";
import { StepActionBar } from "./step-action-bar";
import { useConfirmDelete } from "./use-confirm-delete";
import type { CourseLinks, ExtractionJob, Intake, IntakeParams } from "../apis/types";

type LinkedCourse = { id: string; name: string | null };

/** Native date inputs need YYYY-MM-DD; the API hands back full timestamps. */
const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

const CHIP_LIMIT = 6;
const DEFAULT_PAGE_SIZE = 10;

const intakeSchema = z.object({
  name: z.string().trim().min(1, "Intake name is required"),
  startDate: z.string(),
  endDate: z.string(),
  orientation: z.string(),
  deadline: z.string(),
});

function Field({ icon: Icon, className, ...field }: Readonly<EditableFieldProps & { icon: LucideIcon }>) {
  return (
    <div className={cn("flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 p-2", className)}>
      <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <EditableField {...field} className="flex-1" />
    </div>
  );
}

function IntakeForm({
  saving,
  onCancel,
  onSave,
}: Readonly<{ saving: boolean; onCancel: () => void; onSave: (values: IntakeParams) => void }>) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [orientation, setOrientation] = useState("");
  const [deadline, setDeadline] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="h-4 w-4 text-primary" />
          Create Intake
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="intake-name">
            Intake Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="intake-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (errors.name) setErrors((prev) => ({ ...prev, name: "" }));
            }}
            placeholder="e.g. Semester 1 2025"
            aria-invalid={Boolean(errors.name)}
          />
          <FieldError message={errors.name} />
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Intake dates</Label>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="intake-start">Start Date</Label>
              <Input id="intake-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="intake-end">End Date</Label>
              <Input id="intake-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="intake-orientation">Orientation</Label>
              <Input id="intake-orientation" type="date" value={orientation} onChange={(e) => setOrientation(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="intake-deadline">Admission Deadline</Label>
              <Input id="intake-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" className="cursor-pointer" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button
            className="gap-1.5 cursor-pointer"
            disabled={saving}
            onClick={() => {
              const result = intakeSchema.safeParse({ name, startDate, endDate, orientation, deadline });
              if (!result.success) {
                const errs: Record<string, string> = {};
                for (const issue of result.error.issues) {
                  const key = String(issue.path[0]);
                  if (!errs[key]) errs[key] = issue.message;
                }
                setErrors(errs);
                return;
              }
              setErrors({});
              const d = result.data;
              const start = d.startDate ? new Date(d.startDate) : null;
              onSave({
                intake_name: d.name,
                ...(d.startDate ? { start_date: d.startDate } : {}),
                ...(d.endDate ? { end_date: d.endDate } : {}),
                ...(d.orientation ? { orientation_date: d.orientation } : {}),
                ...(d.deadline ? { admission_deadline: d.deadline } : {}),
                // Month/year mirror the start date so the list can group by intake year.
                ...(start ? { intake_month: start.getMonth() + 1, intake_year: start.getFullYear() } : {}),
              });
            }}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function IntakeCard({
  jobId,
  intake,
  linked,
  selected,
  busy,
  onToggleSelect,
  onDelete,
  onLinkCourse,
  onUnlinkCourse,
  onSaveField,
}: Readonly<{
  jobId: string;
  intake: Intake;
  linked: LinkedCourse[];
  selected: boolean;
  busy: boolean;
  onToggleSelect: () => void;
  onDelete: () => void;
  onLinkCourse: (courseId: string) => void;
  onUnlinkCourse: (courseId: string) => void;
  onSaveField: (column: string, next: string | null) => Promise<unknown>;
}>) {
  const [editingLinks, setEditingLinks] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const visible = showAll ? linked : linked.slice(0, CHIP_LIMIT);
  const year = intake.intake_year ?? (intake.start_date ? new Date(intake.start_date).getFullYear() : null);

  return (
    <Card className="group overflow-hidden">
      <div className="-mt-4 flex items-center justify-between gap-2 rounded-t-xl border-b bg-primary/5 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <Checkbox checked={selected} onCheckedChange={onToggleSelect} />
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Calendar className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold text-foreground">{intake.intake_name || "Unnamed intake"}</span>
          {year && <Badge variant="outline" className="text-xs">{year}</Badge>}
          <Badge className="bg-primary/10 text-xs text-primary">
            {linked.length} course{linked.length === 1 ? "" : "s"}
          </Badge>
        </div>
        <Button
          variant="ghost" size="icon-sm" className="cursor-pointer text-destructive hover:text-destructive"
          title="Delete intake" disabled={busy} onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <CardContent className="flex flex-col gap-3 p-4">
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          <Field icon={Type} label="Intake Name" value={intake.intake_name} onSave={(v) => onSaveField("intake_name", v)} />
          <Field icon={Calendar} label="Start Date" type="date" value={toDateInput(intake.start_date)} onSave={(v) => onSaveField("start_date", v)} />
          <Field icon={Calendar} label="End Date" type="date" value={toDateInput(intake.end_date)} onSave={(v) => onSaveField("end_date", v)} />
          <Field icon={CalendarClock} label="Admission Deadline" type="date" value={toDateInput(intake.admission_deadline)} onSave={(v) => onSaveField("admission_deadline", v)} />
          <Field icon={CalendarDays} label="Orientation" type="date" value={toDateInput(intake.orientation_date)} onSave={(v) => onSaveField("orientation_date", v)} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
          {visible.map((course) => (
            <Badge key={course.id} className="gap-1 bg-primary/10 text-xs text-primary">
              {course.name ?? "Unnamed course"}
              {editingLinks && (
                <button type="button" className="cursor-pointer" title="Unlink course" onClick={() => onUnlinkCourse(course.id)}>
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
          {linked.length === 0 && <span className="text-xs text-muted-foreground">Not linked to any course</span>}
          {linked.length > CHIP_LIMIT && (
            <Button variant="outline" size="sm" className="h-6 px-2 text-xs cursor-pointer" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show less" : `+${linked.length - CHIP_LIMIT} more`}
            </Button>
          )}
          <Button
            variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs cursor-pointer"
            onClick={() => setEditingLinks((v) => !v)}
          >
            <Pencil className="h-3 w-3" />
            {editingLinks ? "Done" : "Edit"}
          </Button>
        </div>

        {editingLinks && (
          <CourseLinkPicker
            jobId={jobId}
            excludeIds={linked.map((c) => c.id)}
            onSelect={onLinkCourse}
            className="h-8 text-xs"
          />
        )}
      </CardContent>
    </Card>
  );
}

export function IntakesTab({
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

  // A search change invalidates the current page.
  useEffect(() => {
    setPage(1);
  }, [search]);

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
        guidedUrls={job.guided_urls}
        contextKey="extract_fields"
        contextLabel="extract fields"
        onChanged={onReload}
        onAddContext={onJumpToContext}
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
