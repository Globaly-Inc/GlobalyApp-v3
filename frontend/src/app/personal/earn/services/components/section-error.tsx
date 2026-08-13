"use client";

// Scoped failure, never a whole-page one: each tab and the earnings strip render their own error with their
// own retry, so one failing fetch cannot blank the rest of the hub.

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SectionError({
  message,
  onRetry,
}: Readonly<{ message: string | null; onRetry?: () => void }>) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card px-4 py-10 text-center">
      <AlertCircle className="h-6 w-6 text-destructive" />
      <p className="text-sm text-muted-foreground">{message ?? "Something went wrong."}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: Readonly<{ title: string; hint?: string; action?: React.ReactNode }>) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-card px-4 py-12 text-center">
      <p className="font-medium text-foreground">{title}</p>
      {hint && <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
