"use client";

import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function ListSkeleton({ rows = 4 }: Readonly<{ rows?: number }>) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-lg" />
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon, title, hint,
}: Readonly<{ icon: LucideIcon; title: string; hint?: string }>) {
  return (
    <Card className="border-dashed">
      <CardContent className="py-12 text-center text-muted-foreground">
        <Icon className="mx-auto mb-3 h-8 w-8 opacity-40" />
        <p className="text-sm">{title}</p>
        {hint && <p className="mt-1 text-xs">{hint}</p>}
      </CardContent>
    </Card>
  );
}
