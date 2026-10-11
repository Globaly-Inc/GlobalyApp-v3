"use client";

import { z } from "zod";
import { useEffect, useState } from "react";
import { Loader2, Save, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/combobox";
import { FieldError } from "@/components/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { geoApi, type City, type Country } from "@/app/geo/apis";

export type AgentValues = {
  name: string; country: string; email: string; phone: string; website: string;
  city: string; state: string; postcode: string; address: string;
};
const EMPTY: AgentValues = {
  name: "", country: "", email: "", phone: "", website: "",
  city: "", state: "", postcode: "", address: "",
};

const agentSchema = z.object({
  name: z.string().trim().min(1, "Agent / Agency name is required"),
  country: z.string(),
  email: z
    .string()
    .trim()
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), { message: "Enter a valid email address" }),
  phone: z.string(),
  website: z
    .string()
    .trim()
    .refine((v) => !v || /^https?:\/\//i.test(v), { message: "Website must start with http:// or https://" }),
  city: z.string(),
  state: z.string(),
  postcode: z.string(),
  address: z.string(),
});

export function AddAgentForm({
  saving,
  onCancel,
  onSave,
}: Readonly<{ saving: boolean; onCancel: () => void; onSave: (v: AgentValues) => void }>) {
  const [values, setValues] = useState<AgentValues>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [countries, setCountries] = useState<Country[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);

  const set = (key: keyof AgentValues, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((e) => { const next = { ...e }; delete next[key]; return next; });
  };

  useEffect(() => {
    geoApi.getCountries()
      .then(setCountries)
      .catch((e: Error) => toast.error("Could not load countries", { description: e.message }));
  }, []);

  // Same country → city dependency as the branch form.
  const countryId = countries.find((c) => c.name === values.country)?.id;
  useEffect(() => {
    if (!countryId) {
      setCities([]);
      return;
    }
    setCitiesLoading(true);
    geoApi.getCities(countryId)
      .then(setCities)
      .catch((e: Error) => toast.error("Could not load cities", { description: e.message }))
      .finally(() => setCitiesLoading(false));
  }, [countryId]);

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary" />
          Add Agent
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-name">
              Agent / Agency Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="agent-name"
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. AECC Global"
              aria-invalid={!!errors.name}
            />
            <FieldError message={errors.name} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-country">Country</Label>
            <Combobox
              id="agent-country"
              options={countries.map((c) => ({ value: c.name, label: c.name }))}
              value={values.country}
              onChange={(v) => setValues((prev) => ({ ...prev, country: v, city: "" }))}
              placeholder="Select country"
              loading={countries.length === 0}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-email">Email</Label>
            <Input
              id="agent-email"
              type="email"
              value={values.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="contact@..."
              aria-invalid={!!errors.email}
            />
            <FieldError message={errors.email} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-phone">Phone</Label>
            <Input id="agent-phone" value={values.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+61 ..." />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-city">City</Label>
            <Combobox
              id="agent-city"
              options={cities.map((c) => ({ value: c.name, label: c.name }))}
              value={values.city}
              onChange={(v) => {
                const picked = cities.find((c) => c.name === v);
                setValues((prev) => ({ ...prev, city: v, state: prev.state || picked?.stateName || "" }));
              }}
              placeholder={countryId ? "Select city" : "Select a country first"}
              disabled={!countryId}
              loading={citiesLoading}
              creatable
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-state">State / Region</Label>
            <Input id="agent-state" value={values.state} onChange={(e) => set("state", e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-postcode">Postcode</Label>
            <Input id="agent-postcode" value={values.postcode} onChange={(e) => set("postcode", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-website">Website</Label>
            <Input
              id="agent-website"
              value={values.website}
              onChange={(e) => set("website", e.target.value)}
              placeholder="https://..."
              aria-invalid={!!errors.website}
            />
            <FieldError message={errors.website} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="agent-address">Address</Label>
          <Textarea id="agent-address" value={values.address} onChange={(e) => set("address", e.target.value)} rows={3} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" className="cursor-pointer" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button
            className="gap-1.5 cursor-pointer"
            disabled={saving}
            onClick={() => {
              const result = agentSchema.safeParse(values);
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
