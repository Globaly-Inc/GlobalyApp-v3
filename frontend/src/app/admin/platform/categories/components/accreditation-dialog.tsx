"use client";

import { useEffect, useState } from "react";
import { Globe, X } from "lucide-react";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/combobox";
import { FieldError } from "@/components/field-error";
import { useValidatedForm } from "@/lib/use-validated-form";
import { RequiredMark } from "./required-mark";
import { flagFromIso2 } from "../utils";
import type { Accreditation, AccreditationInput, CountryOption, IssuingOrganization } from "../apis/types";

type FormState = {
  name: string;
  organizationId: string;
  website: string;
  description: string;
  sortOrder: string;
  scopeCountryIds: number[];
};

const schema: z.ZodType<FormState> = z.object({
  name: z.string().trim().min(1, "Name is required").max(200, "Name must be 200 characters or fewer"),
  organizationId: z.string(),
  website: z
    .string()
    .refine((v) => v === "" || /^https?:\/\/\S+\.\S+/.test(v), "Enter a valid URL starting with http:// or https://"),
  description: z.string().max(2000, "Description must be 2000 characters or fewer"),
  sortOrder: z.string().regex(/^\d+$/, "Sort order must be a whole number"),
  scopeCountryIds: z.array(z.number()),
});

export function AccreditationDialog({
  open,
  onOpenChange,
  editing,
  nextSortOrder,
  organizations,
  countries,
  onCreateOrganization,
  onSave,
  saving,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Accreditation | null;
  nextSortOrder: number;
  organizations: IssuingOrganization[];
  countries: CountryOption[];
  onCreateOrganization: (name: string) => Promise<IssuingOrganization>;
  onSave: (input: AccreditationInput) => Promise<boolean>;
  saving: boolean;
}>) {
  const [creatingOrg, setCreatingOrg] = useState(false);

  const initial = (): FormState =>
    editing
      ? {
          name: editing.name,
          organizationId: editing.issuing_organization_id ? String(editing.issuing_organization_id) : "",
          website: editing.website ?? "",
          description: editing.description ?? "",
          sortOrder: String(editing.sort_order),
          scopeCountryIds: editing.scope_country_ids,
        }
      : { name: "", organizationId: "", website: "", description: "", sortOrder: String(nextSortOrder), scopeCountryIds: [] };

  const { form, setForm, errors, reset, validate } = useValidatedForm(schema, initial);
  const isGlobal = form.scopeCountryIds.length === 0;
  const countryById = new Map(countries.map((c) => [c.id, c]));

  // `open` flips from the parent (row click), not from Dialog's own onOpenChange,
  // so the form has to re-sync here rather than in the close-only handler below.
  useEffect(() => {
    if (open) reset(initial());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  // Combobox is creatable: a value matching no option id is a new organisation name.
  const handleOrganizationChange = async (value: string) => {
    if (organizations.some((o) => String(o.id) === value)) {
      setForm((f) => ({ ...f, organizationId: value }));
      return;
    }
    setCreatingOrg(true);
    const created = await onCreateOrganization(value);
    setCreatingOrg(false);
    setForm((f) => ({ ...f, organizationId: String(created.id) }));
  };

  const toggleCountry = (id: number) =>
    setForm((f) => ({
      ...f,
      scopeCountryIds: f.scopeCountryIds.includes(id)
        ? f.scopeCountryIds.filter((c) => c !== id)
        : [...f.scopeCountryIds, id],
    }));

  const handleSubmit = async () => {
    const data = validate();
    if (!data) return;
    const ok = await onSave({
      name: data.name,
      issuing_organization_id: data.organizationId ? Number(data.organizationId) : null,
      website: data.website || null,
      description: data.description || null,
      sort_order: Number(data.sortOrder),
      scope_country_ids: data.scopeCountryIds,
    });
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit accreditation" : "New accreditation"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="acc-name">
              Accreditation / certification name
              <RequiredMark />
            </Label>
            <Input
              id="acc-name"
              value={form.name}
              placeholder="e.g. AACSB International"
              aria-invalid={!!errors.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <FieldError message={errors.name} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="acc-org">Issuing organisation</Label>
            <Combobox
              id="acc-org"
              className="w-full"
              creatable
              loading={creatingOrg}
              loadingText="Creating…"
              options={organizations.map((o) => ({ value: String(o.id), label: o.name }))}
              value={form.organizationId}
              onChange={handleOrganizationChange}
              placeholder="Select or create…"
              searchPlaceholder="Search organisations…"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Scope</Label>
            <Label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-normal">
              <Checkbox
                checked={isGlobal}
                onCheckedChange={(checked) => {
                  if (checked) setForm((f) => ({ ...f, scopeCountryIds: [] }));
                }}
              />
              <Globe className="size-3.5 text-muted-foreground" />
              Global (applies to all countries)
            </Label>

            <Combobox
              className="w-full"
              options={countries
                .filter((c) => !form.scopeCountryIds.includes(c.id))
                .map((c) => ({ value: String(c.id), label: `${flagFromIso2(c.iso2)} ${c.name}` }))}
              value=""
              onChange={(v) => toggleCountry(Number(v))}
              placeholder="Restrict to specific countries…"
              searchPlaceholder="Search countries…"
            />

            {form.scopeCountryIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {form.scopeCountryIds.map((id) => {
                  const country = countryById.get(id);
                  if (!country) return null;
                  return (
                    <Badge key={id} variant="secondary">
                      <span>{flagFromIso2(country.iso2)}</span>
                      {country.name}
                      <button
                        type="button"
                        aria-label={`Remove ${country.name}`}
                        className="cursor-pointer rounded-full p-0.5 hover:bg-foreground/10"
                        onClick={() => toggleCountry(id)}
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="acc-website">Website</Label>
            <Input
              id="acc-website"
              value={form.website}
              placeholder="https://…"
              aria-invalid={!!errors.website}
              onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
            />
            <FieldError message={errors.website} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="acc-description">Description</Label>
            <Textarea
              id="acc-description"
              rows={2}
              value={form.description}
              placeholder="Brief description…"
              aria-invalid={!!errors.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
            <FieldError message={errors.description} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="acc-sort">Sort order</Label>
            <Input
              id="acc-sort"
              inputMode="numeric"
              value={form.sortOrder}
              aria-invalid={!!errors.sortOrder}
              onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
            />
            <FieldError message={errors.sortOrder} />
          </div>
        </div>

        <DialogFooter>
          <Button className="w-full h-10" onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : "Create accreditation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
