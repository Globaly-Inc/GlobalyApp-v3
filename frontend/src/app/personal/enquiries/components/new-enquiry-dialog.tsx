"use client";

import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { useValidatedForm } from "@/app/personal/profile/validation";
import { FieldError } from "@/app/personal/profile/field-error";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { createEnquiry, fetchCourseOptions, fetchEnquiries } from "../store/enquiries-slice";
import { INTAKE_MONTHS, defaultIntakeYear, INTAKE_YEAR_RANGE } from "../const";
import type { CreateEnquiryInput } from "../apis/types";

const schema: z.ZodType<CreateEnquiryInput> = z.object({
  course_id: z.string().uuid("Select a course"),
  extraction_job_id: z.string().uuid().nullable().optional(),
  business_id: z.number().int().positive().nullable().optional(),
  message: z.string().min(10, "At least 10 characters").max(5000, "5000 characters max"),
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

/**
 * The parent remounts this with a fresh `key` on every open, so all form state
 * starts clean without a reset path — opening programmatically (the New Enquiry
 * button) never fires Dialog's onOpenChange, so a reset there would be skipped.
 *
 * `prefillCourseId` is supplied by the parent (from ?course_id= on the deep link
 * from /personal/courses) and only for the first open, so a lingering query param
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
  const coursesLoading = useAppSelector((s) => s.enquiries.courseOptionsStatus === "loading");

  // Institution is a filter for the course list — never submitted, since the
  // backend derives the stored institution from the chosen course.
  //
  // null means "not touched, follow the selected course". That matters for the
  // ?course_id= deep link from /personal/courses: the course arrives prefilled
  // before the options have loaded, so the institution can only be resolved once
  // they arrive. Deriving avoids a set-state-in-effect (which this repo lints
  // against) and keeps the field correct in that race. An explicit "" means the
  // user cleared it deliberately, which must NOT snap back to the course's
  // institution.
  const [institutionTouched, setInstitutionTouched] = useState<string | null>(null);
  const selectedCourse = courses.find((c) => c.id === form.course_id);
  const institutionJobId = institutionTouched ?? selectedCourse?.job_id ?? "";

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

  const handleSubmit = async () => {
    const data = validate();
    if (!data) return;
    // An untouched Select leaves "" behind; store null instead so the card can
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Enquiry</DialogTitle>
          <DialogDescription>
            Send a message about a course to matching institutions and agents.
          </DialogDescription>
        </DialogHeader>
        {/* flex/gap, not space-y — space-y inflates height around Combobox focus
            guards inside a Dialog (see frontend/AGENTS.md). */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Institution</Label>
            <Combobox
              options={institutionOptions}
              value={institutionJobId}
              onChange={handleInstitutionChange}
              placeholder="All institutions"
              searchPlaceholder="Search institutions..."
              emptyText="No institutions found."
              loading={coursesLoading}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Course *</Label>
            <Combobox
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
          </div>

          <div className="flex flex-col gap-2">
            <Label>Message *</Label>
            <Textarea
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              placeholder="Tell them what you'd like to know (10-5000 characters)"
              rows={5}
              aria-invalid={!!errors.message}
            />
            <FieldError message={errors.message} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label>Preferred Intake</Label>
              <Select
                value={form.preferred_intake ?? ""}
                onValueChange={(v) => setForm((f) => ({ ...f, preferred_intake: String(v) }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  {INTAKE_MONTHS.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Preferred Year</Label>
              <Select
                value={String(form.preferred_year ?? "")}
                onValueChange={(v) => setForm((f) => ({ ...f, preferred_year: Number(v) }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: INTAKE_YEAR_RANGE }, (_, i) => new Date().getFullYear() + i).map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createStatus === "saving"}>
            {createStatus === "saving" ? "Sending..." : "Send Enquiry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
