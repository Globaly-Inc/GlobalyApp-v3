"use client";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/field-error";

export function BasicInfoCard({
  businessName,
  onNameChange,
  nameError,
  description,
  onDescriptionChange,
  subdomain,
  onSubdomainChange,
  subdomainError,
}: Readonly<{
  businessName: string;
  onNameChange: (value: string) => void;
  nameError?: string;
  description: string;
  onDescriptionChange: (value: string) => void;
  subdomain: string;
  onSubdomainChange: (value: string) => void;
  subdomainError?: string;
}>) {
  return (
    <Card className="space-y-4 p-6">
      <h3 className="text-sm font-semibold text-foreground">Basic Information</h3>
      <div className="flex flex-col gap-2">
        <Label>Business Name *</Label>
        <Input
          className="h-10"
          aria-invalid={!!nameError}
          value={businessName}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. Global Education Services"
        />
        <FieldError message={nameError} />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Description</Label>
        <Textarea
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Brief description of this business..."
          rows={3}
          className="min-h-20"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Slug (URL identifier) *</Label>
        <Input
          className="h-10"
          aria-invalid={!!subdomainError}
          value={subdomain}
          onChange={(e) => onSubdomainChange(e.target.value)}
          placeholder="auto-generated-from-name"
        />
        <p className="text-xs text-muted-foreground">Auto-generated from name. Edit to customise.</p>
        <FieldError message={subdomainError} />
      </div>
    </Card>
  );
}
