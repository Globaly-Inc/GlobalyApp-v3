"use client";

import { useEffect } from "react";
import { z } from "zod";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/combobox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DEGREE_LEVELS, FIELDS_OF_STUDY } from "../static/onboarding-content";
import { INTAKE_MONTHS } from "../enquiries/const";
import type { Country } from "../../geo/apis";
import type { StudentProfile, StudentProfilePatch } from "../apis/types";
import { useValidatedForm } from "./validation";
import { FieldError } from "./field-error";

const MONTH_OPTIONS = INTAKE_MONTHS.map((m) => ({ value: m, label: m }));
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 11 }, (_, i) => String(CURRENT_YEAR + i)).map((y) => ({ value: y, label: y }));
const FIELD_OPTIONS = FIELDS_OF_STUDY.map((f) => ({ value: f, label: f }));

function Chip({ label, onRemove }: Readonly<{ label: string; onRemove: () => void }>) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
      {label}
      <button type="button" onClick={onRemove} aria-label={`Remove ${label}`} className="cursor-pointer">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

type FormState = {
  destinations: string[];
  fields: string[];
  degreeLevel: string;
  expectedStartMonth: string;
  expectedStartYear: string;
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
    expectedStartMonth: z.string(),
    expectedStartYear: z.string(),
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
  // Parsed via regex, not `new Date()` — a date-only string parses as UTC midnight, and the
  // local getMonth()/getFullYear() getters then read a shifted date for any timezone west of
  // UTC, silently selecting the wrong intake month.
  const startDate = profile.expected_start_date?.match(/^(\d{4})-(\d{2})-\d{2}$/);
  return {
    destinations: (profile.preferred_destinations ?? []).map(String),
    fields: profile.preferred_fields ?? [],
    degreeLevel: profile.preferred_degree_levels?.[0] ?? "",
    expectedStartMonth: startDate ? (INTAKE_MONTHS[Number(startDate[2]) - 1] ?? "") : "",
    expectedStartYear: startDate?.[1] ?? "",
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
    const monthIndex = INTAKE_MONTHS.indexOf(data.expectedStartMonth as (typeof INTAKE_MONTHS)[number]);
    const expectedStartDate =
      data.expectedStartYear && monthIndex >= 0
        ? `${data.expectedStartYear}-${String(monthIndex + 1).padStart(2, "0")}-01`
        : null;
    const ok = await onSave({
      preferred_destinations: data.destinations.map(Number),
      preferred_fields: data.fields,
      preferred_degree_levels: data.degreeLevel ? [data.degreeLevel] : [],
      expected_start_date: expectedStartDate,
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
            <Label>Study Destination</Label>
            <Combobox
              value=""
              onChange={toggleDestination}
              placeholder="Search and select countries..."
              searchPlaceholder="Search countries..."
              options={destinationOptions}
            />
            {form.destinations.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {form.destinations.map((d) => (
                  <Chip key={d} label={countryNameById.get(d) ?? d} onRemove={() => toggleDestination(d)} />
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label>Subject Area</Label>
            <Combobox
              value=""
              onChange={toggleField}
              placeholder="Search and select subjects..."
              searchPlaceholder="Search subjects..."
              options={FIELD_OPTIONS.filter((o) => !form.fields.includes(o.value))}
            />
            {form.fields.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {form.fields.map((f) => (
                  <Chip key={f} label={f} onRemove={() => toggleField(f)} />
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label>Degree Level</Label>
              <Combobox
                value={form.degreeLevel}
                onChange={(v) => setForm((f) => ({ ...f, degreeLevel: v }))}
                placeholder="Select degree level"
                options={DEGREE_LEVELS}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Expected Start Intake</Label>
              <div className="grid grid-cols-2 gap-2">
                <Combobox
                  value={form.expectedStartMonth}
                  onChange={(v) => setForm((f) => ({ ...f, expectedStartMonth: v }))}
                  placeholder="Month"
                  options={MONTH_OPTIONS}
                />
                <Combobox
                  value={form.expectedStartYear}
                  onChange={(v) => setForm((f) => ({ ...f, expectedStartYear: v }))}
                  placeholder="Year"
                  options={YEAR_OPTIONS}
                />
              </div>
            </div>
          </div>
          <div className="space-y-3 rounded-lg border border-border p-4">
            <p className="text-sm font-medium text-foreground">Budget</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-2">
                <Label>Currency</Label>
                <Combobox
                  value={form.budgetCurrency}
                  onChange={(v) => setForm((f) => ({ ...f, budgetCurrency: v }))}
                  placeholder="Currency"
                  options={currencyOptions}
                />
              </div>
              <div className="space-y-2">
                <Label>Min Annual Budget</Label>
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
                <Label>Max Annual Budget</Label>
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
              Include living expenses
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
