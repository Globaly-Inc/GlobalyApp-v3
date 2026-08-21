"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GraduationCap, Languages, Link2, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/combobox";
import { allExtractionsApi } from "../apis";
import { saveFormAndLearn } from "./editable-field";
import { latestTimestamp } from "../utils";
import { EligibilityForm } from "./eligibility-form";
import { StepActionBar } from "./step-action-bar";
import { useConfirmDelete } from "./use-confirm-delete";
import type {
  CourseFull, CourseLinks, EligibilityParams, EligibilityRequirement, ExtractionJob,
} from "../apis/types";

const CHIP_LIMIT = 6;

function RequirementCard({
  requirement,
  courses,
  linkedCourseIds,
  selected,
  busy,
  onToggleSelect,
  onEdit,
  onDelete,
  onLinkCourse,
  onUnlinkCourse,
}: Readonly<{
  requirement: EligibilityRequirement;
  courses: CourseFull[];
  linkedCourseIds: string[];
  selected: boolean;
  busy: boolean;
  onToggleSelect: () => void;
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
  const languageCount = requirement.language_tests?.length ?? 0;
  const score = requirement.min_score_percent ?? requirement.min_score;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Checkbox checked={selected} onCheckedChange={onToggleSelect} />
            <span className="truncate text-sm font-medium">{requirement.name || "Requirement"}</span>
            {requirement.applicable_to && (
              <Badge className="bg-primary/10 text-xs capitalize text-primary">{requirement.applicable_to}</Badge>
            )}
            {requirement.min_degree_level && (
              <Badge variant="outline" className="text-xs">{requirement.min_degree_level}</Badge>
            )}
            {score != null && (
              <Badge variant="outline" className="text-xs">
                Min {score}{requirement.min_score_percent != null ? " %" : ""}
              </Badge>
            )}
            {languageCount > 0 && (
              <Badge variant="outline" className="gap-1 text-xs">
                <Languages className="h-3 w-3" />
                {languageCount}
              </Badge>
            )}
            <Badge className="text-xs">
              Shared by {linked.length} course{linked.length === 1 ? "" : "s"}
            </Badge>
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

        {requirement.description && <p className="text-sm text-muted-foreground">{requirement.description}</p>}

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

export function EligibilityTab({
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
      toast.error("Failed to load eligibility requirements", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    load();
  }, [load]);

  const requirements = links?.eligibility_requirements ?? [];
  const allSelected = requirements.length > 0 && selectedIds.length === requirements.length;

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

  const coursesForRequirement = (id: string) =>
    (links?.eligibility_assignments ?? []).filter((a) => a.eligibility_requirement_id === id).map((a) => a.course_id);

  return (
    <div>
      {dialog}
      <StepActionBar
        jobId={jobId}
        step="courses"
        label="Eligibility"
        runLabel="Run Eligibility Extraction"
        progress={(job.pipeline_progress as Record<string, unknown> | null)?.courses}
        lastUpdated={latestTimestamp(requirements)}
        hasData={requirements.length > 0}
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
              onCheckedChange={() => setSelectedIds(allSelected ? [] : requirements.map((r) => r.id))}
              disabled={requirements.length === 0}
            />
            Select all ({requirements.length})
          </label>
          {selectedIds.length > 0 && (
            <Button
              variant="destructive" size="sm" className="h-8 gap-1.5 cursor-pointer"
              disabled={saving}
              onClick={async () => {
                if (!(await confirm(`Delete ${selectedIds.length} requirements?`))) return;
                await run(async () => {
                  await Promise.all(selectedIds.map((id) => allExtractionsApi.deleteEligibilityRequirement(id)));
                  setSelectedIds([]);
                }, `${selectedIds.length} requirements deleted`);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete {selectedIds.length}
            </Button>
          )}
        </div>
        <Button className="gap-1.5 cursor-pointer" disabled={adding} onClick={() => { setAdding(true); setEditingId(null); }}>
          <Plus className="h-4 w-4" />
          Add Requirement
        </Button>
      </div>

      <div className="space-y-3">
        {adding && (
          <EligibilityForm
            saving={saving}
            onCancel={() => setAdding(false)}
            onSave={(values: EligibilityParams) =>
              run(async () => {
                await allExtractionsApi.createEligibilityRequirement({ job_id: jobId, ...values });
                setAdding(false);
              }, "Requirement created")
            }
          />
        )}

        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && requirements.length === 0 && !adding && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              <GraduationCap className="mx-auto mb-3 h-8 w-8 opacity-40" />
              <p className="text-sm">No eligibility requirements yet</p>
              <p className="mt-1 text-xs">Add one manually, or extract them from a course in the Courses tab.</p>
            </CardContent>
          </Card>
        )}

        {requirements.map((requirement) =>
          editingId === requirement.id ? (
            <EligibilityForm
              key={requirement.id}
              requirement={requirement}
              saving={saving}
              onCancel={() => setEditingId(null)}
              onSave={(values) =>
                run(async () => {
                  await saveFormAndLearn("extraction_eligibility_requirements", requirement, values, jobId);
                  setEditingId(null);
                }, "Requirement updated")
              }
            />
          ) : (
            <RequirementCard
              key={requirement.id}
              requirement={requirement}
              courses={courses}
              linkedCourseIds={coursesForRequirement(requirement.id)}
              selected={selectedIds.includes(requirement.id)}
              busy={saving}
              onToggleSelect={() =>
                setSelectedIds((prev) =>
                  prev.includes(requirement.id) ? prev.filter((x) => x !== requirement.id) : [...prev, requirement.id],
                )
              }
              onEdit={() => { setEditingId(requirement.id); setAdding(false); }}
              onDelete={async () => { if (!(await confirm("Delete requirement?"))) return; await run(() => allExtractionsApi.deleteEligibilityRequirement(requirement.id), "Requirement deleted"); }}
              onLinkCourse={(courseId) =>
                run(() => allExtractionsApi.assignJunction("eligibility-requirements", { job_id: jobId, course_id: courseId, entity_id: requirement.id }), "Linked to course")
              }
              onUnlinkCourse={(courseId) =>
                run(() => allExtractionsApi.unassignJunction("eligibility-requirements", { job_id: jobId, course_id: courseId, entity_id: requirement.id }), "Unlinked")
              }
            />
          ),
        )}
      </div>
    </div>
  );
}
