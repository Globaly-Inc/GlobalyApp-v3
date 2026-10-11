"use client";

import { Combobox } from "@/components/combobox";
import { DynamicIcon } from "@/components/dynamic-icon";
import { FormField } from "@/components/ui/form-field";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";

type CategoryOption = { id: number; name: string; icon: string | null };

/** Category + name. In edit mode both save themselves (category on change, name on blur). */
export function ServiceBasicsSection({
  categories, categoryId, onCategoryChange, categoryDisabled, name, onNameChange, onNameBlur,
}: Readonly<{
  categories: CategoryOption[];
  categoryId: number | null;
  onCategoryChange: (categoryId: number | null) => void;
  categoryDisabled?: boolean;
  name: string;
  onNameChange: (value: string) => void;
  onNameBlur: () => void;
}>) {
  return (
    <FormSection title="Basics" description="The category decides which tabs and details this service gets.">
      <FormField label="Category" htmlFor="service-category" required>
        <Combobox
          options={categories.map((c) => ({
            value: String(c.id),
            label: c.name,
            icon: <DynamicIcon name={c.icon} fallback="GraduationCap" className="h-3.5 w-3.5" />,
          }))}
          value={categoryId ? String(categoryId) : ""}
          onChange={(v) => onCategoryChange(v ? Number(v) : null)}
          id="service-category"
          placeholder="Select category"
          searchPlaceholder="Search categories..."
          disabled={categoryDisabled}
        />
      </FormField>
      <FormField label="Service name" htmlFor="service-name" required>
        <Input
          id="service-name"
          className="h-10"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onBlur={onNameBlur}
          placeholder="Untitled service"
        />
      </FormField>
    </FormSection>
  );
}
