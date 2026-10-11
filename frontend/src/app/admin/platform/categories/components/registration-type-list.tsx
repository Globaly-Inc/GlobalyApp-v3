"use client";

import { Globe, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { RegistrationType } from "../apis/types";

export function RegistrationTypeList({
  items,
  onToggle,
  onEdit,
  onDelete,
}: Readonly<{
  items: RegistrationType[];
  onToggle: (id: number, isActive: boolean) => void;
  onEdit: (item: RegistrationType) => void;
  onDelete: (item: RegistrationType) => void;
}>) {
  if (items.length === 0) {
    return <EmptyState icon={Globe} title="No registration types yet." />;
  }

  return (
    <TableCard>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead className="hidden md:table-cell">Country</TableHead>
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
                    <Globe className="size-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate font-medium text-foreground">{item.code}</span>
                      {!item.is_active && <Badge variant="secondary">Inactive</Badge>}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{item.label}</p>
                    <p className="truncate text-xs text-muted-foreground md:hidden">{item.country_name ?? "All other countries"}</p>
                  </div>
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                {/* No country is the fallback row, not missing data — say so rather than leaving a blank. */}
                <Badge variant={item.country_name ? "outline" : "secondary"}>
                  {item.country_name ?? "All other countries"}
                </Badge>
              </TableCell>
              <TableCell>
                <Switch
                  checked={item.is_active}
                  onCheckedChange={(checked) => onToggle(item.id, checked)}
                  aria-label={`Toggle active for ${item.code}`}
                />
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit ${item.code}`} onClick={() => onEdit(item)}>
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive"
                    aria-label={`Delete ${item.code}`}
                    onClick={() => onDelete(item)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableCard>
  );
}
