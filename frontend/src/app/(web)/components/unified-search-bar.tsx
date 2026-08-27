"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Sparkles, ArrowUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORIES, AI_PROMPTS_BY_SLUG, SEARCH_SUGGESTIONS_BY_SLUG, SEARCH_DESTINATIONS } from "../const/index";

type Mode = "ai" | "search";

const MODES: { id: Mode; label: string; Icon: typeof Search }[] = [
  { id: "ai", label: "Ask AI", Icon: Sparkles },
  { id: "search", label: "Search", Icon: Search },
];

export function UnifiedSearchBar() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("ai");
  const [activeSlug, setActiveSlug] = useState<string>(CATEGORIES[0]!.slug);
  const [query, setQuery] = useState("");

  const suggestions = useMemo(
    () =>
      mode === "ai"
        ? (AI_PROMPTS_BY_SLUG[activeSlug] ?? AI_PROMPTS_BY_SLUG.courses!)
        : (SEARCH_SUGGESTIONS_BY_SLUG[activeSlug] ?? SEARCH_SUGGESTIONS_BY_SLUG.courses!),
    [mode, activeSlug],
  );

  const placeholder = useMemo(
    () =>
      mode === "ai"
        ? "Ask anything about studying abroad…"
        : `Search ${CATEGORIES.find((c) => c.slug === activeSlug)?.name.toLowerCase()}…`,
    [mode, activeSlug],
  );

  // Takes the value explicitly so a suggestion chip can search straight away rather than waiting a render for state.
  const submit = (value = query) => {
    const trimmed = value.trim();
    if (mode === "ai") {
      const params = trimmed ? `?q=${encodeURIComponent(trimmed)}` : "";
      router.push(`/ai${params}`);
    } else {
      // A few slugs have their own page rather than a tab on /search. Carrying the typed query across
      // matters: dropping it would send someone who typed "airport pickup" to an unfiltered list.
      const destination = SEARCH_DESTINATIONS[activeSlug];
      if (destination) {
        const params = trimmed ? `?${destination.param}=${encodeURIComponent(trimmed)}` : "";
        router.push(`${destination.path}${params}`);
        return;
      }
      const params = trimmed ? `&search=${encodeURIComponent(trimmed)}` : "";
      router.push(`/search?tab=${activeSlug}${params}`);
    }
  };

  return (
    <div className="w-full">
      <div className="max-w-3xl mx-auto rounded-2xl bg-white shadow-lg p-3 text-left">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={placeholder}
          className="w-full h-16 px-2.5 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />

        <div className="flex items-center gap-2 mt-2">
          <div className="flex items-center gap-1 bg-slate-100 rounded-full p-1 flex-shrink-0">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                aria-pressed={mode === m.id}
                className={cn(
                  "flex items-center gap-1.5 h-8 px-3 rounded-full text-sm font-medium transition-colors duration-200 cursor-pointer",
                  mode === m.id ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-900",
                )}
              >
                <m.Icon className="h-4 w-4" />
                <span>{m.label}</span>
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* ponytail: native select, and only for Search — AI mode has no category to filter. */}
          {mode === "search" && (
            <div className="relative flex-shrink-0">
              <select
                value={activeSlug}
                onChange={(e) => setActiveSlug(e.target.value)}
                aria-label="Search category"
                className="appearance-none h-9 pl-3 pr-6 rounded-full bg-transparent text-sm font-medium text-slate-600 hover:text-slate-900 outline-none cursor-pointer"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.slug} value={cat.slug}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            </div>
          )}

          <button
            type="button"
            onClick={() => submit()}
            aria-label={mode === "ai" ? "Ask AI" : "Search"}
            className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 transition-colors duration-200 hover:bg-primary/90 cursor-pointer"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-5 max-w-3xl mx-auto flex flex-wrap items-center justify-center gap-2">
        <span className="text-sm font-medium text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">Try:</span>
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            // A Search chip is a whole query, so run it; an AI prompt is usually a starting point to edit.
            onClick={() => (mode === "ai" ? setQuery(suggestion) : submit(suggestion))}
            className="rounded-full border border-white/60 bg-black/35 backdrop-blur-xl px-3.5 py-1.5 text-sm font-medium text-white shadow-md transition-colors duration-200 hover:bg-black/50 hover:border-white cursor-pointer"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
