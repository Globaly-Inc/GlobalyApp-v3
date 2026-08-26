"use client";

import { useEffect } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DEGREE_LEVELS, FIELDS_OF_STUDY } from "../static/onboarding-content";
import type { Country } from "../../geo/apis";
import type { StudentProfile, StudentProfilePatch } from "../apis/types";
import { useValidatedForm } from "./validation";
import { FieldError } from "./field-error";

type FormState = {
  destinations: string[];
  fields: string[];
  degreeLevel: string;
  expectedStartDate: string;
  budgetCurrency: string;
  budgetMin: string;
  budgetMax: string;
  includeLiving: boolean;
};

const nonNegative = z.string().refine((v) => v === "" || (Number.isInteger(Number(v)) && Number(v) >= 0), "Must be a whole number, 0 or more");

const schema: z.ZodType<FormState> = z
  .object({
    destinations: z.array(z.string()),
    fields: z.array(z.string()),
    degreeLevel: z.string(),
    expectedStartDate: z.string(),
    budgetCurrency: z.string(),
    budgetMin: nonNegative,
    budgetMax: nonNegative,
    includeLiving: z.boolean(),
  })
  .refine((v) => v.budgetMin === "" || v.budgetMax === "" || Number(v.budgetMin) <= Number(v.budgetMax), {
    message: "Max must be ≥ min",
    path: ["budgetMax"],
  });

function toForm(profile: StudentProfile): FormState {
  return {
    destinations: (profile.preferred_destinations ?? []).map(String),
    fields: profile.preferred_fields ?? [],
    degreeLevel: profile.preferred_degree_levels?.[0] ?? "",
    expectedStartDate: profile.expected_start_date ?? new Date().toISOString().slice(0, 10),
    budgetCurrency: profile.budget_currency ?? "",
    budgetMin: profile.budget_min != null ? String(profile.budget_min) : "",
    budgetMax: profile.budget_max != null ? String(profile.budget_max) : "",
    includeLiving: profile.include_living_expenses,
  };
}

export function PreferencesDialog({
  open,
  onOpenChange,
  profile,
  countries,
  onSave,
  saving,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: StudentProfile;
  countries: Country[];
  onSave: (patch: StudentProfilePatch) => Promise<boolean>;
  saving: boolean;
}>) {
  const { form, setForm, errors, reset, validate } = useValidatedForm(schema, () => toForm(profile));
  const countryNameById = new Map(countries.map((c) => [String(c.id), c.name]));
  const destinationOptions = countries
    .filter((c) => !form.destinations.includes(String(c.id)))
    .map((c) => ({ value: String(c.id), label: c.name }));

  const currencySymbolByCode = new Map(countries.filter((c) => c.currency).map((c) => [c.currency as string, c.currencySymbol]));
  const currencyOptions = Array.from(currencySymbolByCode.keys())
    .sort()
    .map((code) => ({ value: code, label: currencySymbolByCode.get(code) ? `${code} (${currencySymbolByCode.get(code)})` : code }));

  useEffect(() => {
    if (open) reset(toForm(profile));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, profile]);

  const toggleDestination = (id: string) => {
    setForm((f) => {
      if (f.destinations.includes(id)) return { ...f, destinations: f.destinations.filter((d) => d !== id) };
      if (f.destinations.length >= 5) return f;
      return { ...f, destinations: [...f.destinations, id] };
    });
  };

  const toggleField = (field: string) => {
    setForm((f) => ({
      ...f,
      fields: f.fields.includes(field) ? f.fields.filter((x) => x !== field) : [...f.fields, field],
    }));
  };

  const handleSubmit = async () => {
    const data = validate();
    if (!data) return;
    const ok = await onSave({
      preferred_destinations: data.destinations.map(Number),
      preferred_fields: data.fields,
      preferred_degree_levels: data.degreeLevel ? [data.degreeLevel] : [],
      expected_start_date: data.expectedStartDate || null,
      budget_currency: data.budgetCurrency || null,
      budget_min: data.budgetMin ? Number(data.budgetMin) : null,
      budget_max: data.budgetMax ? Number(data.budgetMax) : null,
      include_living_expenses: data.includeLiving,
    });
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Study Preferences</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-col gap-2">
            <Label>Preferred Destinations (max 5)</Label>
            <Combobox
              value=""
              onChange={toggleDestination}
              placeholder="Add a destination country"
              searchPlaceholder="Search countries..."
              options={destinationOptions}
            />
            {form.destinations.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {form.destinations.map((d) => (
                  <Badge key={d} variant="secondary" className="cursor-pointer" onClick={() => toggleDestination(d)}>
                    {countryNameById.get(d) ?? d} ×
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Fields of Study</Label>
            <div className="flex flex-wrap gap-2">
              {FIELDS_OF_STUDY.map((f) => (
                <Badge
                  key={f}
                  variant={form.fields.includes(f) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => toggleField(f)}
                >
                  {f}
                </Badge>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label>Degree Level</Label>
              <Combobox
                value={form.degreeLevel}
                onChange={(v) => setForm((f) => ({ ...f, degreeLevel: v }))}
                placeholder="Select"
                options={DEGREE_LEVELS}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Expected Start</Label>
              <DatePicker
                value={form.expectedStartDate}
                onChange={(v) => setForm((f) => ({ ...f, expectedStartDate: v }))}
                placeholder="Select expected start"
                fromYear={new Date().getFullYear()}
                toYear={new Date().getFullYear() + 10}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-2">
              <Label>Currency</Label>
              <Combobox
                value={form.budgetCurrency}
                onChange={(v) => setForm((f) => ({ ...f, budgetCurrency: v }))}
                placeholder="Select currency"
                options={currencyOptions}
              />
            </div>
            <div className="space-y-2">
              <Label>Budget Min</Label>
              <Input
                type="number"
                step={1}
                inputMode="numeric"
                value={form.budgetMin}
                onChange={(e) => setForm((f) => ({ ...f, budgetMin: e.target.value.replace(/[^0-9]/g, "") }))}
                aria-invalid={!!errors.budgetMin}
              />
              <FieldError message={errors.budgetMin} />
            </div>
            <div className="space-y-2">
              <Label>Budget Max</Label>
              <Input
                type="number"
                step={1}
                inputMode="numeric"
                value={form.budgetMax}
                onChange={(e) => setForm((f) => ({ ...f, budgetMax: e.target.value.replace(/[^0-9]/g, "") }))}
                aria-invalid={!!errors.budgetMax}
              />
              <FieldError message={errors.budgetMax} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.includeLiving}
              onCheckedChange={(checked) => setForm((f) => ({ ...f, includeLiving: checked }))}
            />
            Includes living expenses
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
