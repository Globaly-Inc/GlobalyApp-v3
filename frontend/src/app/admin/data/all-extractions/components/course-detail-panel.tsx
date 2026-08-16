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
import { Combobox } from "@/components/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { categoriesApi } from "@/app/admin/platform/categories/apis";
import { allExtractionsApi } from "../apis";
import { StudyOptionForm } from "./study-option-form";
import type {
  CampusFull, CourseAssignment, CourseFull, CourseLinks, JunctionSlug, StudyOption,
} from "../apis/types";

const humanize = (v: string | null | undefined) => (v ? v.replaceAll("_", " ") : "");

const feeAmount = (f: { currency: string | null; total_amount: number | null; name: string | null }) =>
  f.total_amount != null ? `${f.currency ?? ""} ${f.total_amount}`.trim() : (f.name ?? "Fee");


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
  onChanged: () => void;
}>) {
  const [busy, setBusy] = useState(false);
  const [degreeLevels, setDegreeLevels] = useState<{ value: string; label: string }[]>([]);
  const [subjectAreas, setSubjectAreas] = useState<{ value: string; label: string }[]>([]);
  const [editingDescription, setEditingDescription] = useState(false);
  const [description, setDescription] = useState(course.description ?? "");
  const [addingOption, setAddingOption] = useState(false);
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);

  // Re-seed when a different course is selected, or after a save round-trips.
  useEffect(() => {
    setDescription(course.description ?? "");
    setEditingDescription(false);
  }, [course]);

  useEffect(() => {
    const toOptions = (rows: { name: string }[]) => rows.map((r) => ({ value: r.name, label: r.name }));
    categoriesApi.getLookups("degree-levels", { limit: 100 })
      .then((res) => setDegreeLevels(toOptions(res.data)))
      .catch(() => setDegreeLevels([]));
    categoriesApi.getLookups("areas-of-study", { limit: 100 })
      .then((res) => setSubjectAreas(toOptions(res.data)))
      .catch(() => setSubjectAreas([]));
  }, []);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      onChanged();
    } catch (e) {
      toast.error("Action failed", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const patchCourse = (patch: Record<string, unknown>) =>
    run(() => allExtractionsApi.updateCourse(course.id, patch), "Course updated");

  const link = (junction: JunctionSlug, entityId: string) =>
    run(() => allExtractionsApi.assignJunction(junction, { job_id: jobId, course_id: course.id, entity_id: entityId }), "Linked");

  const unlink = (junction: JunctionSlug, entityId: string) =>
    run(() => allExtractionsApi.unassignJunction(junction, { job_id: jobId, course_id: course.id, entity_id: entityId }), "Unlinked");

  // Which entity ids this course is attached to, per junction table.
  const idsFor = (rows: CourseAssignment[], column: string) =>
    new Set(rows.filter((r) => r.course_id === course.id).map((r) => r[column]).filter((v): v is string => Boolean(v)));

  const pick = <T extends { id: string }>(all: T[], ids: Set<string>) => all.filter((e) => ids.has(e.id));

  const fees = pick(links.course_fees, idsFor(links.fee_assignments, "course_fee_id"));
  const intakes = pick(links.intakes, idsFor(links.intake_assignments, "intake_id"));
  const units = pick(links.study_units, idsFor(links.study_unit_assignments, "study_unit_id"));
  const eligibility = pick(links.eligibility_requirements, idsFor(links.eligibility_assignments, "eligibility_requirement_id"));
  const accreditations = pick(links.accreditations, idsFor(links.accreditation_assignments, "extraction_accreditation_id"));
  const studyOptions = pick(links.study_options, idsFor(links.study_option_assignments, "study_option_id"));
  const branches = pick(campuses, idsFor(links.course_campuses, "campus_id"));

  const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "");

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
            <Combobox
              options={degreeLevels}
              value={course.degree_level ?? ""}
              onChange={(v) => patchCourse({ degree_level: v || null })}
              placeholder="Select degree level"
              loading={degreeLevels.length === 0}
              creatable
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Subject area</Label>
            <Combobox
              options={subjectAreas}
              value={course.subject_area ?? ""}
              onChange={(v) => patchCourse({ subject_area: v || null })}
              placeholder="Select subject area"
              loading={subjectAreas.length === 0}
              creatable
            />
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
          linked={fees} available={links.course_fees}
          labelOf={feeAmount}
          descriptionOf={(f) => `${feeAmount(f)} · ${f.student_type ?? "both"}`}
          emptyText="No fees assigned" linkLabel="Link fee"
          searchPlaceholder="Search or type new fee name…" optionsHeading="Existing"
          busy={busy} onLink={link} onUnlink={unlink}
          onCreate={(name) =>
            run(async () => {
              const created = await allExtractionsApi.createCourseFee({ job_id: jobId, name });
              await allExtractionsApi.assignJunction("course-fees", { job_id: jobId, course_id: course.id, entity_id: created.id });
            }, "Fee created and linked")
          }
          // Domestic and international sit side by side.
          renderRows={(rows, unlinkRow) =>
            rows.length === 0 ? (
              <p className="rounded-md bg-muted/50 py-2 text-center text-xs text-muted-foreground">No fees assigned</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {rows.map((fee) => (
                  <div key={fee.id} className="flex items-start justify-between gap-2 rounded-lg border border-border px-3 py-2">
                    <span className="min-w-0">
                      <span className="block text-xs capitalize text-muted-foreground">{humanize(fee.student_type) || "Fee"}</span>
                      <span className="block truncate text-sm font-medium">{feeAmount(fee)}</span>
                    </span>
                    <Button variant="ghost" size="icon-xs" className="cursor-pointer" title="Unlink" disabled={busy} onClick={() => unlinkRow(fee.id)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )
          }
        />

        <LinkSection
          icon={CalendarDays} title="Intakes" junction="intakes"
          linked={intakes} available={links.intakes}
          labelOf={(i) => i.intake_name ?? "Intake"}
          metaOf={(i) => [fmtDate(i.start_date), fmtDate(i.end_date)].filter(Boolean).join(" → ") || null}
          emptyText="No intakes" linkLabel="Link intake"
          busy={busy} onLink={link} onUnlink={unlink}
        />

        <LinkSection
          icon={BookMarked} title="Study Units" junction="study-units"
          linked={units} available={links.study_units}
          labelOf={(u) => u.unit_name}
          descriptionOf={(u) => [u.unit_code, u.unit_type, u.credit_points ? `${u.credit_points} CP` : null].filter(Boolean).join(" · ")}
          emptyText="No study units" linkLabel="Link unit"
          busy={busy} onLink={link} onUnlink={unlink}
          // Code chip before the name, credit points chip on the right.
          renderRows={(rows, unlinkRow) =>
            rows.length === 0 ? (
              <p className="rounded-md bg-muted/50 py-2 text-center text-xs text-muted-foreground">No study units</p>
            ) : (
              rows.map((unit) => (
                <div key={unit.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5">
                  <span className="flex min-w-0 items-center gap-2">
                    {unit.unit_code && <Badge variant="outline" className="shrink-0 text-[10px]">{unit.unit_code}</Badge>}
                    <span className="truncate text-sm">{unit.unit_name}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {unit.credit_points != null && (
                      <Badge className="bg-primary/10 text-[10px] text-primary">{unit.credit_points} CP</Badge>
                    )}
                    <Button variant="ghost" size="icon-xs" className="cursor-pointer" title="Unlink" disabled={busy} onClick={() => unlinkRow(unit.id)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </span>
                </div>
              ))
            )
          }
        />

        <LinkSection
          icon={ShieldCheck} title="Eligibility" junction="eligibility-requirements"
          linked={eligibility} available={links.eligibility_requirements}
          labelOf={(e) => e.name ?? "Requirement"}
          metaOf={(e) => humanize(e.applicable_to) || null}
          emptyText="No eligibility requirements" linkLabel="Link requirement"
          busy={busy} onLink={link} onUnlink={unlink}
        />

        <LinkSection
          icon={ShieldCheck} title="Accreditations" junction="accreditations"
          linked={accreditations} available={links.accreditations}
          labelOf={(a) => a.name}
          metaOf={(a) => a.issuing_organization}
          emptyText="No accreditations" linkLabel="Link accreditation"
          busy={busy} onLink={link} onUnlink={unlink}
        />

        {/* Study options are created per course rather than picked from a shared pool. */}
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

          {studyOptions.map((option) =>
            editingOptionId === option.id ? (
              <StudyOptionForm
                key={option.id}
                option={option}
                saving={busy}
                onCancel={() => setEditingOptionId(null)}
                onSave={async (values) => {
                  setEditingOptionId(null);
                  await run(() => allExtractionsApi.updateStudyOption(option.id, values), "Study option updated");
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
                    onClick={() => run(() => allExtractionsApi.deleteStudyOption(option.id), "Study option deleted")}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ),
          )}
        </section>

        <LinkSection
          icon={Building2} title="Branches" junction="campuses"
          linked={branches} available={campuses}
          labelOf={(c) => c.name ?? "Campus"}
          metaOf={(c) => [c.city, c.country].filter(Boolean).join(", ") || null}
          emptyText="No branches" linkLabel="Link branch"
          busy={busy} onLink={link} onUnlink={unlink}
        />
      </CardContent>
    </Card>
  );
}
