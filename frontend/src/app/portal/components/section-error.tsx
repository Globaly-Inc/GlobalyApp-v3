"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SectionErrorProps } from "../types";

/** Per-region failure. Scoped so one dead region never blanks the page. */
export function SectionError({ message, onRetry }: SectionErrorProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-background px-4 py-8 text-center">
      <AlertCircle className="h-6 w-6 text-muted-foreground/60" />
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
        <RefreshCw className="h-3.5 w-3.5" /> Retry
      </Button>
    </div>
  );
}
