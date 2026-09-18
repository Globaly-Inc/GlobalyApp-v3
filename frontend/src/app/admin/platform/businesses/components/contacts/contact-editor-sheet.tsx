"use client";

import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/field-error";
import { useValidatedForm } from "@/lib/use-validated-form";
import { flagFromIso2 } from "@/app/admin/platform/categories/utils";
import { splitPhone } from "@/lib/utils";
import type { CountryOption } from "@/app/admin/platform/categories/apis";
import type { Contact, ContactInput, PreferredChannel } from "../../apis/types";

// Ported from V1's AdminContactEditorSheet — hardcoded lists there too, no lookup fetch.
const DEPARTMENTS = ["Admissions", "Marketing", "Partnerships", "Finance", "Other"];
const CHANNELS: { value: PreferredChannel; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "linkedin", label: "LinkedIn" },
];

type FormState = {
  fullName: string; jobTitle: string; department: string;
  email: string; phoneCountryId: string; phoneNumber: string;
  linkedinUrl: string; otherUrl: string; tags: string[]; tagDraft: string;
  preferredChannel: string; isPrimary: boolean; notes: string;
};

const EMPTY_FORM: FormState = {
  fullName: "", jobTitle: "", department: "",
  email: "", phoneCountryId: "", phoneNumber: "",
  linkedinUrl: "", otherUrl: "", tags: [], tagDraft: "",
  preferredChannel: "", isPrimary: false, notes: "",
};

const urlField = z.string().refine((v) => v === "" || /^https?:\/\/.+/i.test(v), "Enter a valid URL");

const schema = z
  .object({
    fullName: z.string().trim().min(2, "Name must be at least 2 characters."),
    jobTitle: z.string(),
    department: z.string(),
    email: z.string().refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email"),
    phoneCountryId: z.string(),
    phoneNumber: z.string(),
    linkedinUrl: urlField,
    otherUrl: urlField,
    tags: z.array(z.string()),
    tagDraft: z.string(),
    preferredChannel: z.string(),
    isPrimary: z.boolean(),
    notes: z.string().max(2000, "Notes must be 2000 characters or fewer."),
  })
  .refine((d) => !!d.email || !!d.phoneNumber || !!d.linkedinUrl, {
    message: "Provide at least one of email, phone, or LinkedIn.",
    path: ["email"],
  });

function toForm(c: Contact, countries: CountryOption[]): FormState {
  const { phoneCountryId, phoneNumber } = splitPhone(c.phone, countries);
  return {
    fullName: c.full_name,
    jobTitle: c.job_title ?? "",
    department: c.department ?? "",
    email: c.email ?? "",
    phoneCountryId,
    phoneNumber,
    linkedinUrl: c.linkedin_url ?? "",
    otherUrl: c.other_url ?? "",
    tags: c.tags,
    tagDraft: "",
    preferredChannel: c.preferred_channel ?? "",
    isPrimary: c.is_primary,
    notes: c.notes ?? "",
  };
}

export function ContactEditorSheet({
  open,
  onOpenChange,
  countries,
  contact,
  onSave,
  saving,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  countries: CountryOption[];
  contact?: Contact | null;
  onSave: (input: ContactInput) => Promise<boolean>;
  saving: boolean;
}>) {
  const isEdit = !!contact;
  const { form, setForm, errors, reset, validate } = useValidatedForm(schema, () => (contact ? toForm(contact, countries) : EMPTY_FORM));

  useEffect(() => {
    if (!open) return;
    reset(contact ? toForm(contact, countries) : EMPTY_FORM);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contact]);

  const phoneCountryOptions = useMemo(
    () => countries
      .filter((c) => c.phoneCode)
      .map((c) => ({ value: String(c.id), label: `${c.name} (${c.phoneCode})`, icon: <span>{flagFromIso2(c.iso2)}</span> })),
    [countries],
  );

  const addTag = () => {
    const value = form.tagDraft.trim();
    if (!value) return;
    if (!form.tags.includes(value)) setForm((f) => ({ ...f, tags: [...f.tags, value], tagDraft: "" }));
    else setForm((f) => ({ ...f, tagDraft: "" }));
  };

  const removeTag = (tag: string) => setForm((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }));

  const handleSubmit = async () => {
    const data = validate();
    if (!data) return;
    const phoneCode = countries.find((c) => String(c.id) === data.phoneCountryId)?.phoneCode ?? "";
    const phone = [phoneCode, data.phoneNumber].filter(Boolean).join(" ");
    const ok = await onSave({
      full_name: data.fullName,
      job_title: data.jobTitle || null,
      department: data.department || null,
      email: data.email || null,
      phone: phone || null,
      phone_country_code: data.phoneNumber ? phoneCode || null : null,
      linkedin_url: data.linkedinUrl || null,
      other_url: data.otherUrl || null,
      tags: data.tags,
      preferred_channel: (data.preferredChannel || null) as PreferredChannel | null,
      is_primary: data.isPrimary,
      notes: data.notes || null,
    });
    if (ok) onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit contact" : "Add contact"}</SheetTitle>
          <SheetDescription>Private record — visible only to Super Admins. Never shown to the business or public.</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-4">
          <div className="flex flex-col gap-2">
            <Label>
              Full name <span className="text-destructive">*</span>
            </Label>
            <Input className="h-10" value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} placeholder="Jane Doe" aria-invalid={!!errors.fullName} />
            <FieldError message={errors.fullName} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label>Job title</Label>
              <Input className="h-10" value={form.jobTitle} onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))} placeholder="Marketing Lead" />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Department</Label>
              <Combobox
                value={form.department}
                onChange={(v) => setForm((f) => ({ ...f, department: v }))}
                placeholder="Select"
                searchPlaceholder="Search..."
                options={DEPARTMENTS.map((d) => ({ value: d, label: d }))}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Email</Label>
            <Input className="h-10" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="contact@example.com" aria-invalid={!!errors.email} />
            <FieldError message={errors.email} />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Phone</Label>
            <div className="grid grid-cols-[160px_1fr] gap-3">
              <Combobox
                value={form.phoneCountryId}
                onChange={(v) => setForm((f) => ({ ...f, phoneCountryId: v }))}
                placeholder="Code"
                searchPlaceholder="Search countries..."
                options={phoneCountryOptions}
              />
              <Input
                className="h-10"
                value={form.phoneNumber}
                onChange={(e) => setForm((f) => ({ ...f, phoneNumber: e.target.value }))}
                placeholder="(201) 555-0123"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>LinkedIn URL</Label>
            <Input className="h-10" value={form.linkedinUrl} onChange={(e) => setForm((f) => ({ ...f, linkedinUrl: e.target.value }))} placeholder="https://linkedin.com/in/..." aria-invalid={!!errors.linkedinUrl} />
            <FieldError message={errors.linkedinUrl} />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Other URL</Label>
            <Input className="h-10" value={form.otherUrl} onChange={(e) => setForm((f) => ({ ...f, otherUrl: e.target.value }))} placeholder="https://..." aria-invalid={!!errors.otherUrl} />
            <FieldError message={errors.otherUrl} />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Tags</Label>
            <div className="flex gap-2">
              <Input
                className="h-10"
                value={form.tagDraft}
                onChange={(e) => setForm((f) => ({ ...f, tagDraft: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Add tag and press Enter"
              />
              <Button type="button" variant="outline" className="h-10" onClick={addTag}>
                Add
              </Button>
            </div>
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {form.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                    {tag}
                    <button type="button" onClick={() => removeTag(tag)} aria-label={`Remove tag ${tag}`}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label>Preferred channel</Label>
            <Combobox
              value={form.preferredChannel}
              onChange={(v) => setForm((f) => ({ ...f, preferredChannel: v }))}
              placeholder="None"
              searchPlaceholder="Search..."
              options={CHANNELS}
            />
          </div>

          <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <span>
              <span className="block text-sm font-medium">Primary contact</span>
              <span className="block text-xs text-muted-foreground">Only one primary per business.</span>
            </span>
            <Switch checked={form.isPrimary} onCheckedChange={(v) => setForm((f) => ({ ...f, isPrimary: v }))} />
          </label>

          <div className="flex flex-col gap-2">
            <Label>Internal notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value.slice(0, 2000) }))}
              placeholder="Private notes (max 2000 chars)"
              className="min-h-24"
            />
            <div className="text-right text-xs text-muted-foreground">{form.notes.length}/2000</div>
            <FieldError message={errors.notes} />
          </div>
        </div>

        <SheetFooter className="flex-row justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add contact"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
