"use client";

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The prompt shortcuts under the hero search bar, in the card style Perplexity uses below its
 * composer. Light cards with explicit colours, matching the composer above: they sit on the dark
 * hero in both themes, so theme tokens would invert them to unreadable in dark mode.
 */
export function SearchSuggestionCards({
  prompts,
  onSelect,
}: Readonly<{ prompts: string[]; onSelect: (prompt: string) => void }>) {
  return (
    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
      {prompts.slice(0, 4).map((prompt, idx) => (
        <button
          key={prompt}
          type="button"
          onClick={() => onSelect(prompt)}
          className={cn(
            "group relative flex items-start gap-3 overflow-hidden rounded-xl border border-black/5 bg-white p-4 text-left shadow-md transition-colors duration-200 cursor-pointer hover:border-slate-300",
            // Rows 3–4 are extra breadth on wide screens only, matching the two-card reference on mobile.
            idx >= 2 && "hidden sm:flex",
          )}
        >
          <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="min-w-0 text-sm font-medium leading-snug text-slate-700 group-hover:text-slate-900">
            {prompt}
          </span>
        </button>
      ))}
    </div>
  );
}
