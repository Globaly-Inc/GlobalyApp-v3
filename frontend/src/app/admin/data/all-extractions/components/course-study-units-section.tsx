"use client";

import { useState } from "react";
import { BookMarked } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { allExtractionsApi } from "../apis";
import { saveFormAndLearn } from "./editable-field";
import { StudyUnitForm } from "./study-unit-form";
import { LinkSection } from "./link-section";
import { SharedCoursesBadge } from "./shared-courses-badge";
import { addButton, rowActions, type CourseSectionProps } from "./course-detail-shared";
import type { CourseLinks } from "../apis/types";

export function CourseStudyUnitsSection({ links, jobId, busy, run, createAndLink, link, unlink, sharedWith, units }: Readonly<CourseSectionProps & { units: CourseLinks["study_units"] }>) {
  const [addingUnit, setAddingUnit] = useState(false);
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  // Units with no credit points add nothing; the badge is hidden when none have any.
  const totalCredits = units.reduce((sum, u) => sum + (u.credit_points ?? 0), 0);

  return (
    <LinkSection
      icon={BookMarked} title="Study Units" junction="study-units"
      linked={units} available={links.study_units}
      labelOf={(u) => u.unit_name}
      descriptionOf={(u) => [u.unit_code, u.unit_type, u.credit_points ? `${u.credit_points} CP` : null].filter(Boolean).join(" · ")}
      emptyText="No study units" linkLabel="Link unit"
      busy={busy} onLink={link} onUnlink={unlink}
      headerExtra={
        <span className="flex items-center gap-2">
          {totalCredits > 0 && <Badge className="bg-primary/10 text-xs text-primary">Total {totalCredits} CP</Badge>}
          {addButton(busy, () => setAddingUnit((v) => !v), "Add unit")}
        </span>
      }
      // Code chip before the name, credit points chip on the right.
      renderRows={(rows, unlinkRow) =>
        rows.length === 0 && !addingUnit ? (
          <p className="rounded-md bg-muted/50 py-2 text-center text-xs text-muted-foreground">No study units</p>
        ) : (
          rows.map((unit) => {
            if (editingUnitId === unit.id) {
              return (
                <StudyUnitForm
                  key={unit.id}
                  unit={unit}
                  saving={busy}
                  onCancel={() => setEditingUnitId(null)}
                  onSave={async (values) => {
                    const ok = await run(() => saveFormAndLearn("extraction_study_units", unit, values, jobId), "Study unit updated");
                    if (ok) setEditingUnitId(null);
                  }}
                />
              );
            }
            const otherNames = sharedWith(links.study_unit_assignments, "study_unit_id", unit.id);
            return (
              <div key={unit.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5">
                <span className="flex min-w-0 items-center gap-2">
                  {unit.unit_code && <Badge variant="outline" className="shrink-0 text-xs">{unit.unit_code}</Badge>}
                  <span className="truncate text-sm">{unit.unit_name}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <SharedCoursesBadge names={otherNames} />
                  {unit.credit_points != null && (
                    <Badge className="bg-primary/10 text-xs text-primary">{unit.credit_points} CP</Badge>
                  )}
                  {rowActions(busy, () => setEditingUnitId(unit.id), () => unlinkRow(unit.id))}
                </span>
              </div>
            );
          })
        )
      }
    >
      {addingUnit && (
        <StudyUnitForm
          saving={busy}
          onCancel={() => setAddingUnit(false)}
          onSave={async (values) => {
            const ok = await createAndLink("study-units", () => allExtractionsApi.createStudyUnit({ job_id: jobId, ...values }), "Study unit added");
            if (ok) setAddingUnit(false);
          }}
        />
      )}
    </LinkSection>
  );
}
