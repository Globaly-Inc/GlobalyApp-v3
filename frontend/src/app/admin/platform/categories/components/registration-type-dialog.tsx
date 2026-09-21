"use client";

import { useEffect } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Combobox } from "@/components/combobox";
import { FieldError } from "@/components/field-error";
import { useValidatedForm } from "@/lib/use-validated-form";
import { RequiredMark } from "./required-mark";
import type { CountryOption, RegistrationType, RegistrationTypeInput } from "../apis/types";

/** The fallback row's country slot. "" is the empty Combobox, so the sentinel has to be a value. */
const ALL_COUNTRIES = "all";

type FormState = { countryId: string; code: string; label: string; sortOrder: string; isActive: boolean };

const schema: z.ZodType<FormState> = z.object({
  countryId: z.string().min(1, "Country is required"),
  code: z.string().trim().min(1, "Code is required").max(100, "Code must be 100 characters or fewer"),
  label: z.string().trim().min(1, "Label is required").max(200, "Label must be 200 characters or fewer"),
  sortOrder: z.string().regex(/^\d+$/, "Sort order must be a whole number"),
  isActive: z.boolean(),
});

export function RegistrationTypeDialog({
  open,
  onOpenChange,
  editing,
  countries,
  nextSortOrder,
  onSave,
  saving,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: RegistrationType | null;
  countries: CountryOption[];
  nextSortOrder: number;
  onSave: (input: RegistrationTypeInput) => Promise<boolean>;
  saving: boolean;
}>) {
  const initial = (): FormState =>
    editing
      ? {
          countryId: editing.country_id ? String(editing.country_id) : ALL_COUNTRIES,
          code: editing.code,
          label: editing.label,
          sortOrder: String(editing.sort_order),
          isActive: editing.is_active,
        }
      : { countryId: "", code: "", label: "", sortOrder: String(nextSortOrder), isActive: true };

  const { form, setForm, errors, reset, validate } = useValidatedForm(schema, initial);

  // `open` flips from the parent (row click), not from Dialog's own onOpenChange,
  // so the form has to re-sync here rather than in the close-only handler below.
  useEffect(() => {
    if (open) reset(initial());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const countryOptions = [
    { value: ALL_COUNTRIES, label: "All other countries (fallback)" },
    ...countries.map((c) => ({ value: String(c.id), label: c.name })),
  ];

  const handleSubmit = async () => {
    const data = validate();
    if (!data) return;
    const ok = await onSave({
      country_id: data.countryId === ALL_COUNTRIES ? null : Number(data.countryId),
      code: data.code,
      label: data.label,
      sort_order: Number(data.sortOrder),
      is_active: data.isActive,
    });
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit registration type" : "New registration type"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* flex+gap, not space-y — a Combobox in a space-y stack picks up a stray margin. */}
          <div className="flex flex-col gap-2">
            <Label>
              Country
              <RequiredMark />
            </Label>
            <Combobox
              options={countryOptions}
              value={form.countryId}
              onChange={(v) => setForm((f) => ({ ...f, countryId: v }))}
              placeholder="Select country"
              searchPlaceholder="Search countries..."
              className="h-10 w-full"
              aria-invalid={!!errors.countryId}
            />
            <FieldError message={errors.countryId} />
            <p className="text-xs text-muted-foreground">
              Pick the fallback to offer this everywhere a country has no types of its own.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg-code">
              Code
              <RequiredMark />
            </Label>
            <Input
              id="reg-code"
              value={form.code}
              placeholder="e.g. ABN"
              aria-invalid={!!errors.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
            />
            <FieldError message={errors.code} />
            <p className="text-xs text-muted-foreground">Stored on the business profile — changing it won&apos;t rewrite saved profiles.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg-label">
              Label
              <RequiredMark />
            </Label>
            <Input
              id="reg-label"
              value={form.label}
              placeholder="e.g. ABN (11 digits)"
              aria-invalid={!!errors.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            />
            <FieldError message={errors.label} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg-sort">Sort order</Label>
            <Input
              id="reg-sort"
              inputMode="numeric"
              value={form.sortOrder}
              aria-invalid={!!errors.sortOrder}
              onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
            />
            <FieldError message={errors.sortOrder} />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="reg-active">Active</Label>
            <Switch
              id="reg-active"
              checked={form.isActive}
              onCheckedChange={(checked) => setForm((f) => ({ ...f, isActive: checked }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button className="h-10 w-full" onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : "Create registration type"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
