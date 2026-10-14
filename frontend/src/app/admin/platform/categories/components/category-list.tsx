"use client";

import { Layers, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DynamicIcon } from "@/components/dynamic-icon";
import type { Category } from "../apis/types";

export function CategoryList({
  categories,
  kind,
  onToggle,
  onEdit,
}: Readonly<{
  categories: Category[];
  kind: "business" | "service" | "other_service";
  onToggle: (id: number, isActive: boolean) => void;
  onEdit: (category: Category) => void;
}>) {
  if (categories.length === 0) {
    return <EmptyState icon={Layers} title="No categories yet." />;
  }

  return (
    <TableCard>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Category</TableHead>
            <TableHead className="hidden md:table-cell">Slug</TableHead>
            <TableHead className="w-px">Active</TableHead>
            <TableHead className="w-px"><span className="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {categories.map((cat) => (
            <TableRow key={cat.id}>
              <TableCell primary>
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <DynamicIcon
                      name={cat.icon}
                      fallback={kind === "business" ? "Building2" : "Layers"}
                      className="size-4.5 text-primary"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate font-medium text-foreground">{cat.name}</span>
                      {!cat.is_active && <Badge variant="secondary">Inactive</Badge>}
                    </div>
                    {cat.description && <p className="truncate text-xs text-muted-foreground">{cat.description}</p>}
                  </div>
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <Badge variant="outline">{cat.slug}</Badge>
              </TableCell>
              <TableCell>
                <Switch
                  checked={cat.is_active}
                  onCheckedChange={(checked) => onToggle(cat.id, checked)}
                  aria-label={`Toggle active for ${cat.name}`}
                />
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="icon-sm" aria-label={`Edit ${cat.name}`} onClick={() => onEdit(cat)}>
                  <Pencil />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableCard>
  );
}
