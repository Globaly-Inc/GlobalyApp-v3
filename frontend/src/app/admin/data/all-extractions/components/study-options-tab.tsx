"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, Link2, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/combobox";
import { allExtractionsApi } from "../apis";
import { saveFormAndLearn } from "./editable-field";
import { latestTimestamp } from "../utils";
import { StepActionBar } from "./step-action-bar";
import { useConfirmDelete } from "./use-confirm-delete";
import { StudyOptionForm } from "./study-option-form";
import type { CourseFull, CourseLinks, ExtractionJob, StudyOption } from "../apis/types";

const CHIP_LIMIT = 6;
const humanize = (v: string | null) => (v ? v.replaceAll("_", " ") : "");

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
}>) {
  const [editingLinks, setEditingLinks] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const linked = courses.filter((c) => linkedCourseIds.includes(c.id));
  const unlinked = courses.filter((c) => !linkedCourseIds.includes(c.id));
  const visible = showAll ? linked : linked.slice(0, CHIP_LIMIT);

  return (
    <div className="flex items-start justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Checkbox checked={selected} onCheckedChange={onToggleSelect} className="mt-2 shrink-0" />
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Clock className="h-4 w-4 text-primary" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {option.study_mode && <Badge className="text-[10px] capitalize">{humanize(option.study_mode)}</Badge>}
            {option.study_load && <span className="text-xs capitalize">{humanize(option.study_load)}</span>}
            {option.applicable_to && (
              <Badge variant="outline" className="text-[10px] capitalize">{humanize(option.applicable_to)}</Badge>
            )}
          </div>
          {option.duration_value != null && (
            <p className="mt-1 text-xs text-muted-foreground">
              {option.duration_value} {option.duration_unit}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
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
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="icon-sm" className="cursor-pointer" title="Edit" disabled={busy} onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost" size="icon-sm" className="cursor-pointer text-destructive hover:text-destructive"
          title="Delete" disabled={busy} onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
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
        {adding && (
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
        )}

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
            />
          ),
        )}
      </div>
    </div>
  );
}
