"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Lookup } from "@/app/admin/platform/categories/apis/types";
import { personalApi } from "../apis";
import type { Qualification, QualificationInput } from "../apis/types";
import { useValidatedForm } from "./validation";
import { FieldError } from "./field-error";

const schema: z.ZodType<QualificationInput> = z
  .object({
    qualification_type: z.string().min(1, "Required"),
    degree_title: z.string().min(1, "Required"),
    subject_area: z.string(),
    institution_name: z.string().min(1, "Required"),
    grading_system: z.string(),
    grade_value: z.string(),
    is_current: z.boolean(),
    start_date: z.string().min(1, "Required"),
    end_date: z.string(),
    sort_order: z.number(),
  })
  .refine((v) => v.is_current || v.end_date !== "", { message: "Required", path: ["end_date"] });

const GRADING_SYSTEMS = [
  { value: "gpa_4", label: "GPA (4.0 scale)" },
  { value: "gpa_5", label: "GPA (5.0 scale)" },
  { value: "gpa_7", label: "GPA (7.0 scale)" },
  { value: "gpa_10", label: "GPA (10.0 scale)" },
  { value: "percentage", label: "Percentage" },
  { value: "letter_grade", label: "Letter Grade" },
  { value: "pass_fail", label: "Pass / Fail" },
  { value: "other", label: "Other" },
];

function toInput(item: Qualification | null): QualificationInput {
  return {
    qualification_type: item?.qualification_type ?? "",
    degree_title: item?.degree_title ?? "",
    subject_area: item?.subject_area ?? "",
    institution_name: item?.institution_name ?? "",
    grading_system: item?.grading_system ?? "",
    grade_value: item?.grade_value ?? "",
    is_current: item?.is_current ?? false,
    start_date: item?.start_date ?? new Date().toISOString().split("T")[0],
    end_date: item?.end_date ?? "",
    sort_order: item?.sort_order ?? 0,
  };
}

export function QualificationDialog({
  open,
  onOpenChange,
  item,
  onSave,
  saving,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: Qualification | null;
  onSave: (data: QualificationInput) => Promise<boolean>;
  saving: boolean;
}>) {
  const { form, setForm, errors, reset, validate } = useValidatedForm(schema, () => toInput(item));

  useEffect(() => {
    if (open) reset(toInput(item));
  }, [open, item]);

  const [degreeLevels, setDegreeLevels] = useState<Lookup[]>([]);
  const [areasOfStudy, setAreasOfStudy] = useState<Lookup[]>([]);
  const [degreeSearch, setDegreeSearch] = useState<Lookup[] | null>(null);
  const [subjectSearch, setSubjectSearch] = useState<Lookup[] | null>(null);
  const searchTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    personalApi.getDegreeLevels().then((res) => setDegreeLevels(res.data));
    personalApi.getAreasOfStudy().then((res) => setAreasOfStudy(res.data));
  }, []);

  useEffect(() => {
    const timers = searchTimers.current;
    return () => {
      for (const timer of Object.values(timers)) clearTimeout(timer);
    };
  }, []);

  const debouncedSearch = (key: "degree" | "subject", query: string) => {
    clearTimeout(searchTimers.current[key]);
    searchTimers.current[key] = setTimeout(async () => {
      const res = key === "degree"
        ? await personalApi.getDegreeLevels({ search: query || undefined })
        : await personalApi.getAreasOfStudy({ search: query || undefined });
      if (key === "degree") setDegreeSearch(res.data);
      else setSubjectSearch(res.data);
    }, 300);
  };

  // Degree Level isn't creatable, so if a backend search narrows the currently selected value
  // out of the list, graft it back in — otherwise the trigger falls back to the placeholder and
  // looks like the selection was lost.
  const degreeLevelOptions = (() => {
    const options = (degreeSearch ?? degreeLevels).map((l) => ({ value: l.slug, label: l.name }));
    if (form.qualification_type && !options.some((o) => o.value === form.qualification_type)) {
      const current = degreeLevels.find((l) => l.slug === form.qualification_type);
      if (current) return [{ value: current.slug, label: current.name }, ...options];
    }
    return options;
  })();
  const subjectAreaOptions = (subjectSearch ?? areasOfStudy).map((l) => ({ value: l.name, label: l.name }));

  const handleSubmit = async () => {
    const data = validate();
    if (!data) return;
    if (!(await onSave(data))) return;
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? "Edit Education" : "Add Education"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-col gap-2">
            <Label>Degree Level *</Label>
            <Combobox
              value={form.qualification_type ?? ""}
              onChange={(v) => setForm((f) => ({ ...f, qualification_type: v }))}
              onQueryChange={(q) => debouncedSearch("degree", q)}
              placeholder="Select degree level"
              searchPlaceholder="Search degree levels..."
              options={degreeLevelOptions}
              aria-invalid={!!errors.qualification_type}
            />
            <FieldError message={errors.qualification_type} />
          </div>
          <div className="space-y-2">
            <Label>Degree Title *</Label>
            <Input
              value={form.degree_title ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, degree_title: e.target.value }))}
              placeholder="e.g. Bachelor of Computer Science"
              aria-invalid={!!errors.degree_title}
            />
            <FieldError message={errors.degree_title} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Subject Area</Label>
            <Combobox
              value={form.subject_area ?? ""}
              onChange={(v) => setForm((f) => ({ ...f, subject_area: v }))}
              onQueryChange={(q) => debouncedSearch("subject", q)}
              placeholder="Select or type a subject area"
              searchPlaceholder="Search or type your own..."
              options={subjectAreaOptions}
              creatable
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Institution *</Label>
            <Combobox
              value={form.institution_name ?? ""}
              onChange={(v) => setForm((f) => ({ ...f, institution_name: v }))}
              placeholder="Search or create institution..."
              searchPlaceholder="e.g. University of Melbourne"
              options={[]}
              creatable
              aria-invalid={!!errors.institution_name}
            />
            <FieldError message={errors.institution_name} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label>Grading System</Label>
              <Combobox
                value={form.grading_system ?? ""}
                onChange={(v) => setForm((f) => ({ ...f, grading_system: v }))}
                placeholder="Select"
                options={GRADING_SYSTEMS}
              />
            </div>
            <div className="space-y-2">
              <Label>Grade</Label>
              <Input value={form.grade_value ?? ""} onChange={(e) => setForm((f) => ({ ...f, grade_value: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label>Start Date *</Label>
              <DatePicker
                value={form.start_date ?? ""}
                onChange={(v) => setForm((f) => ({ ...f, start_date: v }))}
                placeholder="Select start date"
                toYear={new Date().getFullYear() + 10}
                aria-invalid={!!errors.start_date}
              />
              <FieldError message={errors.start_date} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>End Date{form.is_current ? "" : " *"}</Label>
              <DatePicker
                value={form.end_date ?? ""}
                onChange={(v) => setForm((f) => ({ ...f, end_date: v }))}
                placeholder="Select end date"
                toYear={new Date().getFullYear() + 10}
                disabled={form.is_current}
                aria-invalid={!!errors.end_date}
              />
              <FieldError message={errors.end_date} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.is_current}
              onCheckedChange={(checked) => setForm((f) => ({ ...f, is_current: checked === true, end_date: checked ? "" : f.end_date }))}
            />
            Currently studying here
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
