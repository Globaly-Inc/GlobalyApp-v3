"use client";

import { Globe, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
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
    return <p className="py-8 text-center text-sm text-muted-foreground">No registration types yet.</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <Card key={item.id} size="sm">
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Globe className="size-4 text-primary" />
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{item.code}</p>
                <span className="truncate text-xs text-muted-foreground">{item.label}</span>
                {/* No country is the fallback row, not missing data — say so rather than leaving a blank. */}
                <Badge variant={item.country_name ? "outline" : "secondary"}>
                  {item.country_name ?? "All other countries"}
                </Badge>
                {!item.is_active && <Badge variant="secondary">Inactive</Badge>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Switch checked={item.is_active} onCheckedChange={(checked) => onToggle(item.id, checked)} />
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
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
