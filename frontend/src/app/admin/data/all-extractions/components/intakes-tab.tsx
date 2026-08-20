"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, Link2, Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { allExtractionsApi } from "../apis";
import { latestTimestamp } from "../utils";
import { EditableField, useFieldSaver } from "./editable-field";
import { StepActionBar } from "./step-action-bar";
import { useConfirmDelete } from "./use-confirm-delete";
import type { CourseFull, CourseLinks, ExtractionJob, Intake, IntakeParams } from "../apis/types";

/** Native date inputs need YYYY-MM-DD; the API hands back full timestamps. */
const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

const CHIP_LIMIT = 6;

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
          <Input id="intake-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Semester 1 2025" />
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
              if (!name.trim()) {
                toast.error("Intake name is required");
                return;
              }
              const start = startDate ? new Date(startDate) : null;
              onSave({
                intake_name: name.trim(),
                ...(startDate ? { start_date: startDate } : {}),
                ...(endDate ? { end_date: endDate } : {}),
                ...(orientation ? { orientation_date: orientation } : {}),
                ...(deadline ? { admission_deadline: deadline } : {}),
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
  intake,
  courses,
  linkedCourseIds,
  selected,
  busy,
  onToggleSelect,
  onDelete,
  onLinkCourse,
  onUnlinkCourse,
  onSaveField,
}: Readonly<{
  intake: Intake;
  courses: CourseFull[];
  linkedCourseIds: string[];
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

  const linked = courses.filter((c) => linkedCourseIds.includes(c.id));
  const unlinked = courses.filter((c) => !linkedCourseIds.includes(c.id));
  const visible = showAll ? linked : linked.slice(0, CHIP_LIMIT);
  const year = intake.intake_year ?? (intake.start_date ? new Date(intake.start_date).getFullYear() : null);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <Checkbox checked={selected} onCheckedChange={onToggleSelect} />
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

        <div className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
          <EditableField label="Intake Name" value={intake.intake_name} onSave={(v) => onSaveField("intake_name", v)} />
          <EditableField label="Start Date" value={toDateInput(intake.start_date)} onSave={(v) => onSaveField("start_date", v)} />
          <EditableField label="End Date" value={toDateInput(intake.end_date)} onSave={(v) => onSaveField("end_date", v)} />
          <EditableField label="Admission Deadline" value={toDateInput(intake.admission_deadline)} onSave={(v) => onSaveField("admission_deadline", v)} />
          <EditableField label="Orientation" value={toDateInput(intake.orientation_date)} onSave={(v) => onSaveField("orientation_date", v)} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
          {visible.map((course) => (
            <Badge key={course.id} className="gap-1 bg-primary/10 text-xs text-primary">
              {course.name}
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
          <Combobox
            options={unlinked.map((c) => ({ value: c.id, label: c.name }))}
            value=""
            onChange={onLinkCourse}
            placeholder={unlinked.length ? "Link a course…" : "All courses linked"}
            disabled={unlinked.length === 0}
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
  const [courses, setCourses] = useState<CourseFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const fetchedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const [courseLinks, courseRows] = await Promise.all([
        allExtractionsApi.getCourseLinks(jobId),
        allExtractionsApi.getCourses(jobId, { limit: 100 }).then((r) => r.data),
      ]);
      setLinks(courseLinks);
      setCourses(courseRows);
    } catch (e) {
      toast.error("Failed to load intakes", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    load();
  }, [load]);

  const saveField = useFieldSaver(jobId, load);
  const { confirm, dialog } = useConfirmDelete();
  const intakes = links?.intakes ?? [];
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

  const coursesForIntake = (intakeId: string) =>
    (links?.intake_assignments ?? []).filter((a) => a.intake_id === intakeId).map((a) => a.course_id);

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
        hasData={intakes.length > 0}
        guidedUrls={job.guided_urls}
        contextKey="extract_fields"
        contextLabel="extract fields"
        onChanged={onReload}
        onAddContext={onJumpToContext}
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={allSelected}
              onCheckedChange={() => setSelectedIds(allSelected ? [] : intakes.map((i) => i.id))}
              disabled={intakes.length === 0}
            />
            Select all ({intakes.length})
          </label>
          {selectedIds.length > 0 && (
            <Button
              variant="destructive" size="sm" className="h-8 gap-1.5 cursor-pointer"
              disabled={saving}
              onClick={async () => {
                if (!(await confirm(`Delete ${selectedIds.length} intakes?`))) return;
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
        {creating && (
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
        )}

        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && intakes.length === 0 && !creating && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              <CalendarDays className="mx-auto mb-3 h-8 w-8 opacity-40" />
              <p className="text-sm">No intakes yet</p>
              <p className="mt-1 text-xs">Create one manually, or extract intakes from a course in the Courses tab.</p>
            </CardContent>
          </Card>
        )}

        {intakes.map((intake) => (
          <IntakeCard
            key={intake.id}
            intake={intake}
            courses={courses}
            linkedCourseIds={coursesForIntake(intake.id)}
            selected={selectedIds.includes(intake.id)}
            busy={saving}
            onToggleSelect={() =>
              setSelectedIds((prev) => (prev.includes(intake.id) ? prev.filter((x) => x !== intake.id) : [...prev, intake.id]))
            }
            onSaveField={(column, next) => saveField("extraction_intakes", intake.id, column, next)}
            onDelete={async () => { if (!(await confirm("Delete intake?"))) return; await run(() => allExtractionsApi.deleteIntake(intake.id), "Intake deleted"); }}
            onLinkCourse={(courseId) =>
              run(() => allExtractionsApi.assignJunction("intakes", { job_id: jobId, course_id: courseId, entity_id: intake.id }), "Linked to course")
            }
            onUnlinkCourse={(courseId) =>
              run(() => allExtractionsApi.unassignJunction("intakes", { job_id: jobId, course_id: courseId, entity_id: intake.id }), "Unlinked")
            }
          />
        ))}
      </div>
    </div>
  );
}
