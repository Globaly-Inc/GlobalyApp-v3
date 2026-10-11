"use client";

import { Combobox } from "@/components/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/field-error";
import { COVERAGE_TYPE_OPTIONS } from "../const";
import type { ScholarshipFormState as FormState } from "./scholarship-dialog";

/** Coverage, deadline and link fields of ScholarshipDialog. */
export function ScholarshipCoverageFields({
  form,
  setForm,
  errorFor,
}: Readonly<{
  form: FormState;
  setForm: (updater: (f: FormState) => FormState) => void;
  errorFor: (key: keyof FormState) => string | undefined;
}>) {
  return (
    <>
      <div className="grid grid-cols-3 gap-4">
        <div className="flex flex-col gap-2">
          <Label>Coverage type</Label>
          <Combobox options={COVERAGE_TYPE_OPTIONS} value={form.coverageType} onChange={(v) => setForm((f) => ({ ...f, coverageType: v }))} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sch-amount">Amount</Label>
          <Input id="sch-amount" className="h-10" inputMode="decimal" value={form.coverageAmount} aria-invalid={!!errorFor("coverageAmount")} onChange={(e) => setForm((f) => ({ ...f, coverageAmount: e.target.value }))} />
          <FieldError message={errorFor("coverageAmount")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sch-currency">Currency</Label>
          <Input id="sch-currency" className="h-10" value={form.coverageCurrency} onChange={(e) => setForm((f) => ({ ...f, coverageCurrency: e.target.value }))} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sch-coverage-description">Coverage description</Label>
        <Textarea id="sch-coverage-description" rows={2} value={form.coverageDescription} onChange={(e) => setForm((f) => ({ ...f, coverageDescription: e.target.value }))} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label>Deadline</Label>
          <DatePicker value={form.deadline} onChange={(v) => setForm((f) => ({ ...f, deadline: v }))} aria-invalid={!!errorFor("deadline")} />
          <FieldError message={errorFor("deadline")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sch-deadline-notes">Deadline notes</Label>
          <Input id="sch-deadline-notes" className="h-10" value={form.deadlineNotes} onChange={(e) => setForm((f) => ({ ...f, deadlineNotes: e.target.value }))} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="sch-apply-url">Application URL</Label>
          <Input id="sch-apply-url" type="url" className="h-10" value={form.applicationUrl} aria-invalid={!!errorFor("applicationUrl")} onChange={(e) => setForm((f) => ({ ...f, applicationUrl: e.target.value }))} />
          <FieldError message={errorFor("applicationUrl")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sch-source-url">Source URL</Label>
          <Input id="sch-source-url" type="url" className="h-10" value={form.sourceUrl} aria-invalid={!!errorFor("sourceUrl")} onChange={(e) => setForm((f) => ({ ...f, sourceUrl: e.target.value }))} />
          <FieldError message={errorFor("sourceUrl")} />
        </div>
      </div>
    </>
  );
}
