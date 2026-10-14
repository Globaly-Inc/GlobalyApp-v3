"use client";

import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/combobox";
import { DynamicIcon } from "@/components/dynamic-icon";
import { FormSection } from "@/components/ui/form-section";
import { FormField } from "@/components/ui/form-field";
import type { Category } from "@/app/admin/platform/categories/apis/types";

/** Category + name card at the top of both service forms. */
export function ServiceBasicsSection({
  categories,
  categoryId,
  onCategoryChange,
  categoryDisabled,
  name,
  onNameChange,
  onNameBlur,
  nameLabel,
}: Readonly<{
  categories: Category[];
  categoryId: number | null;
  onCategoryChange: (categoryId: number | null) => void;
  categoryDisabled?: boolean;
  name: string;
  onNameChange: (name: string) => void;
  onNameBlur?: () => void;
  nameLabel: string;
}>) {
  return (
    <FormSection title="Basic details" description="What this service is called and where it's listed.">
      <FormField label={nameLabel} htmlFor="service-name" required>
        <Input
          id="service-name"
          className="h-10"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onBlur={onNameBlur}
          placeholder="Untitled service"
        />
      </FormField>
      <FormField label="Category" htmlFor="service-category" required>
        <Combobox
          id="service-category"
          options={categories.map((c) => ({
            value: String(c.id),
            label: c.name,
            icon: <DynamicIcon name={c.icon} fallback="GraduationCap" className="h-3.5 w-3.5" />,
          }))}
          value={categoryId ? String(categoryId) : ""}
          onChange={(v) => onCategoryChange(v ? Number(v) : null)}
          disabled={categoryDisabled}
          placeholder="Select category"
          searchPlaceholder="Search categories..."
        />
      </FormField>
    </FormSection>
  );
}
