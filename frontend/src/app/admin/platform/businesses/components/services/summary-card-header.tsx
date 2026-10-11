"use client";

import { Globe2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function PublicBadge() {
  return (
    <Badge variant="secondary" className="gap-1 text-xs">
      <Globe2 className="h-3 w-3" />
      Public
    </Badge>
  );
}

/** Matches V1's plain-div card header (BusinessServiceEditor.tsx): icon h-5 w-5 text-primary,
 * h2 font-semibold text-sm, border-b, px-5 py-4 — shadcn's CardHeader/CardTitle read visually
 * smaller/lighter, so summary cards use this instead for same-to-same parity. */
export function SummaryCardHeader({
  icon: Icon, title, count, action,
}: Readonly<{ icon: React.ComponentType<{ className?: string }>; title: string; count?: number; action?: React.ReactNode }>) {
  return (
    <div className="flex items-center justify-between border-b px-5 py-4">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-primary" />
        <h2 className="text-sm font-semibold">{title}</h2>
        {count != null && <Badge variant="secondary" className="text-xs">{count}</Badge>}
        <PublicBadge />
      </div>
      {action}
    </div>
  );
}

export function ManageButton({ hasData, onClick }: Readonly<{ hasData: boolean; onClick: () => void }>) {
  return (
    <Button variant="ghost" size="sm" className="h-7 text-xs text-primary" onClick={onClick}>
      {hasData ? "Manage" : "Add"}
    </Button>
  );
}
