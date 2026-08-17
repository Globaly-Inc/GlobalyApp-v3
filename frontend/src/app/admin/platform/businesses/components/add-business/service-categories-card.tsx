"use client";

import { Card } from "@/components/ui/card";
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
    <Card className="space-y-3 p-6">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Allowed Service Categories</h3>
        <p className="text-xs text-muted-foreground">Select which types of services this business can list.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
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
      </div>
    </Card>
  );
}
