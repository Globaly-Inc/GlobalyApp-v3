"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Sparkles, ArrowUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CATEGORIES, CATEGORY_SLUG_TO_TAB, AI_PROMPTS_BY_SLUG, SEARCH_SUGGESTIONS_BY_SLUG, SEARCH_DESTINATIONS,
} from "../const/index";
import { getBusinessCategories } from "../search/api";
import { SEARCH_TABS } from "../search/components/search-tabs";

type Mode = "ai" | "search";

type Category = { slug: string; name: string };

/** Tabs currently in the rail. A category pointing anywhere else has nothing to show. */
const LIVE_TABS = new Set(SEARCH_TABS.map((t) => t.key as string));

/**
 * Rebuilds the switcher from the category catalog, keeping Courses first and Other Services last —
 * neither is a business, so neither comes from the API.
 *
 * The label comes from the search rail rather than the row's own name, so the switcher and the tab
 * it navigates to always read the same.
 */
function toOptions(rows: { slug: string; name: string }[]): Category[] {
  const fromApi = rows
    .map((row) => ({ row, tab: CATEGORY_SLUG_TO_TAB[row.slug] }))
    .filter((c): c is { row: typeof c.row; tab: string } => Boolean(c.tab) && LIVE_TABS.has(c.tab!))
    .map(({ row, tab }) => ({
      slug: tab,
      name: SEARCH_TABS.find((t) => t.key === tab)?.label ?? row.name,
    }));
  if (fromApi.length === 0) return CATEGORIES;

  const fixed = (slug: string) => CATEGORIES.find((c) => c.slug === slug)!;
  return [fixed("courses"), ...fromApi, fixed("other-services")];
}

const MODES: { id: Mode; label: string; Icon: typeof Search }[] = [
  { id: "ai", label: "Ask AI", Icon: Sparkles },
  { id: "search", label: "Search", Icon: Search },
];

export function UnifiedSearchBar({ defaultTabSlug }: Readonly<{ defaultTabSlug?: string }> = {}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("ai");
  // Courses everywhere except the pages that are about something else: a Search from the
  // for-institutions hero has to land on institutions, not courses.
  const [activeSlug, setActiveSlug] = useState<string>(defaultTabSlug ?? CATEGORIES[0]!.slug);
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<Category[]>(CATEGORIES);

  // Strict Mode double-invokes effects, and this list changes about never — fetch it once.
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    getBusinessCategories().then((rows) => setCategories(toOptions(rows)));
  }, []);

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
        ? "Ask anything about studying at home or overseas…"
        : `Search ${categories.find((c) => c.slug === activeSlug)?.name.toLowerCase() ?? "courses"}…`,
    [mode, activeSlug, categories],
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
                {categories.map((cat) => (
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
