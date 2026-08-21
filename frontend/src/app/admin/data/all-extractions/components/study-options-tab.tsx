"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen, Clock, Layers, Link2, Loader2, Pencil, Plus, Trash2, Type, Users, X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/combobox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { allExtractionsApi } from "../apis";
import { EditableField, saveFormAndLearn, useFieldSaver, type EditableFieldProps } from "./editable-field";
import { latestTimestamp } from "../utils";
import { StepActionBar } from "./step-action-bar";
import { useConfirmDelete } from "./use-confirm-delete";
import { StudyOptionForm } from "./study-option-form";
import type { CourseFull, CourseLinks, ExtractionJob, StudyOption } from "../apis/types";

const CHIP_LIMIT = 6;
const humanize = (v: string | null) => (v ? v.replaceAll("_", " ") : "");

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

function StudyOptionCard({
  option,
  courses,
  linkedCourseIds,
  selected,
  onToggleSelect,
  busy,
  onEdit,
  onDelete,
  onLinkCourse,
  onUnlinkCourse,
  onSaveField,
}: Readonly<{
  option: StudyOption;
  courses: CourseFull[];
  linkedCourseIds: string[];
  selected: boolean;
  onToggleSelect: () => void;
  busy: boolean;
  onEdit: () => void;
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
  const title = option.name || humanize(option.study_mode) || "Study option";

  return (
    <Card className="group overflow-hidden">
      <div className="-mt-4 flex items-center justify-between gap-2 rounded-t-xl border-b bg-primary/5 px-4 py-3">
        <div className="flex items-center gap-3">
          <Checkbox checked={selected} onCheckedChange={onToggleSelect} />
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Clock className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold capitalize text-foreground">{title}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost" size="icon-sm"
            className="cursor-pointer opacity-0 transition-opacity group-hover:opacity-100"
            title="Edit study option" disabled={busy} onClick={onEdit}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost" size="icon-sm" className="cursor-pointer text-destructive hover:text-destructive"
            title="Delete study option" disabled={busy} onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <CardContent className="p-4">
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <Field icon={Type} label="Name" value={option.name} onSave={(v) => onSaveField("name", v)} className="col-span-2" />
          <Field icon={BookOpen} label="Study mode" value={option.study_mode} onSave={(v) => onSaveField("study_mode", v)} />
          <Field icon={Layers} label="Study load" value={option.study_load} onSave={(v) => onSaveField("study_load", v)} />
          <Field
            icon={Clock} label="Duration"
            value={option.duration_value != null ? String(option.duration_value) : null}
            onSave={(v) => onSaveField("duration_value", v)}
          />
          <Field icon={Clock} label="Duration unit" value={option.duration_unit} onSave={(v) => onSaveField("duration_unit", v)} />
          <Field
            icon={Users} label="Applicable to" value={option.applicable_to}
            onSave={(v) => onSaveField("applicable_to", v)} className="col-span-2 md:col-span-2"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
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
            className="mt-2 h-8 text-xs"
          />
        )}
      </CardContent>
    </Card>
  );
}

export function StudyOptionsTab({
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
      toast.error("Failed to load study options", { description: (e as Error).message });
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
  const options = links?.study_options ?? [];

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

  const coursesForOption = (id: string) =>
    (links?.study_option_assignments ?? []).filter((a) => a.study_option_id === id).map((a) => a.course_id);

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
        hasData={options.length > 0}
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
              checked={options.length > 0 && selectedIds.length === options.length}
              onCheckedChange={() => setSelectedIds(selectedIds.length === options.length ? [] : options.map((o) => o.id))}
              disabled={options.length === 0}
            />
            Select all ({options.length})
          </label>
          {selectedIds.length > 0 && (
            <Button
              variant="destructive" size="sm" className="h-8 gap-1.5 cursor-pointer"
              disabled={saving}
              onClick={async () => {
                if (!(await confirm(`Delete ${selectedIds.length} study options?`))) return;
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
              <p className="text-sm">No study options yet</p>
              <p className="mt-1 text-xs">Add one manually, or extract them from a course in the Courses tab.</p>
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
              option={option}
              courses={courses}
              linkedCourseIds={coursesForOption(option.id)}
              busy={saving}
              selected={selectedIds.includes(option.id)}
              onToggleSelect={() =>
                setSelectedIds((prev) => (prev.includes(option.id) ? prev.filter((x) => x !== option.id) : [...prev, option.id]))
              }
              onEdit={() => { setEditingId(option.id); setAdding(false); }}
              onDelete={async () => {
                if (!(await confirm("Delete study option?"))) return;
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
    </div>
  );
}
