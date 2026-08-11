"use client";

import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { DynamicIcon } from "@/components/dynamic-icon";
import type { Category } from "../apis/types";

export function CategoryList({
  categories,
  kind,
  onToggle,
  onEdit,
}: Readonly<{
  categories: Category[];
  kind: "business" | "service";
  onToggle: (id: number, isActive: boolean) => void;
  onEdit: (category: Category) => void;
}>) {
  if (categories.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No categories yet.</p>;
  }

  return (
    <div className="space-y-2">
      {categories.map((cat) => (
        <Card key={cat.id} size="sm">
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <DynamicIcon
                  name={cat.icon}
                  fallback={kind === "business" ? "Building2" : "Layers"}
                  className="size-4.5 text-primary"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{cat.name}</p>
                  <Badge variant="outline">{cat.slug}</Badge>
                  {!cat.is_active && <Badge variant="secondary">Inactive</Badge>}
                </div>
                {cat.description && (
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{cat.description}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Switch checked={cat.is_active} onCheckedChange={(checked) => onToggle(cat.id, checked)} />
                <Button variant="ghost" size="icon-sm" aria-label={`Edit ${cat.name}`} onClick={() => onEdit(cat)}>
                  <Pencil />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
