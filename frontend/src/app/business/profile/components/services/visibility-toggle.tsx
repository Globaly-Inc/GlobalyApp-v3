"use client";

import { EyeOff, Globe2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type SectionVisibility = {
  isVisible: (section: string) => boolean;
  onToggle: (section: string) => void;
  disabled: boolean;
};

/** Public/Hidden pill — a click flips whether this section shows on the public course page
 * (course.public_visibility — see the [slug] page's isVisible). */
export function VisibilityToggle({ section, visibility }: Readonly<{ section: string; visibility: SectionVisibility }>) {
  const visible = visibility.isVisible(section);
  return (
    <button
      type="button"
      disabled={visibility.disabled}
      onClick={() => visibility.onToggle(section)}
      aria-pressed={visible}
      title={visible ? "Shown on the public course page — click to hide" : "Hidden from the public course page — click to show"}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60",
        visible
          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400"
          : "bg-muted text-muted-foreground hover:text-foreground",
      )}
    >
      {visible ? <Globe2 className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
      {visible ? "Public" : "Hidden"}
    </button>
  );
}
