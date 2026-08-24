"use client";

import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { LoaderCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { cn } from "@/lib/utils";
import { useValidatedForm } from "@/app/personal/profile/validation";
import { FieldError } from "@/app/personal/profile/field-error";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { createEnquiry, fetchCourseOptions, fetchEnquiries } from "../store/enquiries-slice";
import { MESSAGE_MAX, MESSAGE_MIN, defaultIntakeYear } from "../const";
import { durationLabel, prettyMode } from "../utils";
import { CoursePreview, CoursePreviewSkeleton } from "./course-preview";
import { IntakeFields } from "./intake-fields";

import type { CreateEnquiryInput } from "../apis/types";

const schema: z.ZodType<CreateEnquiryInput> = z.object({
  course_id: z.string().uuid("Select a course"),
  extraction_job_id: z.string().uuid().nullable().optional(),
  business_id: z.number().int().positive().nullable().optional(),
  message: z
    .string()
    .min(MESSAGE_MIN, `At least ${MESSAGE_MIN} characters`)
    .max(MESSAGE_MAX, `${MESSAGE_MAX} characters max`),
  preferred_intake: z.string().nullable().optional(),
  preferred_year: z.number().int().nullable().optional(),
});

function emptyInput(courseId: string | null): CreateEnquiryInput {
  return {
    course_id: courseId ?? "",
    message: "",
    preferred_intake: "",
    preferred_year: defaultIntakeYear(),
  };
}

/** A required field's marker — one place, so every label marks it the same way. */
function Required() {
  return (
    <span className="text-destructive" aria-hidden>
      *
    </span>
  );
}

/**
 * The parent remounts this with a fresh `key` on every open, so all form state
 * starts clean without a reset path — opening programmatically (the New Enquiry
 * button) never fires Dialog's onOpenChange, so a reset there would be skipped.
 *
 * `prefillCourseId` is supplied by the parent (from ?course_id= on the deep link
 * from the course search) and only for the first open, so a lingering query param
 * can't keep re-prefilling later opens.
 */
export function NewEnquiryDialog({
  open,
  onOpenChange,
  prefillCourseId = null,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void; prefillCourseId?: string | null }>) {
  const dispatch = useAppDispatch();
  const createStatus = useAppSelector((s) => s.enquiries.createStatus);
  const { form, setForm, errors, validate } = useValidatedForm(schema, () => emptyInput(prefillCourseId));

  const courses = useAppSelector((s) => s.enquiries.courseOptions);
  const courseOptionsStatus = useAppSelector((s) => s.enquiries.courseOptionsStatus);
  const coursesLoading = courseOptionsStatus === "loading";

  // Institution is a filter for the course list — never submitted, since the
  // backend derives the stored institution from the chosen course.
  //
  // null means "not touched, follow the selected course". That matters for the
  // ?course_id= deep link from a search-result Enquire button: course arrives prefilled
  // before the options have loaded, so the institution can only be resolved once
  // they arrive. Deriving avoids a set-state-in-effect (which this repo lints
  // against) and keeps the field correct in that race. An explicit "" means the
  // user cleared it deliberately, which must NOT snap back to the course's
  // institution.
  const [institutionTouched, setInstitutionTouched] = useState<string | null>(null);
  const selectedCourse = courses.find((c) => c.id === form.course_id);
  const institutionJobId = institutionTouched ?? selectedCourse?.job_id ?? "";

  // Arriving from a course's Enquire button (?course_id=), the course is already decided —
  // the institution and course pickers would only offer a way to change it, so the preview
  // stands in for both. The pickers come back if that id can't be resolved (a stale link,
  // or the catalog failed to load), so the dialog is never stuck on a course the student
  // can neither see nor change.
  const courseLocked =
    !!prefillCourseId &&
    courseOptionsStatus !== "failed" &&
    (courses.length === 0 || !!selectedCourse);

  // Load the picker's options the first time the dialog opens. The thunk's own
  // `condition` makes this a no-op once they're cached.
  useEffect(() => {
    if (open) dispatch(fetchCourseOptions());
  }, [open, dispatch]);

  const institutionOptions: ComboboxOption[] = useMemo(() => {
    const byJob = new Map<string, string>();
    for (const c of courses) {
      const name = c.institution_name ?? c.awarding_institution;
      if (c.job_id && name && !byJob.has(c.job_id)) byJob.set(c.job_id, name);
    }
    return [...byJob.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [courses]);

  const courseOptions: ComboboxOption[] = useMemo(
    () =>
      courses
        .filter((c) => !institutionJobId || c.job_id === institutionJobId)
        .map((c) => ({
          value: c.id,
          // Institution in the label so search finds a course either way, and so
          // same-named courses at different institutions stay distinguishable.
          label: c.institution_name ? `${c.name} — ${c.institution_name}` : c.name,
          // Second line: what the course actually is, so two similar names can be
          // told apart in the list without opening anything.
          description: [c.degree_level, durationLabel(c.duration_weeks), prettyMode(c.study_mode)]
            .filter(Boolean)
            .join(" · "),
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [courses, institutionJobId],
  );

  const handleInstitutionChange = (jobId: string) => {
    setInstitutionTouched(jobId);
    // Drop a course that no longer belongs to the chosen institution.
    if (selectedCourse && jobId && selectedCourse.job_id !== jobId) {
      setForm((f) => ({ ...f, course_id: "" }));
    }
  };

  // The institution field follows the course automatically (see above), so
  // picking a course only needs to set the course.
  const handleCourseChange = (courseId: string) => {
    setForm((f) => ({ ...f, course_id: courseId }));
  };

  const saving = createStatus === "saving";

  const handleSubmit = async () => {
    const data = validate();
    if (!data) return;
    // An untouched month leaves "" behind; store null instead so the card can
    // tell "no intake chosen" from a real value.
    const result = await dispatch(createEnquiry({
      ...data,
      preferred_intake: data.preferred_intake?.trim() ? data.preferred_intake : null,
    }));
    if (createEnquiry.rejected.match(result)) {
      toast.error("Couldn't send enquiry", { description: result.error.message ?? "Please try again." });
      return;
    }
    toast.success("Enquiry sent!");
    onOpenChange(false);
    // Refresh the list so the new enquiry appears without a page reload.
    dispatch(fetchEnquiries());
  };

  const messageLength = form.message.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New Enquiry</DialogTitle>
          <DialogDescription>
            Send a message about a course to matching institutions and agents.
          </DialogDescription>
        </DialogHeader>
        {/* flex/gap, not space-y — space-y inflates height around Combobox focus
            guards inside a Dialog (see frontend/AGENTS.md). */}
        <div className="flex flex-col gap-4">
          {courseLocked ? (
            <div className="flex flex-col gap-2">
              <Label>Course</Label>
              {selectedCourse ? <CoursePreview course={selectedCourse} /> : <CoursePreviewSkeleton />}
              <FieldError message={errors.course_id} />
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="enquiry-institution">Institution</Label>
                <Combobox
                  id="enquiry-institution"
                  options={institutionOptions}
                  value={institutionJobId}
                  onChange={handleInstitutionChange}
                  placeholder="All institutions"
                  searchPlaceholder="Search institutions..."
                  emptyText="No institutions found."
                  loading={coursesLoading}
                />
                <p className="text-xs text-muted-foreground">
                  Optional — narrows the course list below.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="enquiry-course">
                  Course <Required />
                </Label>
                <Combobox
                  id="enquiry-course"
                  options={courseOptions}
                  value={form.course_id}
                  onChange={handleCourseChange}
                  placeholder="Select a course"
                  searchPlaceholder="Search courses..."
                  emptyText={institutionJobId ? "No courses for this institution." : "No courses found."}
                  loading={coursesLoading}
                  aria-invalid={!!errors.course_id}
                />
                <FieldError message={errors.course_id} />
                {selectedCourse && <CoursePreview course={selectedCourse} />}
              </div>
            </>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="enquiry-message">
              Message <Required />
            </Label>
            <Textarea
              id="enquiry-message"
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              placeholder="Ask about entry requirements, fees, scholarships, or anything else you need to know."
              rows={5}
              maxLength={MESSAGE_MAX}
              aria-invalid={!!errors.message}
              className="min-h-28 resize-y"
            />
            <div className="flex items-start justify-between gap-3">
              <FieldError message={errors.message} />
              <span
                className={cn(
                  "ml-auto shrink-0 text-xs tabular-nums",
                  messageLength > 0 && messageLength < MESSAGE_MIN ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {messageLength}/{MESSAGE_MAX}
              </span>
            </div>
          </div>

          <IntakeFields
            month={form.preferred_intake ?? ""}
            year={String(form.preferred_year ?? "")}
            onMonthChange={(v) => setForm((f) => ({ ...f, preferred_intake: v }))}
            onYearChange={(v) => setForm((f) => ({ ...f, preferred_year: v ? Number(v) : null }))}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : (
              <Send className="size-4" aria-hidden />
            )}
            {saving ? "Sending..." : "Send Enquiry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
