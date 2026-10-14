"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { allExtractionsApi } from "../apis";
import { saveFormAndLearn } from "./editable-field";
import { EligibilityForm } from "./eligibility-form";
import { LinkSection } from "./link-section";
import { SharedCoursesBadge } from "./shared-courses-badge";
import { addButton, humanize, rowActions, type CourseSectionProps } from "./course-detail-shared";
import type { CourseLinks } from "../apis/types";

export function CourseEligibilitySection({ links, jobId, busy, run, createAndLink, link, unlink, sharedWith, eligibility }: Readonly<CourseSectionProps & { eligibility: CourseLinks["eligibility_requirements"] }>) {
  const [addingEligibility, setAddingEligibility] = useState(false);
  const [editingEligibilityId, setEditingEligibilityId] = useState<string | null>(null);

  return (
    <LinkSection
      icon={ShieldCheck} title="Eligibility" junction="eligibility-requirements"
      linked={eligibility} available={links.eligibility_requirements}
      labelOf={(e) => e.name ?? "Requirement"}
      emptyText="No eligibility requirements" linkLabel="Link requirement"
      busy={busy} onLink={link} onUnlink={unlink}
      headerExtra={addButton(busy, () => setAddingEligibility((v) => !v), "Add requirement")}
      renderRows={(rows, unlinkRow) =>
        rows.length === 0 && !addingEligibility ? (
          <p className="rounded-md bg-muted/50 py-2 text-center text-xs text-muted-foreground">No eligibility requirements</p>
        ) : (
          rows.map((req) => {
            if (editingEligibilityId === req.id) {
              return (
                <EligibilityForm
                  key={req.id}
                  requirement={req}
                  saving={busy}
                  onCancel={() => setEditingEligibilityId(null)}
                  onSave={async (values) => {
                    const ok = await run(
                      () => saveFormAndLearn("extraction_eligibility_requirements", req, values, jobId),
                      "Eligibility requirement updated",
                    );
                    if (ok) setEditingEligibilityId(null);
                  }}
                />
              );
            }
            const otherNames = sharedWith(links.eligibility_assignments, "eligibility_requirement_id", req.id);
            return (
              <div key={req.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-sm">
                <span className="flex min-w-0 items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{req.name ?? "Requirement"}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <SharedCoursesBadge names={otherNames} />
                  {humanize(req.applicable_to) && <span className="text-xs text-muted-foreground">{humanize(req.applicable_to)}</span>}
                  {rowActions(busy, () => setEditingEligibilityId(req.id), () => unlinkRow(req.id))}
                </span>
              </div>
            );
          })
        )
      }
    >
      {addingEligibility && (
        <EligibilityForm
          saving={busy}
          onCancel={() => setAddingEligibility(false)}
          onSave={async (values) => {
            const ok = await createAndLink(
              "eligibility-requirements",
              () => allExtractionsApi.createEligibilityRequirement({ job_id: jobId, ...values }),
              "Eligibility requirement added",
            );
            if (ok) setAddingEligibility(false);
          }}
        />
      )}
    </LinkSection>
  );
}
