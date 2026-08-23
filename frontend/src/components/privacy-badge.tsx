"use client";

// Public/Private toggle pill for a profile section. Non-interactive (disabled, dimmed) when
// `onToggle` is omitted — used for sections that are always public and can't be hidden.

import { Globe2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export function PrivacyBadge({ isPublic, onToggle }: Readonly<{ isPublic: boolean; onToggle?: () => void }>) {
  const clickable = !!onToggle;
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!clickable}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium transition-colors",
        isPublic ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        clickable ? "cursor-pointer hover:opacity-80" : "cursor-default opacity-50",
      )}
      title={clickable ? (isPublic ? "Click to make private" : "Click to make public") : isPublic ? "Public" : "Always private"}
    >
      {isPublic ? <Globe2 className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
      {isPublic ? "Public" : "Private"}
    </button>
  );
}
