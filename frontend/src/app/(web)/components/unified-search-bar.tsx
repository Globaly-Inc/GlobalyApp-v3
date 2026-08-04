"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Sparkles, ArrowRight, GraduationCap, Building2, Users, Stamp } from "lucide-react";
import { cn } from "@/lib/utils";

type Mode = "ai" | "search";

const CATEGORIES = [
  { slug: "courses", name: "Courses", Icon: GraduationCap },
  { slug: "institutions", name: "Institutions", Icon: Building2 },
  { slug: "agents", name: "Agents", Icon: Users },
  { slug: "visas", name: "Visas", Icon: Stamp },
];

// Generic (no-profile) prompts from V2's src/lib/aiStarterPrompts.ts
// STARTER_PROMPTS, one set per category ("agents" here = V2's "education_agency").
const AI_PROMPTS_BY_SLUG: Record<string, string[]> = {
  courses: [
    "What courses can I study abroad?",
    "What are the popular courses in Australia?",
    "What are the programs for bachelor's degrees?",
    "What scholarships are available for international students?",
  ],
  institutions: [
    "What are the top universities in Canada?",
    "Which cities are best for international students?",
    "Which countries offer affordable tuition for international students?",
    "What are the highest-ranked universities for business?",
  ],
  agents: [
    "What do education agents do?",
    "Do I need an education agent to apply abroad?",
    "How are education agents paid?",
    "Find education agents who place students in the USA.",
  ],
  visas: [
    "What is a student visa and how does it work?",
    "What documents are needed for a student visa?",
    "Can international students work on a student visa?",
    "What are the post-study work visa options abroad?",
  ],
};

/**
 * Ask AI / Search hero bar. Ported from V2's UnifiedSearchBar, simplified:
 * category tabs are static here (V2 reads them from the backend) since
 * /search hasn't been built in V3 yet.
 * ponytail: swap CATEGORIES for live backend data once /search lands.
 */
export function UnifiedSearchBar() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("ai");
  const [activeSlug, setActiveSlug] = useState<string>(CATEGORIES[0]!.slug);
  const [query, setQuery] = useState("");

  const aiPrompts = useMemo(() => AI_PROMPTS_BY_SLUG[activeSlug] ?? AI_PROMPTS_BY_SLUG.courses!, [activeSlug]);

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
      const params = trimmed ? `&q=${encodeURIComponent(trimmed)}` : "";
      router.push(`/search?tab=${activeSlug}${params}`);
    }
  };

  return (
    <div className="w-full">
      <div className="flex gap-1 mb-4 justify-center max-w-4xl mx-auto">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.slug}
            type="button"
            onClick={() => setActiveSlug(cat.slug)}
            className={cn(
              "flex-shrink-0 flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium border transition-colors duration-200",
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
              "flex items-center px-3 h-8 rounded-full text-xs font-semibold transition-colors duration-200",
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
              "flex items-center px-3 h-8 rounded-full text-xs font-semibold transition-colors duration-200",
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
          className="h-10 px-4 rounded-full bg-primary text-primary-foreground text-sm font-semibold flex items-center gap-1.5 flex-shrink-0 transition-colors duration-200 hover:bg-primary/90"
        >
          {mode === "ai" ? "Ask AI" : "Search"}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {mode === "ai" && (
        <div className="mt-6 max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-2">
          {aiPrompts.map((prompt, idx) => (
            <button
              key={prompt}
              type="button"
              onClick={() => setQuery(prompt)}
              className={cn(
                "group text-left rounded-lg px-4 py-3 bg-white border border-white hover:border-white/70 transition-colors duration-200",
                idx >= 2 && "hidden md:block",
              )}
            >
              <div className="line-clamp-1 text-sm text-black group-hover:text-primary">{prompt}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
