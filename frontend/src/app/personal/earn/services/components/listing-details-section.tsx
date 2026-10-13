"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { FormSection } from "@/components/ui/form-section";
import { Combobox } from "@/components/combobox";
import type { ListingFormModel } from "./use-listing-form";

export function ListingDetailsSection({ model }: Readonly<{ model: ListingFormModel }>) {
  const { form, setForm, errors, categoryOptions } = model;
  return (
    <FormSection title="Service details" description="What you offer and how buyers will find it." columns={1}>
      <FormField label="Title" htmlFor="title" required error={errors.title}>
        <Input
          id="title"
          className="h-10"
          value={form.title}
          placeholder="Airport Pickup — Sydney"
          aria-invalid={!!errors.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        />
      </FormField>

      {/* FormField is flex + gap, never space-y — base-ui's focus guards inherit sibling margins and shift the
          layout when a Combobox popover opens (frontend/AGENTS.md). */}
      <FormField label="Category" htmlFor="category" required error={errors.categoryId}>
        <Combobox
          id="category"
          options={categoryOptions}
          value={form.categoryId}
          onChange={(value) => setForm((f) => ({ ...f, categoryId: value }))}
          placeholder="Choose a category"
          searchPlaceholder="Search categories..."
          aria-invalid={!!errors.categoryId}
        />
      </FormField>

      <FormField label="Description" htmlFor="description" error={errors.description}>
        <Textarea
          id="description"
          rows={4}
          value={form.description}
          placeholder="What's included, where you'll meet, how long it takes."
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </FormField>
    </FormSection>
  );
}
