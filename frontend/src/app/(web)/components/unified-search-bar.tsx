"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Check, ChevronDown, Search, Sparkles } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { CATEGORIES, AI_PROMPTS_BY_SLUG, SEARCH_DESTINATIONS } from "../const/index";
import { SearchSuggestionCards } from "./search-suggestion-cards";

type Mode = "ai" | "search";

/**
 * Shared shape of the two mode pills in the composer's control row.
 * Explicit light colours rather than theme tokens: the card is always white and always sits on the
 * dark hero, so `text-foreground` would invert it to unreadable in dark mode.
 */
const pillClass = (active: boolean) =>
  cn(
    "flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors duration-200 cursor-pointer",
    active ? "bg-slate-100 text-slate-900 ring-1 ring-slate-200" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
  );

export function UnifiedSearchBar({ defaultTabSlug }: Readonly<{ defaultTabSlug?: string }> = {}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("ai");
  const [activeSlug, setActiveSlug] = useState<string>(defaultTabSlug ?? CATEGORIES[0]!.slug);
  const [query, setQuery] = useState("");

  const aiPrompts = useMemo(() => AI_PROMPTS_BY_SLUG[activeSlug] ?? AI_PROMPTS_BY_SLUG.courses!, [activeSlug]);
  const activeCategory = useMemo(() => CATEGORIES.find((c) => c.slug === activeSlug), [activeSlug]);

  const placeholder = mode === "ai" ? "Ask anything…" : `Search ${activeCategory?.name.toLowerCase()}…`;

  const submit = () => {
    const trimmed = query.trim();
    if (mode === "ai") {
      const params = trimmed ? `?q=${encodeURIComponent(trimmed)}` : "";
      router.push(`/ai${params}`);
      return;
    }
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
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="rounded-2xl border border-black/5 bg-white p-3 text-left shadow-2xl transition-colors duration-200 focus-within:border-slate-300">
        <textarea
          rows={2}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Enter submits, Shift+Enter keeps the newline — the composer convention this UI borrows.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          className="w-full resize-none bg-transparent px-2 pt-1.5 text-base text-slate-900 outline-none placeholder:text-slate-400"
        />

        <div className="mt-2 flex items-center gap-1.5">
          {/* The reference's "Search ⌄" pill: picks the mode and, in one menu, which catalogue to search. */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button type="button" className={pillClass(mode === "search")} aria-label="Choose what to search" />
              }
            >
              <Search className="h-4 w-4" />
              <span>{mode === "search" ? activeCategory?.name : "Search"}</span>
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              {CATEGORIES.map((cat) => (
                <DropdownMenuItem
                  key={cat.slug}
                  className="cursor-pointer"
                  onClick={() => {
                    setActiveSlug(cat.slug);
                    setMode("search");
                  }}
                >
                  <cat.Icon />
                  <span className="flex-1">{cat.name}</span>
                  {mode === "search" && activeSlug === cat.slug && <Check className="h-4 w-4" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <button type="button" onClick={() => setMode("ai")} className={pillClass(mode === "ai")}>
            <Sparkles className="h-4 w-4" />
            <span>Ask AI</span>
          </button>

          <button
            type="button"
            onClick={submit}
            aria-label={mode === "ai" ? "Ask AI" : "Search"}
            className="ml-auto flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[hsl(var(--purple-dark))] text-white transition-colors duration-200 cursor-pointer hover:bg-primary"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </div>

      {mode === "ai" && <SearchSuggestionCards prompts={aiPrompts} onSelect={setQuery} />}
    </div>
  );
}
