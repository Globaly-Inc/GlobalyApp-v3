"use client";

import { FormSection } from "@/components/ui/form-section";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CountryPanelProps } from "../types";

export function CountrySeoPanel({ country, onChange }: CountryPanelProps) {
  return (
    <FormSection title="Search engines" description="How the country page appears in search results." columns={1}>
      <FormField label="Meta title" htmlFor="seo-meta-title" hint={`${(country.meta_title ?? "").length}/60 characters`}>
        <Input className="h-10" id="seo-meta-title" value={country.meta_title ?? ""} onChange={(e) => onChange({ meta_title: e.target.value || null })} />
      </FormField>

      <FormField label="Meta description" htmlFor="seo-meta-description" hint={`${(country.meta_description ?? "").length}/160 characters`}>
        <Textarea
          id="seo-meta-description"
          className="min-h-20"
          rows={3}
          value={country.meta_description ?? ""}
          onChange={(e) => onChange({ meta_description: e.target.value || null })}
        />
      </FormField>
    </FormSection>
  );
}
