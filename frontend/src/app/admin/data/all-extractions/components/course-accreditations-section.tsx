"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { allExtractionsApi } from "../apis";
import { AccreditationForm } from "./accreditation-form";
import { saveFormAndLearn } from "./editable-field";
import { LinkSection } from "./link-section";
import { SharedCoursesBadge } from "./shared-courses-badge";
import { addButton, rowActions, type CourseSectionProps } from "./course-detail-shared";
import type { CourseLinks } from "../apis/types";

export function CourseAccreditationsSection({ links, jobId, busy, run, createAndLink, link, unlink, sharedWith, accreditations }: Readonly<CourseSectionProps & { accreditations: CourseLinks["accreditations"] }>) {
  const [addingAccreditation, setAddingAccreditation] = useState(false);
  const [editingAccreditationId, setEditingAccreditationId] = useState<string | null>(null);

  return (
    <LinkSection
      icon={ShieldCheck} title="Accreditations" junction="accreditations"
      linked={accreditations} available={links.accreditations}
      labelOf={(a) => a.name}
      emptyText="No accreditations" linkLabel="Link accreditation"
      busy={busy} onLink={link} onUnlink={unlink}
      headerExtra={addButton(busy, () => setAddingAccreditation((v) => !v), "Add accreditation")}
      renderRows={(rows, unlinkRow) =>
        rows.length === 0 && !addingAccreditation ? (
          <p className="rounded-md bg-muted/50 py-2 text-center text-xs text-muted-foreground">No accreditations</p>
        ) : (
          rows.map((a) => {
            if (editingAccreditationId === a.id) {
              return (
                <AccreditationForm
                  key={a.id}
                  accreditation={a}
                  saving={busy}
                  onCancel={() => setEditingAccreditationId(null)}
                  onSave={async (values) => {
                    const ok = await run(() => saveFormAndLearn("extraction_accreditations", a, values, jobId), "Accreditation updated");
                    if (ok) setEditingAccreditationId(null);
                  }}
                />
              );
            }
            const otherNames = sharedWith(links.accreditation_assignments, "extraction_accreditation_id", a.id);
            return (
              <div key={a.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-sm">
                <span className="flex min-w-0 items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{a.name}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <SharedCoursesBadge names={otherNames} />
                  {a.issuing_organization && <span className="text-xs text-muted-foreground">{a.issuing_organization}</span>}
                  {rowActions(busy, () => setEditingAccreditationId(a.id), () => unlinkRow(a.id))}
                </span>
              </div>
            );
          })
        )
      }
    >
      {addingAccreditation && (
        <AccreditationForm
          saving={busy}
          onCancel={() => setAddingAccreditation(false)}
          onSave={async (values) => {
            const ok = await createAndLink("accreditations", () => allExtractionsApi.createAccreditation({ job_id: jobId, ...values }), "Accreditation added");
            if (ok) setAddingAccreditation(false);
          }}
        />
      )}
    </LinkSection>
  );
}
