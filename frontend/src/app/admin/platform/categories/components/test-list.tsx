"use client";

import { FileText, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TEST_CATEGORY_LABEL } from "../const";
import type { Test } from "../apis/types";

export function TestList({
  items,
  onToggle,
  onEdit,
}: Readonly<{
  items: Test[];
  onToggle: (id: number, isActive: boolean) => void;
  onEdit: (item: Test) => void;
}>) {
  if (items.length === 0) {
    return <EmptyState icon={FileText} title="No tests yet." />;
  }

  return (
    <TableCard>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Test</TableHead>
            <TableHead className="hidden md:table-cell">Type</TableHead>
            <TableHead className="w-px">Active</TableHead>
            <TableHead className="w-px"><span className="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell primary>
                <div className="flex min-w-0 items-center gap-3">
                  {/* The logo, at the size the course and profile cards render it — so what an admin
                      uploads is judged here at the size it will actually be seen. */}
                  <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10">
                    {item.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image_url} alt="" className="size-full object-contain" />
                    ) : (
                      <FileText className="size-4 text-primary" />
                    )}
                  </div>
                  <span className="truncate font-medium text-foreground">{item.name}</span>
                  {!item.is_active && <Badge variant="secondary">Inactive</Badge>}
                  <Badge variant="outline" className="md:hidden">{TEST_CATEGORY_LABEL[item.category]}</Badge>
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <Badge variant="outline">{TEST_CATEGORY_LABEL[item.category]}</Badge>
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
