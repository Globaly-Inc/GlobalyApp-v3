"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { categoriesApi, type CountryOption } from "@/app/admin/platform/categories/apis";
import { flagFromIso2 } from "@/app/admin/platform/categories/utils";
import { ApiError, fieldErrorsFrom } from "@/lib/api/http";
import { Combobox } from "@/components/combobox";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/field-error";
import { useValidatedForm } from "@/lib/use-validated-form";
import { scholarshipsApi } from "../apis";
import { BASIS_OPTIONS, COVERAGE_TYPE_OPTIONS, SOURCE_TYPE_OPTIONS } from "../const";
import { toSlug } from "../utils";
import type { Scholarship, ScholarshipInput } from "../apis/types";
import { DegreeLevelPicker } from "./degree-level-picker";

/** Maps a backend field name (wire schema) to this form's local (camelCase) field key, for displaying server-side validation errors under the right input. */
const WIRE_TO_FORM: Record<string, keyof FormState> = {
  title: "title", slug: "slug", description: "description", provider_name: "providerName",
  source_type: "sourceType", country: "country", city: "city", region: "region", basis: "basis",
  degree_levels: "degreeLevels", requirements_summary: "requirementsSummary", coverage_type: "coverageType",
  coverage_amount: "coverageAmount", coverage_currency: "coverageCurrency", coverage_description: "coverageDescription",
  deadline: "deadline", deadline_notes: "deadlineNotes", application_url: "applicationUrl", source_url: "sourceUrl",
};

const urlOrEmpty = z.string().trim().refine((v) => v === "" || z.string().url().safeParse(v).success, "Enter a valid URL");

type FormState = {
  title: string;
  slug: string;
  description: string;
  providerName: string;
  sourceType: string;
  country: string;
  city: string;
  region: string;
  basis: string;
  degreeLevels: string[];
  requirementsSummary: string;
  coverageType: string;
  coverageAmount: string;
  coverageCurrency: string;
  coverageDescription: string;
  deadline: string;
  deadlineNotes: string;
  applicationUrl: string;
  sourceUrl: string;
  isFeatured: boolean;
};

const schema: z.ZodType<FormState> = z.object({
  title: z.string().trim().min(1, "Title is required").max(300),
  slug: z.string().trim().min(1, "Slug is required").regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase words separated by hyphens"),
  description: z.string(),
  providerName: z.string().max(300),
  sourceType: z.string(),
  country: z.string().max(200),
  city: z.string().max(200),
  region: z.string().max(200),
  basis: z.string(),
  degreeLevels: z.array(z.string()),
  requirementsSummary: z.string(),
  coverageType: z.string(),
  coverageAmount: z.string().regex(/^\d*\.?\d*$/, "Enter a valid amount"),
  coverageCurrency: z.string().max(10),
  coverageDescription: z.string(),
  deadline: z.string(),
  deadlineNotes: z.string(),
  applicationUrl: urlOrEmpty,
  sourceUrl: urlOrEmpty,
  isFeatured: z.boolean(),
});

const empty = (): FormState => ({
  title: "", slug: "", description: "", providerName: "", sourceType: "university",
  country: "", city: "", region: "", basis: "", degreeLevels: [], requirementsSummary: "",
  coverageType: "various", coverageAmount: "", coverageCurrency: "USD", coverageDescription: "",
  deadline: "", deadlineNotes: "", applicationUrl: "", sourceUrl: "", isFeatured: false,
});

const fromScholarship = (s: Scholarship): FormState => ({
  title: s.title, slug: s.slug, description: s.description ?? "", providerName: s.provider_name ?? "",
  sourceType: s.source_type, country: s.country ?? "", city: s.city ?? "", region: s.region ?? "",
  basis: s.basis ?? "", degreeLevels: s.degree_levels, requirementsSummary: s.requirements_summary ?? "",
  coverageType: s.coverage_type, coverageAmount: s.coverage_amount != null ? String(s.coverage_amount) : "",
  coverageCurrency: s.coverage_currency ?? "USD", coverageDescription: s.coverage_description ?? "",
  deadline: s.deadline ?? "", deadlineNotes: s.deadline_notes ?? "", applicationUrl: s.application_url ?? "",
  sourceUrl: s.source_url ?? "", isFeatured: s.is_featured,
});

/** Only ever pass through a strict YYYY-MM-DD value — anything else becomes null rather than a backend 400. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function cleanDeadline(value: string): string | null {
  return DATE_RE.test(value) ? value : null;
}

export function ScholarshipDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Scholarship | null;
  onSaved: () => void;
}>) {
  const initial = () => (editing ? fromScholarship(editing) : empty());
  const { form, setForm, errors, reset, validate } = useValidatedForm(schema, initial);
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [serverErrors, setServerErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      reset(initial());
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears any error from a previous open of this dialog instance
      setServerErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  useEffect(() => {
    if (open && countries.length === 0) categoriesApi.getCountries().then(setCountries);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const countryOptions = countries.map((c) => ({ value: c.name, label: `${flagFromIso2(c.iso2)} ${c.name}` }));
  const errorFor = (key: keyof FormState) => errors[key] ?? serverErrors[key];

  const handleSubmit = async (publish: boolean) => {
    const data = validate();
    if (!data) return;
    const input: ScholarshipInput = {
      title: data.title,
      slug: data.slug,
      description: data.description || null,
      provider_name: data.providerName || null,
      source_type: data.sourceType as ScholarshipInput["source_type"],
      country: data.country || null,
      city: data.city || null,
      region: data.region || null,
      basis: (data.basis || null) as ScholarshipInput["basis"],
      degree_levels: data.degreeLevels,
      requirements_summary: data.requirementsSummary || null,
      coverage_type: data.coverageType as ScholarshipInput["coverage_type"],
      coverage_amount: data.coverageAmount ? Number(data.coverageAmount) : null,
      coverage_currency: data.coverageCurrency || null,
      coverage_description: data.coverageDescription || null,
      deadline: cleanDeadline(data.deadline),
      deadline_notes: data.deadlineNotes || null,
      application_url: data.applicationUrl || null,
      source_url: data.sourceUrl || null,
      is_published: publish,
      is_featured: data.isFeatured,
    };

    setSaving(true);
    setServerErrors({});
    try {
      if (editing) await scholarshipsApi.updateScholarship(editing.id, input);
      else await scholarshipsApi.createScholarship(input);
      toast.success(editing ? "Scholarship updated" : "Scholarship created");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      const wireErrors = fieldErrorsFrom(err);
      const mapped: Partial<Record<keyof FormState, string>> = {};
      for (const [wireKey, message] of Object.entries(wireErrors)) {
        const formKey = WIRE_TO_FORM[wireKey];
        if (formKey) mapped[formKey] = message;
      }
      if (Object.keys(mapped).length > 0) {
        setServerErrors(mapped);
        toast.error("Some fields need attention", { description: "Fix the highlighted fields and try again." });
      } else {
        toast.error("Something went wrong", { description: err instanceof ApiError ? err.message : "Please try again." });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit scholarship" : "New scholarship"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sch-title">Title<span className="text-destructive"> *</span></Label>
            <Input
              id="sch-title"
              className="h-10"
              value={form.title}
              aria-invalid={!!errorFor("title")}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value, slug: editing ? f.slug : toSlug(e.target.value) }))}
            />
            <FieldError message={errorFor("title")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sch-slug">Slug<span className="text-destructive"> *</span></Label>
            <Input id="sch-slug" className="h-10" value={form.slug} aria-invalid={!!errorFor("slug")} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} />
            <FieldError message={errorFor("slug")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sch-description">Description</Label>
            <Textarea id="sch-description" rows={4} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sch-provider">Provider name</Label>
              <Input id="sch-provider" className="h-10" value={form.providerName} onChange={(e) => setForm((f) => ({ ...f, providerName: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Source type</Label>
              <Combobox options={SOURCE_TYPE_OPTIONS} value={form.sourceType} onChange={(v) => setForm((f) => ({ ...f, sourceType: v }))} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="sch-country">Country</Label>
              <Combobox
                id="sch-country"
                options={countryOptions}
                value={form.country}
                onChange={(v) => setForm((f) => ({ ...f, country: v }))}
                placeholder="Select country"
                creatable
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sch-city">City</Label>
              <Input id="sch-city" className="h-10" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sch-region">Region</Label>
              <Input id="sch-region" className="h-10" value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Basis</Label>
            <Combobox options={BASIS_OPTIONS} value={form.basis} onChange={(v) => setForm((f) => ({ ...f, basis: v }))} placeholder="None" />
          </div>

          <div className="space-y-2">
            <Label>Eligible degree levels</Label>
            <DegreeLevelPicker value={form.degreeLevels} onChange={(v) => setForm((f) => ({ ...f, degreeLevels: v }))} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sch-requirements">Requirements summary</Label>
            <Textarea id="sch-requirements" rows={3} value={form.requirementsSummary} onChange={(e) => setForm((f) => ({ ...f, requirementsSummary: e.target.value }))} />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Coverage type</Label>
              <Combobox options={COVERAGE_TYPE_OPTIONS} value={form.coverageType} onChange={(v) => setForm((f) => ({ ...f, coverageType: v }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sch-amount">Amount</Label>
              <Input id="sch-amount" className="h-10" inputMode="decimal" value={form.coverageAmount} aria-invalid={!!errorFor("coverageAmount")} onChange={(e) => setForm((f) => ({ ...f, coverageAmount: e.target.value }))} />
              <FieldError message={errorFor("coverageAmount")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sch-currency">Currency</Label>
              <Input id="sch-currency" className="h-10" value={form.coverageCurrency} onChange={(e) => setForm((f) => ({ ...f, coverageCurrency: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sch-coverage-description">Coverage description</Label>
            <Textarea id="sch-coverage-description" rows={2} value={form.coverageDescription} onChange={(e) => setForm((f) => ({ ...f, coverageDescription: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Deadline</Label>
              <DatePicker value={form.deadline} onChange={(v) => setForm((f) => ({ ...f, deadline: v }))} aria-invalid={!!errorFor("deadline")} />
              <FieldError message={errorFor("deadline")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sch-deadline-notes">Deadline notes</Label>
              <Input id="sch-deadline-notes" className="h-10" value={form.deadlineNotes} onChange={(e) => setForm((f) => ({ ...f, deadlineNotes: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sch-apply-url">Application URL</Label>
              <Input id="sch-apply-url" type="url" className="h-10" value={form.applicationUrl} aria-invalid={!!errorFor("applicationUrl")} onChange={(e) => setForm((f) => ({ ...f, applicationUrl: e.target.value }))} />
              <FieldError message={errorFor("applicationUrl")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sch-source-url">Source URL</Label>
              <Input id="sch-source-url" type="url" className="h-10" value={form.sourceUrl} aria-invalid={!!errorFor("sourceUrl")} onChange={(e) => setForm((f) => ({ ...f, sourceUrl: e.target.value }))} />
              <FieldError message={errorFor("sourceUrl")} />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="sch-featured">Featured</Label>
              <p className="text-xs text-muted-foreground">Shown at the top of the public listing, ahead of non-featured scholarships.</p>
            </div>
            <Switch id="sch-featured" checked={form.isFeatured} onCheckedChange={(v) => setForm((f) => ({ ...f, isFeatured: v }))} />
          </div>
        </div>

        <DialogFooter className="justify-end gap-2">
          <Button variant="outline" className="h-10" onClick={() => handleSubmit(false)} disabled={saving}>
            {saving ? "Saving…" : "Save as draft"}
          </Button>
          <Button className="h-10" onClick={() => handleSubmit(true)} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save & publish" : "Create & publish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
