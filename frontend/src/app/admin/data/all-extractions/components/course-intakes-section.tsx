"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { allExtractionsApi } from "../apis";
import { saveFormAndLearn } from "./editable-field";
import { IntakeForm } from "./intake-form";
import { LinkSection } from "./link-section";
import { SharedCoursesBadge } from "./shared-courses-badge";
import { addButton, fmtDate, rowActions, type CourseSectionProps } from "./course-detail-shared";
import type { CourseLinks } from "../apis/types";

export function CourseIntakesSection({ links, jobId, busy, run, createAndLink, link, unlink, sharedWith, intakes }: Readonly<CourseSectionProps & { intakes: CourseLinks["intakes"] }>) {
  const [addingIntake, setAddingIntake] = useState(false);
  const [editingIntakeId, setEditingIntakeId] = useState<string | null>(null);

  return (
    <LinkSection
      icon={CalendarDays} title="Intakes" junction="intakes"
      linked={intakes} available={links.intakes}
      labelOf={(i) => i.intake_name ?? "Intake"}
      emptyText="No intakes" linkLabel="Link intake"
      busy={busy} onLink={link} onUnlink={unlink}
      headerExtra={addButton(busy, () => setAddingIntake((v) => !v), "Add intake")}
      renderRows={(rows, unlinkRow) =>
        rows.length === 0 && !addingIntake ? (
          <p className="rounded-md bg-muted/50 py-2 text-center text-xs text-muted-foreground">No intakes</p>
        ) : (
          rows.map((intake) => {
            if (editingIntakeId === intake.id) {
              return (
                <IntakeForm
                  key={intake.id}
                  intake={intake}
                  saving={busy}
                  onCancel={() => setEditingIntakeId(null)}
                  onSave={async (values) => {
                    const ok = await run(() => saveFormAndLearn("extraction_intakes", intake, values, jobId), "Intake updated");
                    if (ok) setEditingIntakeId(null);
                  }}
                />
              );
            }
            const otherNames = sharedWith(links.intake_assignments, "intake_id", intake.id);
            return (
              <div key={intake.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-sm">
                <span className="flex min-w-0 items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{intake.intake_name ?? "Intake"}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <SharedCoursesBadge names={otherNames} />
                  {[fmtDate(intake.start_date), fmtDate(intake.end_date)].filter(Boolean).join(" → ") && (
                    <span className="text-xs text-muted-foreground">
                      {[fmtDate(intake.start_date), fmtDate(intake.end_date)].filter(Boolean).join(" → ")}
                    </span>
                  )}
                  {rowActions(busy, () => setEditingIntakeId(intake.id), () => unlinkRow(intake.id))}
                </span>
              </div>
            );
          })
        )
      }
    >
      {addingIntake && (
        <IntakeForm
          saving={busy}
          onCancel={() => setAddingIntake(false)}
          onSave={async (values) => {
            const ok = await createAndLink("intakes", () => allExtractionsApi.createIntake({ job_id: jobId, ...values }), "Intake added");
            if (ok) setAddingIntake(false);
          }}
        />
      )}
    </LinkSection>
  );
}
