"use client";

import { Label } from "@/components/ui/label";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { FieldError } from "@/app/personal/profile/field-error";
import { CoursePreview, CoursePreviewSkeleton } from "./course-preview";

import type { Course } from "../apis/types";

/** A required field's marker — one place, so every label marks it the same way. */
export function Required() {
  return (
    <span className="text-destructive" aria-hidden>
      *
    </span>
  );
}

/**
 * What the enquiry is about: the institution filter and the course itself.
 *
 * When `locked` (the student arrived from a course's Enquire button, so the course is already
 * decided) the pickers collapse to a read-only preview — offering to change it would only be a
 * way to lose the course they came here for.
 */
export function CoursePickerFields({
  locked,
  selectedCourse,
  courseId,
  institutionJobId,
  institutionOptions,
  courseOptions,
  loading,
  error,
  onInstitutionChange,
  onCourseChange,
}: Readonly<{
  locked: boolean;
  selectedCourse: Course | undefined;
  courseId: string;
  institutionJobId: string;
  institutionOptions: ComboboxOption[];
  courseOptions: ComboboxOption[];
  loading: boolean;
  error?: string;
  onInstitutionChange: (jobId: string) => void;
  onCourseChange: (courseId: string) => void;
}>) {
  if (locked) {
    return (
      <div className="flex flex-col gap-2">
        <Label>Course</Label>
        {selectedCourse ? <CoursePreview course={selectedCourse} /> : <CoursePreviewSkeleton />}
        <FieldError message={error} />
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor="enquiry-institution">Institution</Label>
        <Combobox
          id="enquiry-institution"
          options={institutionOptions}
          value={institutionJobId}
          onChange={onInstitutionChange}
          placeholder="All institutions"
          searchPlaceholder="Search institutions..."
          emptyText="No institutions found."
          loading={loading}
        />
        <p className="text-xs text-muted-foreground">Optional — narrows the course list below.</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="enquiry-course">
          Course <Required />
        </Label>
        <Combobox
          id="enquiry-course"
          options={courseOptions}
          value={courseId}
          onChange={onCourseChange}
          placeholder="Select a course"
          searchPlaceholder="Search courses..."
          emptyText={institutionJobId ? "No courses for this institution." : "No courses found."}
          loading={loading}
          aria-invalid={!!error}
        />
        <FieldError message={error} />
        {selectedCourse && <CoursePreview course={selectedCourse} />}
      </div>
    </>
  );
}
