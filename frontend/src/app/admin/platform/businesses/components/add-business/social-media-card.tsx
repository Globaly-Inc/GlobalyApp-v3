"use client";

import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { FormSection } from "@/components/ui/form-section";

type SocialField = { label: string; placeholder: string; value: string; onChange: (value: string) => void; error?: string };

export function SocialMediaCard({ fields }: Readonly<{ fields: SocialField[] }>) {
  return (
    <FormSection title="Social Media" columns={2}>
      {fields.map((f) => {
        const id = `social-${f.label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
        return (
          <FormField key={f.label} label={f.label} htmlFor={id} error={f.error}>
            <Input id={id} className="h-10" aria-invalid={!!f.error} value={f.value} onChange={(e) => f.onChange(e.target.value)} placeholder={f.placeholder} />
          </FormField>
        );
      })}
    </FormSection>
  );
}
