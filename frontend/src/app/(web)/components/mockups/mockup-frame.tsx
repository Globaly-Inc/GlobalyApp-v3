import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface MockupFrameProps {
  children: ReactNode;
  className?: string;
  /** Render with browser-style top chrome (dots) */
  chrome?: boolean;
  label?: string;
}

/**
 * Shared shell for in-app UI mockups used on public pages.
 * Matches the rounded-2xl shadow-xl frame used elsewhere on the For* pages.
 */
export function MockupFrame({ children, className, chrome = true, label }: Readonly<MockupFrameProps>) {
  return (
    <div className={cn("rounded-2xl shadow-xl overflow-hidden bg-card border border-border w-full", className)}>
      {chrome && (
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/50">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-accent" />
          <span className="h-2.5 w-2.5 rounded-full bg-primary/40" />
          {label && <span className="ml-3 text-xs text-muted-foreground font-medium truncate">{label}</span>}
        </div>
      )}
      <div className="p-5 bg-background">{children}</div>
    </div>
  );
}
