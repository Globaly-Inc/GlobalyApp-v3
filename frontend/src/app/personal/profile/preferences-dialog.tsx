"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/combobox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DEGREE_LEVELS, FIELDS_OF_STUDY } from "../static/onboarding-content";
import type { Country } from "../../geo/apis";
import type { StudentProfile, StudentProfilePatch } from "../apis/types";

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

function toForm(profile: StudentProfile): FormState {
  return {
    destinations: (profile.preferred_destinations ?? []).map(String),
    fields: profile.preferred_fields ?? [],
    degreeLevel: profile.preferred_degree_levels?.[0] ?? "",
    expectedStartDate: profile.expected_start_date ?? "",
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
  const [form, setForm] = useState<FormState>(() => toForm(profile));
  const countryNameById = new Map(countries.map((c) => [String(c.id), c.name]));
  const destinationOptions = countries
    .filter((c) => !form.destinations.includes(String(c.id)))
    .map((c) => ({ value: String(c.id), label: c.name }));

  const handleOpenChange = (next: boolean) => {
    if (next) setForm(toForm(profile));
    onOpenChange(next);
  };

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
    const ok = await onSave({
      preferred_destinations: form.destinations.map(Number),
      preferred_fields: form.fields,
      preferred_degree_levels: form.degreeLevel ? [form.degreeLevel] : [],
      expected_start_date: form.expectedStartDate || null,
      budget_currency: form.budgetCurrency || null,
      budget_min: form.budgetMin ? Number(form.budgetMin) : null,
      budget_max: form.budgetMax ? Number(form.budgetMax) : null,
      include_living_expenses: form.includeLiving,
    });
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Study Preferences</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
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
            <div className="space-y-2">
              <Label>Degree Level</Label>
              <Select value={form.degreeLevel} onValueChange={(v) => setForm((f) => ({ ...f, degreeLevel: v ?? "" }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {DEGREE_LEVELS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Expected Start (MM-YYYY)</Label>
              <Input
                value={form.expectedStartDate}
                onChange={(e) => setForm((f) => ({ ...f, expectedStartDate: e.target.value }))}
                placeholder="09-2026"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Currency</Label>
              <Input value={form.budgetCurrency} onChange={(e) => setForm((f) => ({ ...f, budgetCurrency: e.target.value }))} placeholder="AUD" />
            </div>
            <div className="space-y-2">
              <Label>Budget Min</Label>
              <Input type="number" value={form.budgetMin} onChange={(e) => setForm((f) => ({ ...f, budgetMin: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Budget Max</Label>
              <Input type="number" value={form.budgetMax} onChange={(e) => setForm((f) => ({ ...f, budgetMax: e.target.value }))} />
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
