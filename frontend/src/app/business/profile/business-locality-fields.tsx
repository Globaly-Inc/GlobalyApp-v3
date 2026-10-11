"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/field-error";
import type { BusinessDetailsFormState as FormState } from "./business-details-dialog";

/** State, city and postcode fields of BusinessDetailsDialog. */
export function BusinessLocalityFields({
  form,
  setForm,
  errors,
}: Readonly<{
  form: FormState;
  setForm: (updater: (f: FormState) => FormState) => void;
  errors: Partial<Record<keyof FormState, string>>;
}>) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>State *</Label>
          <Input
            className="h-10"
            value={form.state}
            onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
            aria-invalid={!!errors.state}
            required
          />
          <FieldError message={errors.state} />
        </div>
        <div className="space-y-2">
          <Label>City *</Label>
          <Input
            className="h-10"
            value={form.city}
            onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            aria-invalid={!!errors.city}
            required
          />
          <FieldError message={errors.city} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Postcode *</Label>
        <Input
          className="h-10"
          value={form.postcode}
          onChange={(e) => setForm((f) => ({ ...f, postcode: e.target.value }))}
          aria-invalid={!!errors.postcode}
          required
        />
        <FieldError message={errors.postcode} />
      </div>
    </>
  );
}
