"use client";

import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BookMarked, Building2, CalendarDays, CheckCircle2, ChevronsUpDown, Clock, DollarSign, ExternalLink, Flag, Link2,
  Loader2, Pencil, Plus, ShieldCheck, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RowActors } from "./row-actors";
import { Combobox } from "@/components/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LookupCombobox } from "@/components/lookup-combobox";
import { Textarea } from "@/components/ui/textarea";
import { allExtractionsApi } from "../apis";
import { AccreditationForm } from "./accreditation-form";
import { BranchForm, type BranchValues } from "./branch-form";
import { saveFormAndLearn } from "./editable-field";
import { EligibilityForm } from "./eligibility-form";
import { FeeForm } from "./fee-form";
import { IntakeForm } from "./intake-form";
import { StudyOptionForm } from "./study-option-form";
import { StudyUnitForm } from "./study-unit-form";
import { useConfirmDelete } from "./use-confirm-delete";
import { SharedCoursesBadge, otherCourseNames } from "./shared-courses-badge";
import { feeAmount } from "../utils";
import type {
  CampusFull, CourseAssignment, CourseFull, CourseLinks, JunctionSlug, StudyOption,
} from "../apis/types";

const humanize = (v: string | null | undefined) => (v ? v.replaceAll("_", " ") : "");


/** One linkable section: the rows already attached to this course + a picker to attach more. */
function LinkSection<T extends { id: string }>({
  icon: Icon,
  title,
  junction,
  linked,
  available,
  labelOf,
  descriptionOf,
  metaOf,
  emptyText,
  linkLabel,
  busy,
  onLink,
  onUnlink,
  onCreate,
  searchPlaceholder,
  optionsHeading,
  renderRows,
  rowIcon,
  children,
  headerExtra,
}: Readonly<{
  icon: LucideIcon;
  title: string;
  junction: JunctionSlug;
  linked: T[];
  available: T[];
  labelOf: (item: T) => string;
  descriptionOf?: (item: T) => string | undefined;
  metaOf?: (item: T) => string | null;
  emptyText: string;
  linkLabel: string;
  busy: boolean;
  onLink: (junction: JunctionSlug, entityId: string) => void;
  onUnlink: (junction: JunctionSlug, entityId: string) => void;
  /** Set to allow typing a brand-new entity name in the picker. */
  onCreate?: (name: string) => void;
  searchPlaceholder?: string;
  optionsHeading?: string;
  /** Replaces the default row list — used where the design wants a custom layout. */
  renderRows?: (linked: T[], unlink: (id: string) => void) => React.ReactNode;
  rowIcon?: LucideIcon;
  children?: React.ReactNode;
  headerExtra?: React.ReactNode;
}>) {
  const [picking, setPicking] = useState(false);
  const unlinked = available.filter((a) => !linked.some((l) => l.id === a.id));
  const RowIcon = rowIcon ?? Icon;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold">
          <Icon className="h-3.5 w-3.5 text-primary" />
          {title}
        </h4>
        <div className="flex items-center gap-1.5">
          {headerExtra}
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs cursor-pointer"
            disabled={busy}
            onClick={() => setPicking((p) => !p)}
          >
            <Link2 className="h-3 w-3" />
            {linkLabel}
          </Button>
        </div>
      </div>

      {picking && (
        <Combobox
          options={unlinked.map((a) => ({ value: a.id, label: labelOf(a), description: descriptionOf?.(a) }))}
          value=""
          onChange={(picked) => {
            setPicking(false);
            // With `creatable` the combobox hands back raw text when nothing matched.
            if (unlinked.some((a) => a.id === picked)) onLink(junction, picked);
            else onCreate?.(picked);
          }}
          placeholder={unlinked.length || onCreate ? `Select ${title.toLowerCase()}…` : "Nothing left to link"}
          searchPlaceholder={searchPlaceholder}
          optionsHeading={optionsHeading}
          creatable={Boolean(onCreate)}
          disabled={unlinked.length === 0 && !onCreate}
          className="h-8 text-xs"
        />
      )}

      {children}

      {renderRows ? (
        renderRows(linked, (id) => onUnlink(junction, id))
      ) : linked.length === 0 && !children ? (
        <p className="rounded-md bg-muted/50 py-2 text-center text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        linked.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-sm">
            <span className="flex min-w-0 items-center gap-1.5">
              <RowIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{labelOf(item)}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {metaOf?.(item) && <span className="text-xs text-muted-foreground">{metaOf(item)}</span>}
              <Button
                variant="ghost"
                size="icon-xs"
                className="cursor-pointer"
                title="Unlink"
                disabled={busy}
                onClick={() => onUnlink(junction, item.id)}
              >
                <X className="h-3 w-3" />
              </Button>
            </span>
          </div>
        ))
      )}
    </section>
  );
}

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
  const [editingDescription, setEditingDescription] = useState(false);
  const [description, setDescription] = useState(course.description ?? "");
  const [addingOption, setAddingOption] = useState(false);
  const [addingFee, setAddingFee] = useState(false);
  const [addingIntake, setAddingIntake] = useState(false);
  const [addingUnit, setAddingUnit] = useState(false);
  const [addingEligibility, setAddingEligibility] = useState(false);
  const [addingAccreditation, setAddingAccreditation] = useState(false);
  const [addingBranch, setAddingBranch] = useState(false);
  const [editingFeeId, setEditingFeeId] = useState<string | null>(null);
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [editingIntakeId, setEditingIntakeId] = useState<string | null>(null);
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [editingEligibilityId, setEditingEligibilityId] = useState<string | null>(null);
  const [editingAccreditationId, setEditingAccreditationId] = useState<string | null>(null);
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirmDelete();

  // Re-seed when a different course is selected, or after a save round-trips.
  useEffect(() => {
    setDescription(course.description ?? "");
    setEditingDescription(false);
  }, [course]);


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

  const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "");

  // Empty strings would overwrite extracted values with blanks — send nulls instead.
  const toPatch = (v: BranchValues) =>
    Object.fromEntries(Object.entries(v).map(([k, value]) => [k, value.trim() || null]));

  const addButton = (onClick: () => void, label: string) => (
    <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs cursor-pointer" disabled={busy} onClick={onClick}>
      <Plus className="h-3 w-3" />
      {label}
    </Button>
  );

  const rowActions = (onEdit: () => void, onUnlinkClick: () => void) => (
    <>
      <Button variant="ghost" size="icon-xs" className="cursor-pointer" title="Edit" disabled={busy} onClick={onEdit}>
        <Pencil className="h-3 w-3" />
      </Button>
      <Button variant="ghost" size="icon-xs" className="cursor-pointer" title="Unlink" disabled={busy} onClick={onUnlinkClick}>
        <X className="h-3 w-3" />
      </Button>
    </>
  );

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold break-words">{course.name}</h3>
            {course.source_url && (
              <a
                href={course.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Source
              </a>
            )}
            <RowActors row={course} className="mt-1" />
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {course.verification_status && course.verification_status !== "unverified" && (
              <Badge variant="outline" className="text-[10px] capitalize">{humanize(course.verification_status)}</Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs cursor-pointer"
              disabled={busy || course.verification_status === "confirmed"}
              onClick={() => run(() => allExtractionsApi.approveCourse(course.id), "Course approved")}
            >
              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
              Approve
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs text-destructive cursor-pointer"
              disabled={busy || course.verification_status === "flagged"}
              onClick={() => run(() => allExtractionsApi.rejectCourse(course.id), "Course flagged")}
            >
              <Flag className="h-3 w-3" />
              Flag
            </Button>
            <Button variant="ghost" size="icon-sm" className="cursor-pointer" title="Close" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Each field writes its own column as soon as it changes — no separate save step. */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Degree level</Label>
            {/* Closed platform lists (2026-09-08): a course may only be linked to a level/area that
                already exists, so neither picker can create one. The server re-derives the link
                codes from what's picked. */}
            <LookupCombobox
              kind="degree-levels"
              value={course.degree_level ?? ""}
              onChange={(v) => patchCourse({ degree_level: v || null })}
              placeholder="Select degree level"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Subject area</Label>
            {/* Bound to the LINK, not to `subject_area` — that column holds the page's own wording
                ("Civil Engineering"), which is never one of the 14 options, so the picker rendered
                blank on a correctly linked course. */}
            <LookupCombobox
              kind="areas-of-study"
              by="slug"
              value={course.subject_area_code ?? ""}
              onChange={(v) => patchCourse({ subject_area_code: v || null })}
              placeholder="Select subject area"
            />
            {course.subject_area && (
              <p className="text-xs text-muted-foreground">Extracted as “{course.subject_area}”</p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Description</Label>
          {editingDescription ? (
            <Textarea
              autoFocus
              value={description}
              rows={4}
              placeholder="Add a description…"
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => {
                setEditingDescription(false);
                if (description.trim() !== (course.description ?? "")) {
                  patchCourse({ description: description.trim() || null });
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="group/desc flex w-full items-start justify-between gap-3 rounded-md p-2 text-left text-sm transition-colors cursor-pointer hover:bg-muted/60"
              onClick={() => setEditingDescription(true)}
            >
              <span>{course.description || <span className="italic text-muted-foreground">Add a description…</span>}</span>
              <Pencil className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/desc:opacity-100" />
            </button>
          )}
        </div>

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
                        {fee.currency && <span className="text-[10px] font-semibold uppercase tracking-wide">{fee.currency}</span>}
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

        <LinkSection
          icon={CalendarDays} title="Intakes" junction="intakes"
          linked={intakes} available={links.intakes}
          labelOf={(i) => i.intake_name ?? "Intake"}
          emptyText="No intakes" linkLabel="Link intake"
          busy={busy} onLink={link} onUnlink={unlink}
          headerExtra={addButton(() => setAddingIntake((v) => !v), "Add intake")}
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
                      {rowActions(() => setEditingIntakeId(intake.id), () => unlinkRow(intake.id))}
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

        <LinkSection
          icon={BookMarked} title="Study Units" junction="study-units"
          linked={units} available={links.study_units}
          labelOf={(u) => u.unit_name}
          descriptionOf={(u) => [u.unit_code, u.unit_type, u.credit_points ? `${u.credit_points} CP` : null].filter(Boolean).join(" · ")}
          emptyText="No study units" linkLabel="Link unit"
          busy={busy} onLink={link} onUnlink={unlink}
          headerExtra={addButton(() => setAddingUnit((v) => !v), "Add unit")}
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
                      {unit.unit_code && <Badge variant="outline" className="shrink-0 text-[10px]">{unit.unit_code}</Badge>}
                      <span className="truncate text-sm">{unit.unit_name}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <SharedCoursesBadge names={otherNames} />
                      {unit.credit_points != null && (
                        <Badge className="bg-primary/10 text-[10px] text-primary">{unit.credit_points} CP</Badge>
                      )}
                      {rowActions(() => setEditingUnitId(unit.id), () => unlinkRow(unit.id))}
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

        <LinkSection
          icon={ShieldCheck} title="Eligibility" junction="eligibility-requirements"
          linked={eligibility} available={links.eligibility_requirements}
          labelOf={(e) => e.name ?? "Requirement"}
          emptyText="No eligibility requirements" linkLabel="Link requirement"
          busy={busy} onLink={link} onUnlink={unlink}
          headerExtra={addButton(() => setAddingEligibility((v) => !v), "Add requirement")}
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
                      {rowActions(() => setEditingEligibilityId(req.id), () => unlinkRow(req.id))}
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

        <LinkSection
          icon={ShieldCheck} title="Accreditations" junction="accreditations"
          linked={accreditations} available={links.accreditations}
          labelOf={(a) => a.name}
          emptyText="No accreditations" linkLabel="Link accreditation"
          busy={busy} onLink={link} onUnlink={unlink}
          headerExtra={addButton(() => setAddingAccreditation((v) => !v), "Add accreditation")}
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
                      {rowActions(() => setEditingAccreditationId(a.id), () => unlinkRow(a.id))}
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

        {/* Unlike the sections above, Study Options never offers to link an existing one —
            it always creates fresh. */}
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
                        <Badge className="text-[10px] capitalize">{humanize(option.study_mode)}</Badge>
                      )}
                      {option.study_load && (
                        <span className="text-xs capitalize text-foreground">{humanize(option.study_load)}</span>
                      )}
                      {option.applicable_to && (
                        <Badge variant="outline" className="text-[10px] capitalize">{humanize(option.applicable_to)}</Badge>
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

        <LinkSection
          icon={Building2} title="Branches" junction="campuses"
          linked={branches} available={campuses}
          labelOf={(c) => c.name ?? "Campus"}
          emptyText="No branches" linkLabel="Link branch"
          busy={busy} onLink={link} onUnlink={unlink}
          headerExtra={addButton(() => setAddingBranch((v) => !v), "Add branch")}
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
                      {rowActions(() => setEditingBranchId(c.id), () => unlinkRow(c.id))}
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
      </CardContent>
      {confirmDialog}
    </Card>
  );
}
