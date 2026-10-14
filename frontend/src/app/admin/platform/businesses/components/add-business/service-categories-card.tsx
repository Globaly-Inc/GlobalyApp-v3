"use client";

import { FormSection } from "@/components/ui/form-section";
import { cn } from "@/lib/utils";
import type { Category } from "@/app/admin/platform/categories/apis/types";

export function ServiceCategoriesCard({
  categories,
  selectedIds,
  onToggle,
}: Readonly<{
  categories: Category[];
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
}>) {
  return (
    <FormSection
      title="Allowed Service Categories"
      description="Select which types of services this business can list."
      columns={1}
      contentClassName="flex flex-wrap gap-2"
    >
      {categories.map((cat) => (
        <button
          key={cat.id}
          type="button"
          aria-pressed={selectedIds.has(cat.id)}
          onClick={() => onToggle(cat.id)}
          className={cn(
            "cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            selectedIds.has(cat.id)
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background text-foreground hover:bg-muted/50",
          )}
        >
          {cat.name}
        </button>
      ))}
    </FormSection>
  );
}
