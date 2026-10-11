"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { allExtractionsApi } from "../apis";
import { useConfirmDelete } from "./use-confirm-delete";
import { otherCourseNames } from "./shared-courses-badge";
import { CourseDetailHeader } from "./course-detail-header";
import { CourseDetailFields } from "./course-detail-fields";
import { CourseFeeSection } from "./course-fee-section";
import { CourseIntakesSection } from "./course-intakes-section";
import { CourseStudyUnitsSection } from "./course-study-units-section";
import { CourseEligibilitySection } from "./course-eligibility-section";
import { CourseAccreditationsSection } from "./course-accreditations-section";
import { CourseStudyOptionsSection } from "./course-study-options-section";
import { CourseBranchesSection } from "./course-branches-section";
import type {
  CampusFull, CourseAssignment, CourseFull, CourseLinks, JunctionSlug,
} from "../apis/types";

export function CourseDetailPanel({
  course,
  links,
  campuses,
  jobId,
  onClose,
  onChanged,
}: Readonly<{
  course: CourseFull;
  links: CourseLinks;
  campuses: CampusFull[];
  jobId: string;
  onClose: () => void;
  onChanged: () => void | Promise<unknown>;
}>) {
  const [busy, setBusy] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirmDelete();

  // Awaits onChanged (the parent's refetch) before resolving, and reports success so a caller
  // that closes its own inline edit form on success — not eagerly — never shows a row that
  // still has the pre-edit data for the gap between the save and the refetch landing.
  const run = async (action: () => Promise<unknown>, success: string): Promise<boolean> => {
    setBusy(true);
    try {
      try {
        await action();
      } catch (e) {
        toast.error("Action failed", { description: (e as Error).message });
        return false;
      }
      try {
        await onChanged();
        toast.success(success);
      } catch (e) {
        toast.warning(`${success} — but the list failed to refresh`, { description: (e as Error).message });
      }
      return true;
    } finally {
      setBusy(false);
    }
  };

  // save-and-learn, not a plain PATCH: a reviewer correcting the same field twice on a
  // domain is what creates an AI Memory lesson. Courses are where most corrections happen,
  // so a plain PATCH here left the learning loop effectively switched off.
  const patchCourse = (patch: Record<string, unknown>) =>
    run(
      () => allExtractionsApi.saveAndLearn({
        table: "extraction_courses",
        id: course.id,
        patch,
        job_id: jobId,
        source_url: course.source_url ?? undefined,
      }),
      "Course updated",
    );

  const link = (junction: JunctionSlug, entityId: string) =>
    run(() => allExtractionsApi.assignJunction(junction, { job_id: jobId, course_id: course.id, entity_id: entityId }), "Linked");

  const unlink = (junction: JunctionSlug, entityId: string) =>
    run(() => allExtractionsApi.unassignJunction(junction, { job_id: jobId, course_id: course.id, entity_id: entityId }), "Unlinked");

  const createAndLink = async (
    junction: JunctionSlug,
    create: () => Promise<{ id: string }>,
    success: string,
  ): Promise<boolean> => {
    setBusy(true);
    try {
      let created: { id: string };
      try {
        created = await create();
      } catch (createErr) {
        toast.error("Action failed", { description: (createErr as Error).message });
        return false;
      }

      try {
        await allExtractionsApi.assignJunction(junction, { job_id: jobId, course_id: course.id, entity_id: created.id });
      } catch (linkErr) {
        try {
          await onChanged();
        } catch {
          // ignored
        }
        toast.error("Created, but linking to this course failed", {
          description: `${(linkErr as Error).message} — find it in "Link" and add it manually.`,
        });
        return false;
      }
      try {
        await onChanged();
        toast.success(success);
      } catch (refreshErr) {
        toast.warning(`${success} — but the list failed to refresh`, { description: (refreshErr as Error).message });
      }
      return true;
    } finally {
      setBusy(false);
    }
  };

  const idsFor = (rows: CourseAssignment[], column: string) =>
    new Set(rows.filter((r) => r.course_id === course.id).map((r) => r[column]).filter((v): v is string => Boolean(v)));

  const pick = <T extends { id: string }>(all: T[], ids: Set<string>) => all.filter((e) => ids.has(e.id));

  // Study units/options are shared rows across courses — surfaced so unlinking/editing one
  // doesn't read as exclusive to this course.
  const sharedWith = (rows: CourseAssignment[], column: string, entityId: string) => otherCourseNames(rows, column, entityId, course.id);

  const fees = pick(links.course_fees, idsFor(links.fee_assignments, "course_fee_id"));
  const intakes = pick(links.intakes, idsFor(links.intake_assignments, "intake_id"));
  const units = pick(links.study_units, idsFor(links.study_unit_assignments, "study_unit_id"));
  const eligibility = pick(links.eligibility_requirements, idsFor(links.eligibility_assignments, "eligibility_requirement_id"));
  const accreditations = pick(links.accreditations, idsFor(links.accreditation_assignments, "extraction_accreditation_id"));
  const studyOptions = pick(links.study_options, idsFor(links.study_option_assignments, "study_option_id"));
  const branches = pick(campuses, idsFor(links.course_campuses, "campus_id"));

  const section = { course, links, jobId, busy, run, createAndLink, link, unlink, sharedWith };

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 p-4">
        <CourseDetailHeader course={course} busy={busy} run={run} onClose={onClose} />

        {/* Each field writes its own column as soon as it changes — no separate save step. */}
        <CourseDetailFields course={course} patchCourse={patchCourse} />

        <CourseFeeSection {...section} fees={fees} />
        <CourseIntakesSection {...section} intakes={intakes} />
        <CourseStudyUnitsSection {...section} units={units} />
        <CourseEligibilitySection {...section} eligibility={eligibility} />
        <CourseAccreditationsSection {...section} accreditations={accreditations} />

        {/* Unlike the sections above, Study Options never offers to link an existing one —
            it always creates fresh. */}
        <CourseStudyOptionsSection {...section} studyOptions={studyOptions} confirm={confirm} />

        <CourseBranchesSection {...section} branches={branches} campuses={campuses} />
      </CardContent>
      {confirmDialog}
    </Card>
  );
}
