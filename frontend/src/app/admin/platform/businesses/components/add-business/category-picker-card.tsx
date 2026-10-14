"use client";

import { FormSection } from "@/components/ui/form-section";
import { FieldError } from "@/components/field-error";
import { DynamicIcon } from "@/components/dynamic-icon";
import { cn } from "@/lib/utils";
import type { Category } from "@/app/admin/platform/categories/apis/types";

export function CategoryPickerCard({
  categories,
  selectedId,
  onSelect,
  error,
}: Readonly<{
  categories: Category[];
  selectedId: number | null | undefined;
  onSelect: (id: number) => void;
  error?: string;
}>) {
  return (
    <FormSection
      title={<>Business Category<span aria-hidden className="text-destructive">*</span></>}
      columns={2}
      contentClassName="gap-2"
    >
      {categories.map((cat) => (
        <button
          key={cat.id}
          type="button"
          aria-pressed={selectedId === cat.id}
          onClick={() => onSelect(cat.id)}
          className={cn(
            "flex w-full items-start gap-3 rounded-lg border p-3 text-left cursor-pointer transition-colors hover:bg-muted/50",
            selectedId === cat.id ? "border-primary bg-primary/5" : "border-border",
          )}
        >
          <div
            className={cn(
              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              selectedId === cat.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            <DynamicIcon name={cat.icon} fallback="Building2" className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-medium leading-tight">{cat.name}</p>
            {cat.description && <p className="mt-0.5 text-xs leading-tight text-muted-foreground">{cat.description}</p>}
          </div>
        </button>
      ))}
      {error && (
        <div className="sm:col-span-full">
          <FieldError message={error} />
        </div>
      )}
    </FormSection>
  );
}
