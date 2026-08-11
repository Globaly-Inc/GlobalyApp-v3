"use client";

import { BookOpen, GraduationCap, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
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
    return <p className="py-8 text-center text-sm text-muted-foreground">No items yet.</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <Card key={item.id} size="sm">
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="size-4 text-primary" />
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{item.name}</p>
                <Badge variant="outline">{item.slug}</Badge>
                {!item.is_active && <Badge variant="secondary">Inactive</Badge>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Switch checked={item.is_active} onCheckedChange={(checked) => onToggle(item.id, checked)} />
                <Button variant="ghost" size="icon-sm" aria-label={`Edit ${item.name}`} onClick={() => onEdit(item)}>
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
