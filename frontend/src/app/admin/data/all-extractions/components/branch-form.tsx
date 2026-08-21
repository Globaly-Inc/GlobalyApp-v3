"use client";

import { z } from "zod";
import { useEffect, useState } from "react";
import { Building2, Loader2, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/combobox";
import { FieldError } from "@/components/field-error";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { geoApi, type Country } from "@/app/geo/apis";
import { countriesApi, type City } from "@/app/admin/platform/countries/apis";
import type { CampusFull } from "../apis/types";

export type BranchValues = {
  name: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  state: string;
  postcode: string;
  map_link: string;
  address: string;
  source_url: string;
};

const branchSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z
    .string()
    .trim()
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: "Enter a valid email address",
    }),
  phone: z.string(),
  country: z.string(),
  city: z.string(),
  state: z.string(),
  postcode: z.string(),
  map_link: z
    .string()
    .trim()
    .refine((v) => !v || /^https?:\/\//i.test(v), {
      message: "Map link must start with http:// or https://",
    }),
  address: z.string(),
  source_url: z
    .string()
    .trim()
    .refine((v) => !v || /^https?:\/\//i.test(v), {
      message: "Source URL must start with http:// or https://",
    }),
});

const empty: BranchValues = {
  name: "", email: "", phone: "", country: "", city: "",
  state: "", postcode: "", map_link: "", address: "", source_url: "",
};

const fromBranch = (b: CampusFull): BranchValues => ({
  name: b.name ?? "", email: b.email ?? "", phone: b.phone ?? "", country: b.country ?? "",
  city: b.city ?? "", state: b.state ?? "", postcode: b.postcode ?? "",
  map_link: b.map_link ?? "", address: b.address ?? "", source_url: b.source_url ?? "",
});

export function BranchForm({
  branch,
  saving,
  onCancel,
  onSave,
}: Readonly<{
  branch?: CampusFull;
  saving: boolean;
  onCancel: () => void;
  onSave: (values: BranchValues) => void;
}>) {
  const [values, setValues] = useState<BranchValues>(branch ? fromBranch(branch) : empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [countries, setCountries] = useState<Country[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);

  const set = <K extends keyof BranchValues>(key: K, value: BranchValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((e) => { const next = { ...e }; delete next[key]; return next; });
  };

  useEffect(() => {
    geoApi.getCountries()
      .then(setCountries)
      .catch((e: Error) => toast.error("Could not load countries", { description: e.message }));
  }, []);

  const countryId = countries.find((c) => c.name === values.country)?.id;
  useEffect(() => {
    if (!countryId) {
      setCities([]);
      return;
    }
    setCitiesLoading(true);
    countriesApi.getCitiesByCountry(countryId)
      .then(setCities)
      .catch((e: Error) => toast.error("Could not load cities", { description: e.message }))
      .finally(() => setCitiesLoading(false));
  }, [countryId]);

  const submit = () => {
    const result = branchSchema.safeParse(values);
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
    onSave(values);
  };

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4 text-primary" />
          {branch ? "Edit Branch" : "Add Branch"}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="branch-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="branch-name"
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Branch / campus name"
              aria-invalid={!!errors.name}
            />
            <FieldError message={errors.name} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="branch-email">Email</Label>
            <Input
              id="branch-email"
              type="email"
              value={values.email}
              onChange={(e) => set("email", e.target.value)}
              aria-invalid={!!errors.email}
            />
            <FieldError message={errors.email} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="branch-phone">Phone</Label>
            <PhoneInput
              id="branch-phone"
              value={values.phone}
              onChange={(v) => set("phone", v)}
              preferredCountryName={values.country}
              placeholder="Phone number"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="branch-country">Country</Label>
            <Combobox
              id="branch-country"
              options={countries.map((c) => ({ value: c.name, label: c.name }))}
              value={values.country}
              onChange={(v) => setValues((prev) => ({ ...prev, country: v, city: "" }))}
              placeholder="Select country"
              loading={countries.length === 0}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="branch-city">City</Label>
            <Combobox
              id="branch-city"
              options={cities.map((c) => ({ value: c.name, label: c.name }))}
              value={values.city}
              onChange={(v) => {
                // Cities carry their state — fill it in unless one was typed already.
                const picked = cities.find((c) => c.name === v);
                setValues((prev) => ({ ...prev, city: v, state: prev.state || picked?.state_name || "" }));
              }}
              placeholder={countryId ? "Select city" : "Select a country first"}
              disabled={!countryId}
              loading={citiesLoading}
              creatable
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="branch-state">State</Label>
            <Input id="branch-state" value={values.state} onChange={(e) => set("state", e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="branch-postcode">Postcode</Label>
            <Input id="branch-postcode" value={values.postcode} onChange={(e) => set("postcode", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="branch-map">Map link</Label>
            <Input
              id="branch-map"
              value={values.map_link}
              onChange={(e) => set("map_link", e.target.value)}
              placeholder="https://maps..."
              aria-invalid={!!errors.map_link}
            />
            <FieldError message={errors.map_link} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="branch-address">Address</Label>
          <Textarea id="branch-address" value={values.address} onChange={(e) => set("address", e.target.value)} rows={3} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="branch-source">Source URL</Label>
          <Input
            id="branch-source"
            value={values.source_url}
            onChange={(e) => set("source_url", e.target.value)}
            placeholder="Optional reference URL"
            aria-invalid={!!errors.source_url}
          />
          <FieldError message={errors.source_url} />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" className="gap-1.5 cursor-pointer" onClick={onCancel} disabled={saving}>
            <X className="h-3.5 w-3.5" />
            Cancel
          </Button>
          <Button className="gap-1.5 cursor-pointer" onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {branch ? "Save Changes" : "Save Branch"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
