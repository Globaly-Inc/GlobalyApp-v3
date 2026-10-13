"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DollarSign, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Pagination } from "@/components/ui/pagination";
import { allExtractionsApi } from "../apis";
import { latestTimestamp } from "../utils";
import { saveFormAndLearn, useFieldSaver } from "./editable-field";
import { FeeForm } from "./fee-form";
import { StepActionBar } from "./step-action-bar";
import { useConfirmDelete } from "./use-confirm-delete";
import type { CourseFee, CourseFeeParams, CourseLinks, ExtractionJob } from "../apis/types";
import { FeeCard, type LinkedCourse } from "./fees-tab-card";

const DEFAULT_PAGE_SIZE = 10;

export function FeesTab({
  jobId,
  job,
  onReload,
}: Readonly<{
  jobId: string;
  job: ExtractionJob;
  onReload: () => void;
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
  // A fee added from a course without "Save this for future uses" belongs to that course only.
  // Extracted fees (no creator) are always listed — this tab is where they get edited.
  const fees = (links?.course_fees ?? []).filter((f) => f.save_for_reuse || f.created_by_platform_user_id == null);
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

  // The form hands back one fee, or two when domestic and international were filled together.
  const handleCreate = (values: CourseFeeParams[]) =>
    run(async () => {
      for (const v of values) await allExtractionsApi.createCourseFee({ job_id: jobId, ...v });
      setAdding(false);
    }, values.length > 1 ? `${values.length} fees added` : "Fee added");

  const handleUpdate = (fee: CourseFee, values: CourseFeeParams[]) =>
    run(async () => {
      await saveFormAndLearn("extraction_course_fees", fee, values[0]!, jobId);
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
        onChanged={onReload}
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
            <FeeForm jobId={jobId} saving={saving} onCancel={() => setAdding(false)} onSave={handleCreate} />
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
              jobId={jobId}
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
