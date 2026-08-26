"use client";

import { useEffect } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { WorkExperience, WorkExperienceInput } from "../apis/types";
import { useValidatedForm } from "./validation";
import { FieldError } from "./field-error";

const schema: z.ZodType<WorkExperienceInput> = z
  .object({
    job_title: z.string().min(1, "Required"),
    organization_name: z.string(),
    is_current: z.boolean(),
    start_date: z.string().min(1, "Required"),
    end_date: z.string(),
    sort_order: z.number(),
  })
  .refine((v) => v.is_current || v.end_date !== "", { message: "Required", path: ["end_date"] });

function toInput(item: WorkExperience | null): WorkExperienceInput {
  return {
    job_title: item?.job_title ?? "",
    organization_name: item?.organization_name ?? "",
    is_current: item?.is_current ?? false,
    start_date: item?.start_date ?? new Date().toISOString().slice(0, 10),
    end_date: item?.end_date ?? "",
    sort_order: item?.sort_order ?? 0,
  };
}

export function WorkExperienceDialog({
  open,
  onOpenChange,
  item,
  onSave,
  saving,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: WorkExperience | null;
  onSave: (data: WorkExperienceInput) => Promise<boolean>;
  saving: boolean;
}>) {
  const { form, setForm, errors, reset, validate } = useValidatedForm(schema, () => toInput(item));

  useEffect(() => {
    if (open) reset(toInput(item));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item]);

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
          <DialogTitle>{item ? "Edit Work Experience" : "Add Work Experience"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Job Title *</Label>
            <Input
              value={form.job_title}
              onChange={(e) => setForm((f) => ({ ...f, job_title: e.target.value }))}
              aria-invalid={!!errors.job_title}
            />
            <FieldError message={errors.job_title} />
          </div>
          <div className="space-y-2">
            <Label>Organization</Label>
            <Input
              value={form.organization_name ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, organization_name: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label>Start Date *</Label>
              <DatePicker
                value={form.start_date ?? ""}
                onChange={(v) => setForm((f) => ({ ...f, start_date: v }))}
                placeholder="Select start date"
                toYear={new Date().getFullYear()}
                disabled={(date) => date > new Date()}
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
                toYear={new Date().getFullYear()}
                disabled={form.is_current || ((date) => date > new Date())}
                aria-invalid={!!errors.end_date}
              />
              <FieldError message={errors.end_date} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.is_current}
              onCheckedChange={(checked) => setForm((f) => ({ ...f, is_current: checked, end_date: checked ? "" : f.end_date }))}
            />
            Currently working here
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
