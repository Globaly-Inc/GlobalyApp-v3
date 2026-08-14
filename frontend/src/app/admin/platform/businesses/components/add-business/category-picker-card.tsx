"use client";

import { Card } from "@/components/ui/card";
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
    <Card className="p-6">
      <h3 className="mb-3 text-sm font-semibold text-foreground">Business Category *</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
      </div>
      <FieldError message={error} />
    </Card>
  );
}
