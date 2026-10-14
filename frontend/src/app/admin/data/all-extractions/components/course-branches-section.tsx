"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";
import { allExtractionsApi } from "../apis";
import { BranchForm, type BranchValues } from "./branch-form";
import { saveFormAndLearn } from "./editable-field";
import { LinkSection } from "./link-section";
import { SharedCoursesBadge } from "./shared-courses-badge";
import { addButton, rowActions, type CourseSectionProps } from "./course-detail-shared";
import type { CampusFull } from "../apis/types";

// Empty strings would overwrite extracted values with blanks — send nulls instead.
const toPatch = (v: BranchValues) =>
  Object.fromEntries(Object.entries(v).map(([k, value]) => [k, value.trim() || null]));

export function CourseBranchesSection({ links, jobId, busy, run, createAndLink, link, unlink, sharedWith, branches, campuses }: Readonly<CourseSectionProps & { branches: CampusFull[]; campuses: CampusFull[] }>) {
  const [addingBranch, setAddingBranch] = useState(false);
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);

  return (
    <LinkSection
      icon={Building2} title="Branches" junction="campuses"
      linked={branches} available={campuses}
      labelOf={(c) => c.name ?? "Campus"}
      emptyText="No branches" linkLabel="Link branch"
      busy={busy} onLink={link} onUnlink={unlink}
      headerExtra={addButton(busy, () => setAddingBranch((v) => !v), "Add branch")}
      renderRows={(rows, unlinkRow) =>
        rows.length === 0 && !addingBranch ? (
          <p className="rounded-md bg-muted/50 py-2 text-center text-xs text-muted-foreground">No branches</p>
        ) : (
          rows.map((c) => {
            if (editingBranchId === c.id) {
              return (
                <BranchForm
                  key={c.id}
                  branch={c}
                  saving={busy}
                  onCancel={() => setEditingBranchId(null)}
                  onSave={async (values) => {
                    const ok = await run(() => saveFormAndLearn("extraction_campuses", c, toPatch(values), jobId), "Branch updated");
                    if (ok) setEditingBranchId(null);
                  }}
                />
              );
            }
            const otherNames = sharedWith(links.course_campuses, "campus_id", c.id);
            return (
              <div key={c.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-sm">
                <span className="flex min-w-0 items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{c.name ?? "Campus"}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <SharedCoursesBadge names={otherNames} />
                  {[c.city, c.country].filter(Boolean).join(", ") && (
                    <span className="text-xs text-muted-foreground">{[c.city, c.country].filter(Boolean).join(", ")}</span>
                  )}
                  {rowActions(busy, () => setEditingBranchId(c.id), () => unlinkRow(c.id))}
                </span>
              </div>
            );
          })
        )
      }
    >
      {addingBranch && (
        <BranchForm
          saving={busy}
          onCancel={() => setAddingBranch(false)}
          onSave={async (values) => {
            const ok = await createAndLink("campuses", () => allExtractionsApi.createCampus({ job_id: jobId, ...toPatch(values) }), "Branch added");
            if (ok) setAddingBranch(false);
          }}
        />
      )}
    </LinkSection>
  );
}
