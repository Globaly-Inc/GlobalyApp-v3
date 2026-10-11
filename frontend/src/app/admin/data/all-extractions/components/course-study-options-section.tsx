"use client";

import { useState } from "react";
import { ChevronsUpDown, Clock, Link2, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { allExtractionsApi } from "../apis";
import { saveFormAndLearn } from "./editable-field";
import { StudyOptionForm } from "./study-option-form";
import { SharedCoursesBadge } from "./shared-courses-badge";
import type { useConfirmDelete } from "./use-confirm-delete";
import { humanize, type CourseSectionProps } from "./course-detail-shared";
import type { StudyOption } from "../apis/types";

export function CourseStudyOptionsSection({ course, links, jobId, busy, run, unlink, sharedWith, studyOptions, confirm }: Readonly<CourseSectionProps & { studyOptions: StudyOption[]; confirm: ReturnType<typeof useConfirmDelete>["confirm"] }>) {
  const [addingOption, setAddingOption] = useState(false);
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold">
          <Clock className="h-3.5 w-3.5 text-primary" />
          Study Options
        </h4>
        <Button
          variant="outline" size="sm" className="h-7 gap-1.5 text-xs cursor-pointer"
          disabled={busy} onClick={() => { setAddingOption(true); setEditingOptionId(null); }}
        >
          <Plus className="h-3 w-3" />
          Add study option
          <ChevronsUpDown className="h-3 w-3 opacity-50" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{studyOptions.length} option{studyOptions.length === 1 ? "" : "s"}</p>

      {addingOption && (
        <StudyOptionForm
          saving={busy}
          onCancel={() => setAddingOption(false)}
          onSave={async (values) => {
            setAddingOption(false);
            await run(async () => {
              const created = await allExtractionsApi.createStudyOption({ job_id: jobId, ...values } as never);
              await allExtractionsApi.assignJunction("study-options", { job_id: jobId, course_id: course.id, entity_id: created.id });
            }, "Study option added");
          }}
        />
      )}

      {studyOptions.map((option) => {
        const otherNames = sharedWith(links.study_option_assignments, "study_option_id", option.id);
        const otherCourses = otherNames.length;
        return editingOptionId === option.id ? (
          <StudyOptionForm
            key={option.id}
            option={option}
            saving={busy}
            onCancel={() => setEditingOptionId(null)}
            onSave={async (values) => {
              setEditingOptionId(null);
              await run(
                () => saveFormAndLearn("extraction_study_options", option, values, jobId),
                "Study option updated",
              );
            }}
          />
        ) : (
          <div key={option.id} className="flex items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
            <div className="flex min-w-0 items-start gap-2.5">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  {option.study_mode && (
                    <Badge className="text-xs capitalize">{humanize(option.study_mode)}</Badge>
                  )}
                  {option.study_load && (
                    <span className="text-xs capitalize text-foreground">{humanize(option.study_load)}</span>
                  )}
                  {option.applicable_to && (
                    <Badge variant="outline" className="text-xs capitalize">{humanize(option.applicable_to)}</Badge>
                  )}
                </div>
                {option.duration_value != null && (
                  <p className="mt-1 text-xs text-muted-foreground">{option.duration_value} {option.duration_unit}</p>
                )}
                <SharedCoursesBadge names={otherNames} prefix="Shared with " className="mt-1 block text-left" />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="icon-xs" className="cursor-pointer" title="Edit" disabled={busy} onClick={() => setEditingOptionId(option.id)}>
                <Pencil className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon-xs" className="cursor-pointer" title="Unlink" disabled={busy} onClick={() => unlink("study-options", option.id)}>
                <Link2 className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost" size="icon-xs" className="cursor-pointer text-destructive hover:text-destructive"
                title="Delete" disabled={busy}
                onClick={async () => {
                  const ok = await confirm(
                    "Delete study option?",
                    otherCourses > 0
                      ? `Shared with ${otherCourses} other course${otherCourses === 1 ? "" : "s"} — deleting it removes it from those too, not just this course.`
                      : "This can't be undone.",
                    { confirmLabel: "Delete", variant: "destructive" },
                  );
                  if (!ok) return;
                  run(() => allExtractionsApi.deleteStudyOption(option.id), "Study option deleted");
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
