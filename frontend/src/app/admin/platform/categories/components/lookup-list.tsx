"use client";

import { BookOpen, GraduationCap, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Lookup, LookupKind } from "../apis/types";

export function LookupList({
  items,
  kind,
  onToggle,
  onEdit,
}: Readonly<{
  items: Lookup[];
  kind: LookupKind;
  onToggle: (id: number, isActive: boolean) => void;
  onEdit: (item: Lookup) => void;
}>) {
  const Icon = kind === "degree-levels" ? GraduationCap : BookOpen;

  if (items.length === 0) {
    return <EmptyState icon={Icon} title="No items yet." />;
  }

  return (
    <TableCard>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="hidden md:table-cell">Slug</TableHead>
            <TableHead className="w-px">Active</TableHead>
            <TableHead className="w-px"><span className="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell primary>
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="size-4 text-primary" />
                  </div>
                  <span className="truncate font-medium text-foreground">{item.name}</span>
                  {!item.is_active && <Badge variant="secondary">Inactive</Badge>}
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <Badge variant="outline">{item.slug}</Badge>
              </TableCell>
              <TableCell>
                <Switch
                  checked={item.is_active}
                  onCheckedChange={(checked) => onToggle(item.id, checked)}
                  aria-label={`Toggle active for ${item.name}`}
                />
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="icon-sm" aria-label={`Edit ${item.name}`} onClick={() => onEdit(item)}>
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
