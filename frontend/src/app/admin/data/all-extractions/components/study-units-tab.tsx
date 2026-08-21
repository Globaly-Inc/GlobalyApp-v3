"use client";

import { z } from "zod";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Award, BookMarked, BookOpen, FileText, Hash, Link2, Loader2, Pencil, Plus, Save, Tag, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/combobox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FieldError } from "@/components/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { allExtractionsApi } from "../apis";
import { EditableField, saveFormAndLearn, useFieldSaver } from "./editable-field";
import { UNIT_TYPE_OPTIONS } from "../const";
import { latestTimestamp } from "../utils";
import { StepActionBar } from "./step-action-bar";
import { useConfirmDelete } from "./use-confirm-delete";
import type { CourseFull, CourseLinks, ExtractionJob, StudyUnit, StudyUnitParams } from "../apis/types";

const CHIP_LIMIT = 6;

const studyUnitSchema = z.object({
  name: z.string().trim().min(1, "Unit name is required"),
  code: z.string().trim(),
  points: z
    .string()
    .trim()
    .refine((v) => !v || !Number.isNaN(Number(v)), { message: "Credit points must be a valid number" }),
  type: z.string(),
  description: z.string().trim(),
});

// Derived from EditableField's own props so we don't have to touch editable-field.tsx
// to get at its prop type.
type EditableFieldProps = Parameters<typeof EditableField>[0];

// EditableField keeps its own click-to-edit affordance — this just gives each
// field a visual anchor (icon tile), matching the Institution/Branches tabs' treatment.
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

function StudyUnitForm({
  unit,
  saving,
  onCancel,
  onSave,
}: Readonly<{
  unit?: StudyUnit;
  saving: boolean;
  onCancel: () => void;
  onSave: (values: StudyUnitParams & { unit_name: string }) => void;
}>) {
  const [code, setCode] = useState(unit?.unit_code ?? "");
  const [points, setPoints] = useState(unit?.credit_points?.toString() ?? "");
  const [name, setName] = useState(unit?.unit_name ?? "");
  const [type, setType] = useState(unit?.unit_type ?? "compulsory");
  const [description, setDescription] = useState(unit?.description ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BookMarked className="h-4 w-4 text-primary" />
          {unit ? "Edit Study Unit" : "Add Study Unit"}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="unit-code">Unit Code</Label>
            <Input id="unit-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. COMP1010" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="unit-points">Credit Points</Label>
            <Input
              id="unit-points"
              value={points}
              onChange={(e) => {
                setPoints(e.target.value);
                if (errors.points) setErrors((prev) => ({ ...prev, points: "" }));
              }}
              inputMode="numeric"
              placeholder="e.g. 6"
              aria-invalid={Boolean(errors.points)}
            />
            <FieldError message={errors.points} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="unit-name">
            Unit Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="unit-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (errors.name) setErrors((prev) => ({ ...prev, name: "" }));
            }}
            placeholder="e.g. Introduction to Computer Science"
            aria-invalid={Boolean(errors.name)}
          />
          <FieldError message={errors.name} />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Unit Type</Label>
          <div className="flex flex-wrap items-center gap-6">
            {UNIT_TYPE_OPTIONS.map((option) => (
              <label key={option.value} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="unit-type"
                  className="accent-primary"
                  checked={type === option.value}
                  onChange={() => setType(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="unit-description">Description</Label>
          <Textarea
            id="unit-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Brief description…"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" className="cursor-pointer" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button
            className="gap-1.5 cursor-pointer"
            disabled={saving}
            onClick={() => {
              const result = studyUnitSchema.safeParse({ name, code, points, type, description });
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
              onSave({
                unit_name: d.name,
                unit_code: d.code || null,
                credit_points: d.points === "" ? null : Number(d.points),
                unit_type: d.type,
                description: d.description || null,
              });
            }}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {unit ? "Save" : "Add"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StudyUnitCard({
  unit,
  courses,
  linkedCourseIds,
  selected,
  busy,
  onToggleSelect,
  onEdit,
  onDelete,
  onSaveField,
  onToggleType,
  onLinkCourse,
  onUnlinkCourse,
}: Readonly<{
  unit: StudyUnit;
  courses: CourseFull[];
  linkedCourseIds: string[];
  selected: boolean;
  busy: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSaveField: (column: string, next: string | null) => Promise<unknown>;
  onToggleType: () => void;
  onLinkCourse: (courseId: string) => void;
  onUnlinkCourse: (courseId: string) => void;
}>) {
  const [editingLinks, setEditingLinks] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const linked = courses.filter((c) => linkedCourseIds.includes(c.id));
  const unlinked = courses.filter((c) => !linkedCourseIds.includes(c.id));
  const visible = showAll ? linked : linked.slice(0, CHIP_LIMIT);
  const isElective = unit.unit_type === "elective";

  return (
    <Card className="group overflow-hidden">
      <div className="-mt-4 flex items-center justify-between gap-2 rounded-t-xl border-b bg-primary/5 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Checkbox checked={selected} onCheckedChange={onToggleSelect} />
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <BookOpen className="h-4 w-4" />
          </div>
          <span className="truncate text-sm font-semibold text-foreground">
            {unit.unit_name || unit.unit_code || "Study unit"}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            className="cursor-pointer opacity-0 transition-opacity group-hover:opacity-100"
            title="Edit"
            disabled={busy}
            onClick={onEdit}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="cursor-pointer text-destructive hover:text-destructive"
            title="Delete"
            disabled={busy}
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <CardContent className="flex flex-col gap-3 p-4">
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <Field
            icon={Hash} label="Unit Code" value={unit.unit_code}
            onSave={(v) => onSaveField("unit_code", v)} className="col-span-2 md:col-span-2"
          />
          <Field
            icon={BookOpen} label="Unit Name" value={unit.unit_name}
            onSave={(v) => onSaveField("unit_name", v)} className="col-span-2 md:col-span-2"
          />
          <Field
            icon={Award} label="Credit Points" value={unit.credit_points?.toString() ?? null}
            onSave={(v) => onSaveField("credit_points", v === null ? null : (Number(v) as unknown as string))}
            className="col-span-2 md:col-span-2"
          />
          <Field
            icon={FileText} label="Description" value={unit.description} multiline
            onSave={(v) => onSaveField("description", v)} className="col-span-2 md:col-span-4"
          />
        </div>

        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 p-2">
          <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Tag className="h-3.5 w-3.5" />
          </div>
          <div className="flex flex-1 items-center gap-2">
            <p className="text-xs text-muted-foreground">Unit Type</p>
            <button type="button" className="cursor-pointer" disabled={busy} onClick={onToggleType} title="Switch unit type">
              <Badge variant={isElective ? "outline" : "default"} className="text-xs capitalize">
                {unit.unit_type || "compulsory"}
              </Badge>
            </button>
            <span className="text-xs text-muted-foreground">click to toggle</span>
          </div>
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

export function StudyUnitsTab({
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
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
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
      toast.error("Failed to load study units", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    load();
  }, [load]);

  const units = links?.study_units ?? [];
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

  const coursesForUnit = (id: string) =>
    (links?.study_unit_assignments ?? []).filter((a) => a.study_unit_id === id).map((a) => a.course_id);

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
        hasData={units.length > 0}
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
              onCheckedChange={() => setSelectedIds(allSelected ? [] : units.map((u) => u.id))}
              disabled={units.length === 0}
            />
            Select all ({units.length})
          </label>
          {selectedIds.length > 0 && (
            <Button
              variant="destructive" size="sm" className="h-8 gap-1.5 cursor-pointer"
              disabled={saving}
              onClick={async () => {
                if (!(await confirm(`Delete ${selectedIds.length} study units?`))) return;
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
              <p className="text-sm">No study units yet</p>
              <p className="mt-1 text-xs">Add one manually, or extract units from a course in the Courses tab.</p>
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
              unit={unit}
              courses={courses}
              linkedCourseIds={coursesForUnit(unit.id)}
              selected={selectedIds.includes(unit.id)}
              busy={saving}
              onToggleSelect={() =>
                setSelectedIds((prev) => (prev.includes(unit.id) ? prev.filter((x) => x !== unit.id) : [...prev, unit.id]))
              }
              onEdit={() => { setEditingId(unit.id); setAdding(false); }}
              onDelete={async () => { if (!(await confirm("Delete study unit?"))) return; await run(() => allExtractionsApi.deleteStudyUnit(unit.id), "Study unit deleted"); }}
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
    </div>
  );
}
