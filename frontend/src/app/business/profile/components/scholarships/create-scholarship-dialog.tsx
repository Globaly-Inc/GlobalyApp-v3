"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { categoriesApi, type CountryOption } from "@/app/admin/platform/categories/apis";
import { flagFromIso2 } from "@/app/admin/platform/categories/utils";
import { BASIS_OPTIONS, COVERAGE_TYPE_OPTIONS } from "@/app/admin/monitoring/scholarships/const";
import { DegreeLevelPicker } from "@/app/admin/monitoring/scholarships/components/degree-level-picker";
import { Combobox } from "@/components/combobox";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/field-error";
import { useValidatedForm } from "@/lib/use-validated-form";
import { useAppDispatch } from "@/lib/hooks";
import { createScholarship, updateScholarship } from "../../store/business-profile-detail-slice";
import type { Scholarship, ScholarshipInput } from "../../apis/types";

function toSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const urlOrEmpty = z.string().trim().refine((v) => v === "" || z.string().url().safeParse(v).success, "Enter a valid URL");

type FormState = {
  title: string; slug: string; description: string; providerName: string; sourceType: string;
  country: string; city: string; region: string; basis: string; degreeLevels: string[];
  requirementsSummary: string; coverageType: string; coverageAmount: string; coverageCurrency: string;
  coverageDescription: string; deadline: string; deadlineNotes: string; applicationUrl: string; sourceUrl: string;
};

const schema: z.ZodType<FormState> = z.object({
  title: z.string().trim().min(1, "Title is required").max(300),
  slug: z.string().trim().min(1, "Slug is required").regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase words separated by hyphens"),
  description: z.string(), providerName: z.string().max(300), sourceType: z.string(),
  country: z.string().max(200), city: z.string().max(200), region: z.string().max(200),
  basis: z.string(), degreeLevels: z.array(z.string()), requirementsSummary: z.string(),
  coverageType: z.string(), coverageAmount: z.string().regex(/^\d*\.?\d*$/, "Enter a valid amount"),
  coverageCurrency: z.string().max(10), coverageDescription: z.string(),
  deadline: z.string(), deadlineNotes: z.string(), applicationUrl: urlOrEmpty, sourceUrl: urlOrEmpty,
});

const empty = (): FormState => ({
  title: "", slug: "", description: "", providerName: "", sourceType: "university",
  country: "", city: "", region: "", basis: "", degreeLevels: [], requirementsSummary: "",
  coverageType: "various", coverageAmount: "", coverageCurrency: "USD", coverageDescription: "",
  deadline: "", deadlineNotes: "", applicationUrl: "", sourceUrl: "",
});

const fromScholarship = (s: Scholarship): FormState => ({
  title: s.title, slug: s.slug, description: s.description ?? "", providerName: s.provider_name ?? "",
  sourceType: s.source_type, country: s.country ?? "", city: s.city ?? "", region: s.region ?? "",
  basis: s.basis ?? "", degreeLevels: s.degree_levels, requirementsSummary: s.requirements_summary ?? "",
  coverageType: s.coverage_type, coverageAmount: s.coverage_amount != null ? String(s.coverage_amount) : "",
  coverageCurrency: s.coverage_currency ?? "USD", coverageDescription: s.coverage_description ?? "",
  deadline: s.deadline ?? "", deadlineNotes: s.deadline_notes ?? "", applicationUrl: s.application_url ?? "",
  sourceUrl: s.source_url ?? "",
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function cleanDeadline(value: string): string | null {
  return DATE_RE.test(value) ? value : null;
}

export function CreateScholarshipDialog({
  open,
  onOpenChange,
  businessId,
  editing,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void; businessId: number; editing: Scholarship | null }>) {
  const dispatch = useAppDispatch();
  const initial = () => (editing ? fromScholarship(editing) : empty());
  const { form, setForm, errors, reset, validate } = useValidatedForm(schema, initial);
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) reset(initial());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  useEffect(() => {
    if (open && countries.length === 0) categoriesApi.getCountries().then(setCountries);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const countryOptions = countries.map((c) => ({ value: c.name, label: `${flagFromIso2(c.iso2)} ${c.name}` }));

  const handleSubmit = async (publish: boolean) => {
    const data = validate();
    if (!data) return;
    const input: ScholarshipInput = {
      title: data.title, slug: data.slug, description: data.description || null,
      provider_name: data.providerName || null, source_type: data.sourceType as ScholarshipInput["source_type"],
      country: data.country || null, city: data.city || null, region: data.region || null,
      basis: (data.basis || null) as ScholarshipInput["basis"], degree_levels: data.degreeLevels,
      requirements_summary: data.requirementsSummary || null, coverage_type: data.coverageType as ScholarshipInput["coverage_type"],
      coverage_amount: data.coverageAmount ? Number(data.coverageAmount) : null, coverage_currency: data.coverageCurrency || null,
      coverage_description: data.coverageDescription || null, deadline: cleanDeadline(data.deadline),
      deadline_notes: data.deadlineNotes || null, application_url: data.applicationUrl || null,
      source_url: data.sourceUrl || null, is_published: publish,
    };

    setSaving(true);
    try {
      if (editing) await dispatch(updateScholarship({ id: businessId, scholarshipId: editing.id, patch: input })).unwrap();
      else await dispatch(createScholarship({ id: businessId, input })).unwrap();
      toast.success(editing ? "Scholarship updated" : "Scholarship created");
      onOpenChange(false);
    } catch (e) {
      toast.error(editing ? "Couldn't update scholarship" : "Couldn't create scholarship", { description: (e as Error).message });
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
            <Label htmlFor="bsch-title">Title<span className="text-destructive"> *</span></Label>
            <Input
              id="bsch-title"
              className="h-10"
              value={form.title}
              aria-invalid={!!errors.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value, slug: editing ? f.slug : toSlug(e.target.value) }))}
            />
            <FieldError message={errors.title} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bsch-description">Description</Label>
            <Textarea id="bsch-description" rows={4} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="bsch-country">Country</Label>
              <Combobox id="bsch-country" options={countryOptions} value={form.country} onChange={(v) => setForm((f) => ({ ...f, country: v }))} placeholder="Select country" creatable />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bsch-city">City</Label>
              <Input id="bsch-city" className="h-10" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Basis</Label>
              <Combobox options={BASIS_OPTIONS} value={form.basis} onChange={(v) => setForm((f) => ({ ...f, basis: v }))} placeholder="None" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Eligible degree levels</Label>
            <DegreeLevelPicker value={form.degreeLevels} onChange={(v) => setForm((f) => ({ ...f, degreeLevels: v }))} />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Coverage type</Label>
              <Combobox options={COVERAGE_TYPE_OPTIONS} value={form.coverageType} onChange={(v) => setForm((f) => ({ ...f, coverageType: v }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bsch-amount">Amount</Label>
              <Input id="bsch-amount" className="h-10" inputMode="decimal" value={form.coverageAmount} aria-invalid={!!errors.coverageAmount} onChange={(e) => setForm((f) => ({ ...f, coverageAmount: e.target.value }))} />
              <FieldError message={errors.coverageAmount} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bsch-currency">Currency</Label>
              <Input id="bsch-currency" className="h-10" value={form.coverageCurrency} onChange={(e) => setForm((f) => ({ ...f, coverageCurrency: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Deadline</Label>
              <DatePicker value={form.deadline} onChange={(v) => setForm((f) => ({ ...f, deadline: v }))} aria-invalid={!!errors.deadline} />
              <FieldError message={errors.deadline} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bsch-apply-url">Application URL</Label>
              <Input id="bsch-apply-url" type="url" className="h-10" value={form.applicationUrl} aria-invalid={!!errors.applicationUrl} onChange={(e) => setForm((f) => ({ ...f, applicationUrl: e.target.value }))} />
              <FieldError message={errors.applicationUrl} />
            </div>
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
