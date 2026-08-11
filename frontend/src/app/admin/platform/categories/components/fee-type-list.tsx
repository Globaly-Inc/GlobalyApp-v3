"use client";

import { CheckCircle2, DollarSign, Pencil, Trash2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ModerationStatusBadge } from "./moderation-status-badge";
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
    return <p className="py-8 text-center text-sm text-muted-foreground">No fee types yet.</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <Card key={item.id} size="sm">
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <DollarSign className="size-4 text-primary" />
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{item.name}</p>
                <ModerationStatusBadge status={item.status} />
                {item.is_global && <Badge variant="secondary">Global</Badge>}
                {item.business_id && !item.is_global && <Badge variant="outline">Organisation</Badge>}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {item.status === "pending" && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Approve ${item.name}`}
                      onClick={() => onReview(item.id, "approved")}
                    >
                      <CheckCircle2 className="text-emerald-600" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Reject ${item.name}`}
                      onClick={() => onReview(item.id, "rejected")}
                    >
                      <XCircle className="text-destructive" />
                    </Button>
                  </>
                )}
                <Button variant="ghost" size="icon-sm" aria-label={`Edit ${item.name}`} onClick={() => onEdit(item)}>
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Delete ${item.name}`} onClick={() => onDelete(item)}>
                  <Trash2 className="text-destructive" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
