"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, DollarSign, Link2, Loader2, Pencil, Plus, Trash2, Type, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Pagination } from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import { allExtractionsApi } from "../apis";
import { feeAmount, latestTimestamp } from "../utils";
import { CourseLinkPicker } from "./course-link-picker";
import { EditableField, saveFormAndLearn, useFieldSaver, type EditableFieldProps } from "./editable-field";
import { FeeForm } from "./fee-form";
import { StepActionBar } from "./step-action-bar";
import { useConfirmDelete } from "./use-confirm-delete";
import type { CourseFee, CourseFeeParams, CourseLinks, ExtractionJob } from "../apis/types";

type LinkedCourse = { id: string; name: string | null };

const CHIP_LIMIT = 6;
const DEFAULT_PAGE_SIZE = 10;

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

function FeeCard({
  jobId,
  fee,
  linked,
  selected,
  busy,
  onToggleSelect,
  onEdit,
  onDelete,
  onLinkCourse,
  onUnlinkCourse,
  onSaveField,
}: Readonly<{
  jobId: string;
  fee: CourseFee;
  linked: LinkedCourse[];
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
  const visible = showAll ? linked : linked.slice(0, CHIP_LIMIT);

  return (
    <Card className="group overflow-hidden">
      <div className="-mt-4 flex items-center justify-between gap-2 rounded-t-xl border-b bg-primary/5 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <Checkbox checked={selected} onCheckedChange={onToggleSelect} />
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <DollarSign className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold text-foreground">{fee.name || "Unnamed fee"}</span>
          {fee.student_type && <Badge className="text-xs capitalize">{fee.student_type}</Badge>}
          {fee.period_type && <Badge variant="outline" className="text-xs">{fee.period_type}</Badge>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{feeAmount(fee)}</span>
          <Button
            variant="ghost" size="icon-sm" className="cursor-pointer opacity-0 transition-opacity group-hover:opacity-100"
            title="Edit fee" disabled={busy} onClick={onEdit}
          >
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

      <CardContent className="flex flex-col gap-3 p-4">
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          <Field icon={Type} label="Fee Name" value={fee.name} onSave={(v) => onSaveField("name", v)} multiline />
          <Field icon={DollarSign} label="Currency" value={fee.currency} onSave={(v) => onSaveField("currency", v)} />
          <Field icon={Clock} label="Period Type" value={fee.period_type} onSave={(v) => onSaveField("period_type", v)} />
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const fetchedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      setLinks(await allExtractionsApi.getCourseLinks(jobId));
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
  const totalPages = Math.max(1, Math.ceil(fees.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedFees = fees.slice((currentPage - 1) * pageSize, currentPage * pageSize);

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

  const handleUpdate = (fee: CourseFee, values: CourseFeeParams) =>
    run(async () => {
      await saveFormAndLearn("extraction_course_fees", fee, values, jobId);
      setEditingId(null);
    }, "Fee updated");

  const handleDelete = async (ids: string[]) => {
    const many = ids.length > 1;
    if (!(await confirm(many ? `Delete ${ids.length} fees?` : "Delete fee?"))) {
      return;
    }
    await run(async () => {
      await Promise.all(ids.map((id) => allExtractionsApi.deleteCourseFee(id)));
      setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
    }, many ? `${ids.length} fees deleted` : "Fee deleted");
  };

  const coursesForFee = (feeId: string): LinkedCourse[] =>
    (links?.fee_assignments ?? [])
      .filter((a) => a.course_fee_id === feeId)
      .map((a) => ({ id: a.course_id, name: a.course_name }));

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
        <Dialog open={adding} onOpenChange={setAdding}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl p-0 border-0 bg-transparent shadow-none">
            <FeeForm saving={saving} onCancel={() => setAdding(false)} onSave={handleCreate} />
          </DialogContent>
        </Dialog>

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

        {pagedFees.map((fee) =>
          editingId === fee.id ? (
            <FeeForm
              key={fee.id}
              fee={fee}
              saving={saving}
              onCancel={() => setEditingId(null)}
              onSave={(values) => handleUpdate(fee, values)}
            />
          ) : (
            <FeeCard
              key={fee.id}
              jobId={jobId}
              fee={fee}
              linked={coursesForFee(fee.id)}
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

      {fees.length > 0 && (
        <Pagination
          page={currentPage}
          total={fees.length}
          limit={pageSize}
          onPageChange={setPage}
          align="end"
          onPageSizeChange={setPageSize}
        />
      )}
    </div>
  );
}
