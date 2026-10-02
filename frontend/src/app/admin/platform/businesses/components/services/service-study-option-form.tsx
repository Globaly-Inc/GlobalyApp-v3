"use client";

import { useState } from "react";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/combobox";
import { FieldError } from "@/components/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APPLICABLE_TO_OPTIONS, STUDY_LOAD_OPTIONS } from "@/app/admin/data/all-extractions/const";
import type { ServiceStudyOption, ServiceStudyOptionInput } from "../../apis/types";

// Same-to-same reuse of the data-extraction "New study option" form's layout and field pattern
// (study-option-form.tsx) — study mode/duration-unit options are this schema's own enum, which
// differs slightly from the extraction one ("blended" vs "hybrid", plus a "days" duration unit).
const STUDY_MODE_OPTIONS = [
  { value: "on_campus", label: "On Campus" },
  { value: "online", label: "Online" },
  { value: "blended", label: "Blended" },
];
const DURATION_UNIT_OPTIONS = [
  { value: "days", label: "Days" },
  { value: "weeks", label: "Weeks" },
  { value: "months", label: "Months" },
  { value: "years", label: "Years" },
];

const studyOptionSchema = z.object({
  duration: z
    .string()
    .trim()
    .refine((v) => !v || (!Number.isNaN(Number(v)) && Number(v) >= 0), { message: "Duration must be a valid positive number" }),
});

export function ServiceStudyOptionForm({
  option,
  saving,
  onCancel,
  onSave,
}: Readonly<{
  option?: ServiceStudyOption;
  saving: boolean;
  onCancel: () => void;
  onSave: (values: ServiceStudyOptionInput) => void;
}>) {
  const [mode, setMode] = useState<ServiceStudyOptionInput["study_mode"]>(option?.study_mode ?? "on_campus");
  const [load, setLoad] = useState<ServiceStudyOptionInput["study_load"]>(option?.study_load ?? "full_time");
  const [duration, setDuration] = useState(option?.duration_value?.toString() ?? "");
  const [unit, setUnit] = useState<ServiceStudyOptionInput["duration_unit"]>(option?.duration_unit ?? "months");
  const [applicableTo, setApplicableTo] = useState<ServiceStudyOptionInput["applicable_to"]>(option?.applicable_to ?? "both");
  const [saveForReuse, setSaveForReuse] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSave = () => {
    const result = studyOptionSchema.safeParse({ duration });
    if (!result.success) {
      const errs: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = String(issue.path[0]);
        if (!errs[key]) errs[key] = issue.message;
      }
      setErrors(errs);
      return;
    }
    setErrors({});
    onSave({
      study_mode: mode,
      study_load: load,
      duration_value: duration ? Number(duration) : null,
      duration_unit: unit,
      applicable_to: applicableTo,
    });
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4">
        <p className="text-sm font-medium">{option ? "Edit study option" : "New study option"}</p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Study mode</Label>
            <Combobox options={STUDY_MODE_OPTIONS} value={mode ?? "on_campus"} onChange={(v) => setMode(v as ServiceStudyOptionInput["study_mode"])} placeholder="Select mode" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Study load</Label>
            <Combobox options={STUDY_LOAD_OPTIONS} value={load ?? "full_time"} onChange={(v) => setLoad(v as ServiceStudyOptionInput["study_load"])} placeholder="Select load" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="option-duration">Duration</Label>
            <div className="flex gap-2">
              <Input
                id="option-duration"
                value={duration}
                onChange={(e) => {
                  setDuration(e.target.value);
                  if (errors.duration) setErrors((prev) => ({ ...prev, duration: "" }));
                }}
                inputMode="numeric"
                placeholder="e.g. 3"
                className="w-24"
                aria-invalid={Boolean(errors.duration)}
              />
              <Combobox options={DURATION_UNIT_OPTIONS} value={unit ?? "months"} onChange={(v) => setUnit(v as ServiceStudyOptionInput["duration_unit"])} className="flex-1" />
            </div>
            <FieldError message={errors.duration} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Applicable to</Label>
            <Combobox options={APPLICABLE_TO_OPTIONS} value={applicableTo ?? "both"} onChange={(v) => setApplicableTo(v as ServiceStudyOptionInput["applicable_to"])} placeholder="Select" />
          </div>
        </div>

        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
          <Checkbox checked={saveForReuse} onCheckedChange={() => setSaveForReuse((v) => !v)} />
          Save for reuse across courses
        </label>

        <div className="flex justify-end gap-2">
          <Button variant="outline" className="cursor-pointer" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button className="gap-1.5 cursor-pointer" disabled={saving} onClick={handleSave}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {option ? "Save" : "Create"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
