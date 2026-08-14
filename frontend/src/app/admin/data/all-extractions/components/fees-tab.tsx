"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DollarSign, Link2, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/combobox";
import { allExtractionsApi } from "../apis";
import { latestTimestamp } from "../utils";
import { EditableField, useFieldSaver } from "./editable-field";
import { FeeForm } from "./fee-form";
import { StepActionBar } from "./step-action-bar";
import { useConfirmDelete } from "./use-confirm-delete";
import type { CourseFee, CourseFeeParams, CourseFull, CourseLinks, ExtractionJob } from "../apis/types";

const CHIP_LIMIT = 6;

function FeeCard({
  fee,
  courses,
  linkedCourseIds,
  selected,
  busy,
  onToggleSelect,
  onEdit,
  onDelete,
  onLinkCourse,
  onUnlinkCourse,
  onSaveField,
}: Readonly<{
  fee: CourseFee;
  courses: CourseFull[];
  linkedCourseIds: string[];
  selected: boolean;
  busy: boolean;
  onToggleSelect: () => void;
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

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <Checkbox checked={selected} onCheckedChange={onToggleSelect} />
            {fee.student_type && <Badge className="text-xs capitalize">{fee.student_type}</Badge>}
            {fee.period_type && <Badge variant="outline" className="text-xs">{fee.period_type}</Badge>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="font-semibold">{fee.currency} {fee.total_amount ?? 0}</span>
            <Button variant="ghost" size="icon-sm" className="cursor-pointer" title="Edit fee" disabled={busy} onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost" size="icon-sm" className="cursor-pointer text-destructive hover:text-destructive"
              title="Delete fee" disabled={busy} onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
          <EditableField label="Fee Name" value={fee.name} onSave={(v) => onSaveField("name", v)} multiline />
          <EditableField label="Currency" value={fee.currency} onSave={(v) => onSaveField("currency", v)} />
          <EditableField label="Period Type" value={fee.period_type} onSave={(v) => onSaveField("period_type", v)} />
        </div>

        {fee.installments && fee.installments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {fee.installments.map((installment) => (
              <Badge key={installment.label} variant="secondary" className="text-[10px]">
                {installment.label}: {fee.currency} {installment.amount}
              </Badge>
            ))}
          </div>
        )}

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

export function FeesTab({
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
        allExtractionsApi.getCourses(jobId),
      ]);
      setLinks(courseLinks);
      setCourses(courseRows);
    } catch (e) {
      toast.error("Failed to load fees", { description: (e as Error).message });
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
  const fees = links?.course_fees ?? [];
  const allSelected = fees.length > 0 && selectedIds.length === fees.length;

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

  const handleCreate = (values: CourseFeeParams) =>
    run(async () => {
      await allExtractionsApi.createCourseFee({ job_id: jobId, ...values });
      setAdding(false);
    }, "Fee added");

  const handleUpdate = (id: string, values: CourseFeeParams) =>
    run(async () => {
      await allExtractionsApi.updateCourseFee(id, values);
      setEditingId(null);
    }, "Fee updated");

  const handleDelete = async (ids: string[]) => {
    const many = ids.length > 1;
    if (!(await confirm(many ? `Delete ${ids.length} fees?` : "Delete fee?"))) return;
    await run(async () => {
      await Promise.all(ids.map((id) => allExtractionsApi.deleteCourseFee(id)));
      setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
    }, many ? `${ids.length} fees deleted` : "Fee deleted");
  };

  // Which courses each fee is attached to, from the assignment rows.
  const coursesForFee = (feeId: string) =>
    (links?.fee_assignments ?? []).filter((a) => a.course_fee_id === feeId).map((a) => a.course_id);

  return (
    <div>
      {dialog}
      <StepActionBar
        jobId={jobId}
        step="enrichment"
        label="Fees"
        runLabel="Run Fees Extraction"
        progress={(job.pipeline_progress as Record<string, unknown> | null)?.enrichment}
        lastUpdated={latestTimestamp(fees)}
        hasData={fees.length > 0}
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
              onCheckedChange={() => setSelectedIds(allSelected ? [] : fees.map((f) => f.id))}
              disabled={fees.length === 0}
            />
            Select all ({fees.length})
          </label>
          {selectedIds.length > 0 && (
            <Button
              variant="destructive" size="sm" className="h-8 gap-1.5 cursor-pointer"
              disabled={saving} onClick={() => handleDelete(selectedIds)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete {selectedIds.length}
            </Button>
          )}
        </div>
        <Button className="gap-1.5 cursor-pointer" disabled={adding} onClick={() => { setAdding(true); setEditingId(null); }}>
          <Plus className="h-4 w-4" />
          Add Fee
        </Button>
      </div>

      <div className="space-y-3">
        {adding && <FeeForm saving={saving} onCancel={() => setAdding(false)} onSave={handleCreate} />}

        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && fees.length === 0 && !adding && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              <DollarSign className="mx-auto mb-3 h-8 w-8 opacity-40" />
              <p className="text-sm">No fees yet</p>
              <p className="mt-1 text-xs">Add one manually, or extract fees from a course in the Courses tab.</p>
            </CardContent>
          </Card>
        )}

        {fees.map((fee) =>
          editingId === fee.id ? (
            <FeeForm
              key={fee.id}
              fee={fee}
              saving={saving}
              onCancel={() => setEditingId(null)}
              onSave={(values) => handleUpdate(fee.id, values)}
            />
          ) : (
            <FeeCard
              key={fee.id}
              fee={fee}
              courses={courses}
              linkedCourseIds={coursesForFee(fee.id)}
              selected={selectedIds.includes(fee.id)}
              busy={saving}
              onToggleSelect={() =>
                setSelectedIds((prev) => (prev.includes(fee.id) ? prev.filter((x) => x !== fee.id) : [...prev, fee.id]))
              }
              onSaveField={(column, next) => saveField("extraction_course_fees", fee.id, column, next)}
              onEdit={() => { setEditingId(fee.id); setAdding(false); }}
              onDelete={() => handleDelete([fee.id])}
              onLinkCourse={(courseId) =>
                run(() => allExtractionsApi.assignJunction("course-fees", { job_id: jobId, course_id: courseId, entity_id: fee.id }), "Linked to course")
              }
              onUnlinkCourse={(courseId) =>
                run(() => allExtractionsApi.unassignJunction("course-fees", { job_id: jobId, course_id: courseId, entity_id: fee.id }), "Unlinked")
              }
            />
          ),
        )}
      </div>
    </div>
  );
}
