"use client";

import { FormSection } from "@/components/ui/form-section";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CountryPanelProps } from "../types";

export function CountryVisaPanel({ country, onChange }: CountryPanelProps) {
  return (
    <FormSection title="Student visa" description="The main visa students apply for." columns={2}>
        <FormField label="Visa type" htmlFor="visa-type">
          <Input className="h-10" id="visa-type" value={country.visa_type ?? ""} onChange={(e) => onChange({ visa_type: e.target.value || null })} />
        </FormField>

        <FormField label="Processing time" htmlFor="visa-processing-time">
          <Input
            className="h-10"
            id="visa-processing-time"
            value={country.visa_processing_time ?? ""}
            onChange={(e) => onChange({ visa_processing_time: e.target.value || null })}
          />
        </FormField>

        <FormField label="Visa fee" htmlFor="visa-fee">
          <Input className="h-10" id="visa-fee" value={country.visa_fee ?? ""} onChange={(e) => onChange({ visa_fee: e.target.value || null })} />
        </FormField>

        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="visa-description">Description</Label>
          <Textarea
            className="min-h-20"
            id="visa-description"
            rows={4}
            value={country.visa_description ?? ""}
            onChange={(e) => onChange({ visa_description: e.target.value || null })}
          />
        </div>
    </FormSection>
  );
}
