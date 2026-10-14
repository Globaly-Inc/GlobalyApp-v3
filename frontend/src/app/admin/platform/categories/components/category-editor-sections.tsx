"use client";

import { Badge } from "@/components/ui/badge";
import { FormSection } from "@/components/ui/form-section";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import type { Category } from "../apis/types";
import { DefaultServicesPicker } from "./default-services-picker";
import { SchemaFieldsEditor } from "./schema-fields-editor";

// Informational only — not fetched from the DB. Mirrors the columns on `businesses`
// so admins know what every business category gets for free before adding schema fields.
const BUSINESS_CORE_FIELDS: { name: string; type: string }[] = [
  { name: "Contact Name", type: "text" },
  { name: "Business Name", type: "text" },
  { name: "Business Type / Company Size", type: "select" },
  { name: "Description", type: "text" },
  { name: "Legal Name / Registration Number", type: "text" },
  { name: "Registration Licenses", type: "file" },
  { name: "Country / State / City / Address", type: "location" },
  { name: "Email", type: "email" },
  { name: "Phone", type: "phone" },
  { name: "Website", type: "url" },
  { name: "LinkedIn / Facebook / Instagram / Twitter / YouTube", type: "url" },
  { name: "Logo / Cover Image", type: "image" },
];

export function BusinessCoreFieldsSection() {
  return (
    <FormSection
      title="Business Core Fields (Built-in)"
      description="These fields are already part of every business profile and cannot be modified here."
      contentClassName="gap-x-6 gap-y-1.5"
    >
      {BUSINESS_CORE_FIELDS.map((field) => (
        <div key={field.name} className="flex items-center gap-2 py-1">
          <Badge variant="outline" className="shrink-0 font-mono text-xs">
            {field.type}
          </Badge>
          <span className="text-sm text-muted-foreground">{field.name}</span>
        </div>
      ))}
    </FormSection>
  );
}

export function SchemaFieldsSection({
  kind,
  categoryId,
  description,
  className,
}: Readonly<{ kind: "business" | "service" | "other-service"; categoryId: number | null; description: string; className?: string }>) {
  return (
    <FormSection title="Schema Fields" description={description} columns={1} className={className}>
      <SchemaFieldsEditor kind={kind} categoryId={categoryId} />
    </FormSection>
  );
}

export function DefaultServicesSection({
  loading,
  serviceCategories,
  selectedIds,
  onChange,
}: Readonly<{ loading: boolean; serviceCategories: Category[]; selectedIds: number[]; onChange: (ids: number[]) => void }>) {
  return (
    <FormSection
      title="Default Allowed Service Categories"
      description="Select which service categories are automatically allowed when a business of this type is approved."
      columns={1}
      className="lg:sticky lg:top-6"
    >
      {loading ? (
        <ListSkeleton count={4} className="flex flex-col gap-2" itemClassName="h-8" />
      ) : (
        <DefaultServicesPicker serviceCategories={serviceCategories} selectedIds={selectedIds} onChange={onChange} />
      )}
    </FormSection>
  );
}
