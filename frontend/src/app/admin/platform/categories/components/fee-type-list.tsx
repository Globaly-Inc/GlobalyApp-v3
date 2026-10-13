"use client";

import { DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ModerationStatusBadge } from "./moderation-status-badge";
import { ModeratedRowActions } from "./row-actions-menu";
import type { FeeType, ModerationStatus } from "../apis/types";

export function FeeTypeList({
  items,
  onReview,
  onEdit,
  onDelete,
}: Readonly<{
  items: FeeType[];
  onReview: (id: number, decision: ModerationStatus) => void;
  onEdit: (item: FeeType) => void;
  onDelete: (item: FeeType) => void;
}>) {
  if (items.length === 0) {
    return <EmptyState icon={DollarSign} title="No fee types yet." />;
  }

  return (
    <TableCard>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fee type</TableHead>
            <TableHead className="hidden md:table-cell">Scope</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-px"><span className="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell primary>
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <DollarSign className="size-4 text-primary" />
                  </div>
                  <span className="truncate font-medium text-foreground">{item.name}</span>
                  {item.is_global && <Badge variant="secondary" className="md:hidden">Global</Badge>}
                  {item.business_id && !item.is_global && <Badge variant="outline" className="md:hidden">Organisation</Badge>}
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                {item.is_global && <Badge variant="secondary">Global</Badge>}
                {item.business_id && !item.is_global && <Badge variant="outline">Organisation</Badge>}
              </TableCell>
              <TableCell>
                <ModerationStatusBadge status={item.status} />
              </TableCell>
              <TableCell>
                <ModeratedRowActions
                  name={item.name}
                  pending={item.status === "pending"}
                  onReview={(decision) => onReview(item.id, decision)}
                  onEdit={() => onEdit(item)}
                  onDelete={() => onDelete(item)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableCard>
  );
}
