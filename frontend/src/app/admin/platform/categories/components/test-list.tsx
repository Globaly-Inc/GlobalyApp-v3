"use client";

import { FileText, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
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
    return <p className="py-8 text-center text-sm text-muted-foreground">No tests yet.</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <Card key={item.id} size="sm">
          <CardContent>
            <div className="flex items-center gap-3">
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
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{item.name}</p>
                <Badge variant="outline">{TEST_CATEGORY_LABEL[item.category]}</Badge>
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
