"use client";

import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PrivacyBadge } from "@/components/privacy-badge";

/**
 * Summary-tab card for a child resource: count, a Public badge and a jump-to-tab action.
 *
 * V1 shows the count only once there is something to count, and the action reads "Manage" rather
 * than "Add" once the section has rows — a plain text button, not an outlined one.
 */
export function SectionSummaryCard({
  icon: Icon,
  title,
  count,
  emptyText,
  addLabel = "Add",
  onAdd,
}: Readonly<{ icon: LucideIcon; title: string; count: number; emptyText: string; addLabel?: string; onAdd: () => void }>) {
  return (
    <Card className="gap-3">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className="h-4 w-4 text-primary" />
          {title}
          {count > 0 && <Badge variant="secondary" className="text-[10px]">{count}</Badge>}
          <PrivacyBadge isPublic />
        </CardTitle>
        <Button size="sm" variant="ghost" className="text-primary" onClick={onAdd}>
          {count > 0 ? "Manage" : addLabel}
        </Button>
      </CardHeader>
      <CardContent>
        {count === 0 && <p className="text-sm text-muted-foreground italic">{emptyText}</p>}
      </CardContent>
    </Card>
  );
}
