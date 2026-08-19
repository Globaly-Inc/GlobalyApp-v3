"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Sparkles, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CATEGORIES,
  AI_PROMPTS_BY_SLUG,
  AI_PROMPTS_DEFAULT,
  SEARCH_SUGGESTIONS_BY_SLUG,
} from "../const/index";

type Mode = "ai" | "search";

export function UnifiedSearchBar() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("ai");
  const [activeSlug, setActiveSlug] = useState<string>(CATEGORIES[0]!.slug);
  const [query, setQuery] = useState("");

  const aiPrompts = useMemo(() => AI_PROMPTS_BY_SLUG[activeSlug] ?? AI_PROMPTS_DEFAULT, [activeSlug]);
  const searchSuggestions = useMemo(() => SEARCH_SUGGESTIONS_BY_SLUG[activeSlug] ?? [], [activeSlug]);

  const placeholder = useMemo(
    () =>
      mode === "ai"
        ? "Ask anything about studying abroad…"
        : `Search ${CATEGORIES.find((c) => c.slug === activeSlug)?.name.toLowerCase()}…`,
    [mode, activeSlug],
  );

  const submit = () => {
    const trimmed = query.trim();
    if (mode === "ai") {
      const params = trimmed ? `?q=${encodeURIComponent(trimmed)}` : "";
      router.push(`/ai${params}`);
    } else {
      // Every CATEGORIES slug is a SearchTabKey, so this always lands on a real result set.
      const params = trimmed ? `&search=${encodeURIComponent(trimmed)}` : "";
      router.push(`/search?tab=${activeSlug}${params}`);
    }
  };

  return (
    <div className="w-full">
      {/* Six tabs do not fit a phone. They scroll horizontally below sm, and only centre once they fit. */}
      <div className="flex gap-1 mb-4 overflow-x-auto scrollbar-none px-4 sm:px-0 sm:justify-center max-w-4xl mx-auto">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.slug}
            type="button"
            onClick={() => setActiveSlug(cat.slug)}
            className={cn(
              "flex-shrink-0 flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium border transition-colors duration-200 cursor-pointer",
              activeSlug === cat.slug
                ? "bg-white text-primary border-white"
                : "bg-transparent text-white border-white/40 hover:border-white/70",
            )}
          >
            <cat.Icon className="h-3.5 w-3.5" />
            <span>{cat.name}</span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1 max-w-3xl mx-auto h-14 pl-1 pr-1 rounded-full bg-white shadow-lg">
        <div className="flex items-center bg-slate-100 rounded-full p-1 h-10 flex-shrink-0">
          <button
            type="button"
            onClick={() => setMode("ai")}
            aria-pressed={mode === "ai"}
            title="Ask AI"
            className={cn(
              "flex items-center px-3 h-8 rounded-full text-xs font-semibold transition-colors duration-200 cursor-pointer",
              mode === "ai" ? "bg-primary text-primary-foreground" : "text-slate-600 hover:text-slate-900",
            )}
          >
            <Sparkles className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setMode("search")}
            aria-pressed={mode === "search"}
            title="Search"
            className={cn(
              "flex items-center px-3 h-8 rounded-full text-xs font-semibold transition-colors duration-200 cursor-pointer",
              mode === "search" ? "bg-primary text-primary-foreground" : "text-slate-600 hover:text-slate-900",
            )}
          >
            <Search className="h-3.5 w-3.5" />
          </button>
        </div>

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={placeholder}
          className="flex-1 min-w-0 h-12 px-3 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />

        <button
          type="button"
          onClick={submit}
          className="h-10 px-4 rounded-full bg-primary text-primary-foreground text-sm font-semibold flex items-center gap-1.5 flex-shrink-0 transition-colors duration-200 hover:bg-primary/90 cursor-pointer"
        >
          {mode === "ai" ? "Ask AI" : "Search"}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Height reserved for whichever mode is showing, so toggling never shunts the page under the fold. */}
      <div className="mt-6 min-h-[380px] md:min-h-[180px]">
        {mode === "ai" ? (
          <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-2">
            {aiPrompts.map((prompt, idx) => (
              <button
                key={prompt}
                type="button"
                onClick={() => setQuery(prompt)}
                className={cn(
                  "group text-left rounded-lg px-4 py-3 bg-white border border-white transition-colors duration-200 cursor-pointer",
                  idx >= 2 && "hidden md:block",
                )}
              >
                <div className="line-clamp-1 text-sm text-black group-hover:text-primary">{prompt}</div>
              </button>
            ))}
          </div>
        ) : (
          <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs font-medium mr-1 flex-shrink-0 text-white/70">Try:</span>
            {searchSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setQuery(suggestion)}
                className="rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors duration-200 border-white/30 bg-white/5 text-white/90 hover:bg-white/15 hover:border-white/60 cursor-pointer"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
