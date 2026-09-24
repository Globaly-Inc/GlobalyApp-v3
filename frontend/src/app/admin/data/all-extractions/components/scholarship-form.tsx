"use client";

import { z } from "zod";
import { useState } from "react";
import { Award, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/combobox";
import { FieldError } from "@/components/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { APPLICABLE_TO_OPTIONS } from "../const";
import type { Scholarship, ScholarshipParams } from "../apis/types";

export const COVERAGE_TYPE_OPTIONS = [
  { value: "full_tuition", label: "Full tuition" },
  { value: "partial_tuition", label: "Partial tuition" },
  { value: "stipend", label: "Stipend" },
  { value: "living_allowance", label: "Living allowance" },
  { value: "other", label: "Other" },
];

const NONE = "__none__";

const schema = z.object({
  name: z.string().trim().min(1, "Scholarship name is required"),
  amount: z
    .string()
    .trim()
    .refine((v) => !v || !Number.isNaN(Number(v)), { message: "Amount must be a valid number" })
    .transform((v) => (v ? Number(v) : null)),
  currency: z.string().trim().transform((v) => v.toUpperCase() || null),
  deadline: z.string().trim().transform((v) => v || null),
  applicationUrl: z.string().trim().transform((v) => v || null),
  description: z.string().trim().transform((v) => v || null),
});

export function ScholarshipForm({
  scholarship,
  saving,
  onCancel,
  onSave,
}: Readonly<{
  scholarship?: Scholarship;
  saving: boolean;
  onCancel: () => void;
  onSave: (values: ScholarshipParams) => void;
}>) {
  const [applicableTo, setApplicableTo] = useState(scholarship?.applicable_to ?? "both");
  const [name, setName] = useState(scholarship?.name ?? "");
  const [coverageType, setCoverageType] = useState(scholarship?.coverage_type ?? NONE);
  const [amount, setAmount] = useState(scholarship?.amount?.toString() ?? "");
  const [currency, setCurrency] = useState(scholarship?.currency ?? "");
  const [deadline, setDeadline] = useState(scholarship?.deadline?.slice(0, 10) ?? "");
  const [applicationUrl, setApplicationUrl] = useState(scholarship?.application_url ?? "");
  const [description, setDescription] = useState(scholarship?.description ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSave = () => {
    const result = schema.safeParse({ name, amount, currency, deadline, applicationUrl, description });
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
    onSave({
      name: d.name,
      applicable_to: applicableTo,
      coverage_type: coverageType === NONE ? null : coverageType,
      amount: d.amount,
      currency: d.currency,
      deadline: d.deadline,
      application_url: d.applicationUrl,
      description: d.description,
    });
  };

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Award className="h-4 w-4 text-primary" />
          {scholarship ? "Edit Scholarship" : "Create Scholarship"}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
        <div className="flex flex-col gap-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Applicable to</Label>
          <div className="flex flex-wrap items-center gap-6">
            {APPLICABLE_TO_OPTIONS.map((option) => (
              <label key={option.value} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="scholarship-applicable-to"
                  className="accent-primary"
                  checked={applicableTo === option.value}
                  onChange={() => setApplicableTo(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="scholarship-name">
              Scholarship Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="scholarship-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((prev) => ({ ...prev, name: "" }));
              }}
              placeholder="e.g. International Excellence Scholarship"
              aria-invalid={Boolean(errors.name)}
            />
            <FieldError message={errors.name} />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label>Coverage</Label>
              <Combobox
                options={[{ value: NONE, label: "— Not stated —" }, ...COVERAGE_TYPE_OPTIONS]}
                value={coverageType}
                onChange={setCoverageType}
                placeholder="Select"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="scholarship-amount">Amount</Label>
              <Input
                id="scholarship-amount"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  if (errors.amount) setErrors((prev) => ({ ...prev, amount: "" }));
                }}
                inputMode="decimal"
                placeholder="e.g. 5000"
                aria-invalid={Boolean(errors.amount)}
              />
              <FieldError message={errors.amount} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="scholarship-currency">Currency</Label>
              <Input
                id="scholarship-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                placeholder="e.g. AUD"
                maxLength={3}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="scholarship-deadline">Application Deadline</Label>
              <Input
                id="scholarship-deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="scholarship-url">Application URL</Label>
              <Input
                id="scholarship-url"
                value={applicationUrl}
                onChange={(e) => setApplicationUrl(e.target.value)}
                placeholder="https://…"
                inputMode="url"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="scholarship-description">Notes / Remarks</Label>
            <Textarea
              id="scholarship-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Eligibility criteria, how to apply, renewal conditions…"
            />
          </div>
        </div>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button variant="outline" className="cursor-pointer" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button className="gap-1.5 cursor-pointer" disabled={saving} onClick={handleSave}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {scholarship ? "Save" : "Create"}
        </Button>
      </CardFooter>
    </Card>
  );
}
