"use client";

import { useState } from "react";
import { DollarSign, Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { allExtractionsApi } from "../apis";
import { feeAmount } from "../utils";
import { saveFormAndLearn } from "./editable-field";
import { FeeForm } from "./fee-form";
import { LinkSection } from "./link-section";
import { RowActors } from "./row-actors";
import { humanize, type CourseSectionProps } from "./course-detail-shared";
import type { CourseLinks } from "../apis/types";

export function CourseFeeSection({ course, links, jobId, busy, run, link, unlink, fees }: Readonly<CourseSectionProps & { fees: CourseLinks["course_fees"] }>) {
  const [addingFee, setAddingFee] = useState(false);
  const [editingFeeId, setEditingFeeId] = useState<string | null>(null);

  return (
    <LinkSection
      icon={DollarSign} title="Course Fee" junction="course-fees"
      // Only fees an admin marked "Save for reuse" are offered for linking; extracted and
      // one-off fees stay on their own course.
      linked={fees} available={links.course_fees.filter((f) => f.save_for_reuse)}
      labelOf={(f) => (f.name ? `${f.name} — ${feeAmount(f)}` : feeAmount(f))}
      descriptionOf={(f) => `${feeAmount(f)} · ${f.student_type ?? "both"}`}
      emptyText="No fees assigned" linkLabel="Link fee"
      busy={busy} onLink={link} onUnlink={unlink}
      headerExtra={
        <Button
          variant="outline" size="sm" className="h-7 gap-1.5 text-xs cursor-pointer"
          disabled={busy} onClick={() => setAddingFee((v) => !v)}
        >
          <Plus className="h-3 w-3" />
          Add fee
        </Button>
      }
      // Domestic and international sit side by side.
      renderRows={(rows, unlinkRow) =>
        rows.length === 0 && !addingFee ? (
          <p className="rounded-md bg-muted/50 py-2 text-center text-xs text-muted-foreground">No fees assigned</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {rows.map((fee) => editingFeeId === fee.id ? (
              <div key={fee.id} className="sm:col-span-2">
                <FeeForm
                  jobId={jobId}
                  fee={fee}
                  saving={busy}
                  onCancel={() => setEditingFeeId(null)}
                  onSave={(values) => {
                    setEditingFeeId(null);
                    run(() => saveFormAndLearn("extraction_course_fees", fee, values[0]!, jobId), "Fee updated");
                  }}
                />
              </div>
            ) : (
              <div key={fee.id} className="flex items-start justify-between gap-2 rounded-lg border border-border px-3 py-2">
                <span className="min-w-0">
                  <span className="block text-xs capitalize text-muted-foreground">{humanize(fee.student_type) || "Fee"}</span>
                  {fee.name && <span className="block truncate text-sm font-medium">{fee.name}</span>}
                  <span className="mt-0.5 inline-flex items-baseline gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-primary">
                    {fee.currency && <span className="text-xs font-semibold uppercase tracking-wide">{fee.currency}</span>}
                    <span className="text-sm font-semibold tabular-nums">{fee.total_amount ?? feeAmount(fee)}</span>
                  </span>
                  {fee.description && (
                    <span className="mt-1 block text-xs text-muted-foreground line-clamp-2" title={fee.description}>{fee.description}</span>
                  )}
                  <RowActors row={fee} className="mt-1" />
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="icon-xs" className="cursor-pointer" title="Edit" disabled={busy} onClick={() => setEditingFeeId(fee.id)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon-xs" className="cursor-pointer" title="Unlink" disabled={busy} onClick={() => unlinkRow(fee.id)}>
                    <X className="h-3 w-3" />
                  </Button>
                </span>
              </div>
            ))}
          </div>
        )
      }
    >
      {addingFee && (
        <FeeForm
          jobId={jobId}
          saving={busy}
          onCancel={() => setAddingFee(false)}
          onSave={(values) => {
            setAddingFee(false);
            run(async () => {
              // This course is always linked; the form's own course picker adds more.
              for (const v of values) {
                await allExtractionsApi.createCourseFee({
                  job_id: jobId, ...v, course_ids: [...new Set([course.id, ...(v.course_ids ?? [])])],
                });
              }
            }, values.length > 1 ? `${values.length} fees added` : "Fee added");
          }}
        />
      )}
    </LinkSection>
  );
}
