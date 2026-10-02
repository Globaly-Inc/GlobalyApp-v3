"use client";

import { z } from "zod";
import { useState } from "react";
import { CalendarDays, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError } from "@/components/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PartialDateInput, monthYearOf } from "./partial-date-input";
import type { Intake, IntakeParams } from "../apis/types";

const intakeSchema = z.object({
  name: z.string().trim().min(1, "Intake name is required"),
  startDate: z.string(),
  endDate: z.string(),
  orientation: z.string(),
  deadline: z.string(),
});

export function IntakeForm({
  intake,
  saving,
  onCancel,
  onSave,
}: Readonly<{
  intake?: Intake;
  saving: boolean;
  onCancel: () => void;
  onSave: (values: IntakeParams) => void;
}>) {
  const [name, setName] = useState(intake?.intake_name ?? "");
  const [startDate, setStartDate] = useState(intake?.start_date ?? "");
  const [endDate, setEndDate] = useState(intake?.end_date ?? "");
  const [orientation, setOrientation] = useState(intake?.orientation_date ?? "");
  const [deadline, setDeadline] = useState(intake?.admission_deadline ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="h-4 w-4 text-primary" />
          {intake ? "Edit Intake" : "Create Intake"}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="intake-name">
            Intake Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="intake-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (errors.name) setErrors((prev) => ({ ...prev, name: "" }));
            }}
            placeholder="e.g. Semester 1 2025"
            aria-invalid={Boolean(errors.name)}
          />
          <FieldError message={errors.name} />
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Intake dates</Label>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="intake-start">Start Date</Label>
              <PartialDateInput id="intake-start" value={startDate} onChange={setStartDate} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="intake-end">End Date</Label>
              <PartialDateInput id="intake-end" value={endDate} onChange={setEndDate} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="intake-orientation">Orientation</Label>
              <PartialDateInput id="intake-orientation" value={orientation} onChange={setOrientation} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="intake-deadline">Admission Deadline</Label>
              <PartialDateInput id="intake-deadline" value={deadline} onChange={setDeadline} />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" className="cursor-pointer" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button
            className="gap-1.5 cursor-pointer"
            disabled={saving}
            onClick={() => {
              const result = intakeSchema.safeParse({ name, startDate, endDate, orientation, deadline });
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
              const d = result.data;
              // Read off the string. new Date("2026-09") is UTC midnight on the 1st, so
              // getMonth() in a timezone behind UTC files the intake under the previous month.
              const start = d.startDate ? monthYearOf(d.startDate) : null;
              // Explicit null (not an omitted key) so editing an existing intake can actually
              // CLEAR a previously-stated date — the backend's PartialDateSchema is nullish.
              onSave({
                intake_name: d.name,
                start_date: d.startDate || null,
                end_date: d.endDate || null,
                orientation_date: d.orientation || null,
                admission_deadline: d.deadline || null,
                // Month/year mirror the start date so the list can group by intake year.
                intake_month: start?.intake_month ?? null,
                intake_year: start?.intake_year ?? null,
              });
            }}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
