"use client";

import { useEffect, useMemo } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/combobox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/field-error";
import { useValidatedForm } from "@/lib/use-validated-form";
import { flagFromIso2 } from "@/app/admin/platform/categories/utils";
import { isValidPhoneForCountry } from "../../utils";
import { splitPhone } from "@/lib/utils";
import type { Category, CountryOption } from "@/app/admin/platform/categories/apis";
import type { BusinessDetail, BusinessPatch } from "../../apis/types";

type FormState = {
  name: string; categoryId: string;
  countryId: string; address: string; state: string; postcode: string;
  email: string; phoneCountryId: string; phoneNumber: string; website: string;
};

const urlField = z.string().refine((v) => v === "" || /^https?:\/\/\S+\.\S+/.test(v), "Enter a valid URL");

function buildSchema(countries: CountryOption[]): z.ZodType<FormState> {
  return z.object({
    name: z.string().min(2, "Required"),
    categoryId: z.string().min(1, "Required"),
    countryId: z.string(),
    address: z.string(),
    state: z.string(),
    postcode: z.string(),
    email: z.string().refine((v) => v === "" || /^\S+@\S+\.\S+$/.test(v), "Enter a valid email"),
    phoneCountryId: z.string(),
    phoneNumber: z.string(),
    website: urlField,
  }).superRefine((data, ctx) => {
    if (!data.phoneCountryId || !data.phoneNumber) return;
    const iso2 = countries.find((c) => String(c.id) === data.phoneCountryId)?.iso2;
    if (!isValidPhoneForCountry(data.phoneNumber, iso2)) {
      ctx.addIssue({ code: "custom", path: ["phoneNumber"], message: "Enter a valid phone number for the selected country" });
    }
  });
}

function toForm(b: BusinessDetail, countries: CountryOption[]): FormState {
  const { phoneCountryId, phoneNumber } = splitPhone(b.phone, countries);
  return {
    name: b.business_name,
    categoryId: b.business_category_id ? String(b.business_category_id) : "",
    countryId: b.country_id ? String(b.country_id) : "",
    address: b.address ?? "",
    state: b.state ?? "",
    postcode: b.postcode ?? "",
    email: b.email ?? "",
    phoneCountryId,
    phoneNumber,
    website: b.website ?? "",
  };
}

export function BusinessHeaderDialog({
  open,
  onOpenChange,
  business,
  categories,
  countries,
  onSave,
  saving,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  business: BusinessDetail;
  categories: Category[];
  countries: CountryOption[];
  onSave: (patch: BusinessPatch) => Promise<boolean>;
  saving: boolean;
}>) {
  const schema = useMemo(() => buildSchema(countries), [countries]);
  const { form, setForm, errors, reset, validate } = useValidatedForm(schema, () => toForm(business, countries));

  const categoryOptions = categories.map((c) => ({ value: String(c.id), label: c.name }));
  const countryOptions = countries.map((c) => ({ value: String(c.id), label: `${flagFromIso2(c.iso2)} ${c.name}` }));
  const phoneCountryOptions = useMemo(
    () => countries
      .filter((c) => c.phoneCode)
      .map((c) => ({ value: String(c.id), label: `${c.name} (${c.phoneCode})`, icon: <span>{flagFromIso2(c.iso2)}</span> })),
    [countries],
  );

  useEffect(() => {
    if (!open) return;
    reset(toForm(business, countries));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSubmit = async () => {
    const data = validate();
    if (!data) return;
    const phoneCode = countries.find((c) => String(c.id) === data.phoneCountryId)?.phoneCode ?? "";
    const phone = [phoneCode, data.phoneNumber].filter(Boolean).join(" ");
    const ok = await onSave({
      business_name: data.name,
      business_category_id: Number(data.categoryId),
      country_id: data.countryId ? Number(data.countryId) : null,
      address: data.address || null,
      state: data.state || null,
      postcode: data.postcode || null,
      email: data.email || null,
      phone: phone || null,
      website: data.website || null,
    });
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Business Info</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Business Name *</Label>
            <Input className="h-10" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} aria-invalid={!!errors.name} />
            <FieldError message={errors.name} />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Business Category</Label>
            <Combobox
              value={form.categoryId}
              onChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
              placeholder="Select category"
              searchPlaceholder="Search categories..."
              options={categoryOptions}
              aria-invalid={!!errors.categoryId}
            />
            <FieldError message={errors.categoryId} />
          </div>

          <div className="space-y-2">
            <Label>Address</Label>
            <div className="grid grid-cols-[160px_1fr] gap-3">
              <div className="flex flex-col gap-2">
                <Combobox
                  value={form.countryId}
                  onChange={(v) => setForm((f) => ({ ...f, countryId: v }))}
                  placeholder="Select country"
                  searchPlaceholder="Search countries..."
                  options={countryOptions}
                />
              </div>
              <Input className="h-10" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="Address" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input className="h-10" value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} placeholder="State" />
              <Input className="h-10" value={form.postcode} onChange={(e) => setForm((f) => ({ ...f, postcode: e.target.value }))} placeholder="Postcode" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Email</Label>
            <Input className="h-10" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} aria-invalid={!!errors.email} />
            <FieldError message={errors.email} />
          </div>

          <div className="space-y-2">
            <Label>Phone</Label>
            <div className="grid grid-cols-[160px_1fr] gap-3">
              <div className="flex flex-col gap-2">
                <Combobox
                  value={form.phoneCountryId}
                  onChange={(v) => setForm((f) => ({ ...f, phoneCountryId: v }))}
                  placeholder="Code"
                  searchPlaceholder="Search countries..."
                  options={phoneCountryOptions}
                />
              </div>
              <Input
                className="h-10"
                value={form.phoneNumber}
                onChange={(e) => setForm((f) => ({ ...f, phoneNumber: e.target.value }))}
                placeholder="984 1234567"
                aria-invalid={!!errors.phoneNumber}
              />
            </div>
            <FieldError message={errors.phoneNumber} />
          </div>

          <div className="space-y-2">
            <Label>Website</Label>
            <Input className="h-10" value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} placeholder="https://example.com" aria-invalid={!!errors.website} />
            <FieldError message={errors.website} />
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
