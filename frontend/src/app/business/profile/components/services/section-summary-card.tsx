"use client";

import type { LucideIcon } from "lucide-react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Summary-tab card for a child resource: count + a "Public" badge + jump-to-tab Add button. */
export function SectionSummaryCard({
  icon: Icon,
  title,
  count,
  emptyText,
  addLabel,
  onAdd,
}: Readonly<{ icon: LucideIcon; title: string; count: number; emptyText: string; addLabel: string; onAdd: () => void }>) {
  return (
    <Card className="gap-3">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title} <Badge variant="secondary" className="text-[10px]">{count}</Badge>
          <Badge variant="secondary" className="text-[10px]">Public</Badge>
        </CardTitle>
        <Button size="sm" variant="outline" onClick={onAdd}>
          <Plus className="mr-1 h-3.5 w-3.5" /> {addLabel}
        </Button>
      </CardHeader>
      <CardContent>
        {count === 0 && <p className="text-sm text-muted-foreground italic">{emptyText}</p>}
      </CardContent>
    </Card>
  );
}
