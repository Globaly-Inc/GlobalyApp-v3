"use client";

import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SHORTCUTS } from "../const";
import type { ShortcutType } from "../types";

/**
 * The header above a shortcut view — GlobalyOS V2's `SpecialViewHeader`, verbatim: a
 * tinted rounded icon chip, the title, and the subtitle, on the same `border-b bg-card`
 * bar the conversation header uses.
 *
 * `action` is the slot V2's mobile Unread header puts "Mark all read" in.
 */
export function SpecialViewHeader({
  type,
  onBack,
  action,
}: Readonly<{ type: ShortcutType; onBack: () => void; action?: React.ReactNode }>) {
  const config = SHORTCUTS.find((s) => s.type === type);
  if (!config) return null;
  const { label, subtitle, icon: Icon, iconBg, iconColor } = config;

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-3 py-2.5 md:px-4">
      <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onBack} aria-label="Back to conversations">
        <ArrowLeft />
      </Button>
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", iconBg, iconColor)}>
        <Icon className="size-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold text-foreground">{label}</h2>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
