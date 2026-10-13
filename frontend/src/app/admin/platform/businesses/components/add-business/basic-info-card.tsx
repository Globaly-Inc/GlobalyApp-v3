"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { FormSection } from "@/components/ui/form-section";

export function BasicInfoCard({
  businessName,
  onNameChange,
  nameError,
  description,
  onDescriptionChange,
}: Readonly<{
  businessName: string;
  onNameChange: (value: string) => void;
  nameError?: string;
  description: string;
  onDescriptionChange: (value: string) => void;
}>) {
  return (
    <FormSection title="Basic Information" columns={1}>
      <FormField label="Business Name" htmlFor="business-name" required error={nameError}>
        <Input
          id="business-name"
          className="h-10"
          aria-invalid={!!nameError}
          value={businessName}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. Global Education Services"
        />
      </FormField>
      <FormField label="Description" htmlFor="business-description">
        <Textarea
          id="business-description"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Brief description of this business..."
          rows={3}
          className="min-h-20"
        />
      </FormField>
    </FormSection>
  );
}
