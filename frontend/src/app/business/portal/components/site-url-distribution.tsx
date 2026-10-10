"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { SiteUrlCategory, SiteUrlCounts } from "../../apis/types";
import { SITE_URL_CATEGORIES, SITE_URL_CATEGORY_ORDER } from "./site-url-categories";

/** Mockup `.cats` + `.legend`: a 12px stacked category bar over legend chips. The chips (and bar
 *  segments) are the category filter — clicking the active one again goes back to All; hovering a
 *  chip lifts its bar segment. */
export function SiteUrlDistribution({
  counts,
  category,
  onCategoryChange,
}: Readonly<{
  counts: SiteUrlCounts;
  category: SiteUrlCategory | null;
  onCategoryChange: (c: SiteUrlCategory | null) => void;
}>) {
  const [hot, setHot] = useState<SiteUrlCategory | null>(null);
  // Biggest first, like the mockup — the bar reads left-to-right by share.
  const active = SITE_URL_CATEGORY_ORDER
    .filter((c) => counts.by_category[c] > 0)
    .sort((a, b) => counts.by_category[b] - counts.by_category[a]);
  const toggle = (c: SiteUrlCategory) => onCategoryChange(category === c ? null : c);

  const chip = (selected: boolean) => cn(
    "inline-flex items-center gap-1.5 rounded-full border px-[11px] py-[5px] text-xs font-semibold transition-colors",
    selected ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground",
  );
  const hover = (c: SiteUrlCategory) => ({
    onMouseEnter: () => setHot(c), onMouseLeave: () => setHot(null), onFocus: () => setHot(c), onBlur: () => setHot(null),
  });

  return (
    <>
      {active.length > 0 && (
        <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" aria-hidden>
          {active.map((c, j) => (
            <i
              key={c}
              title={`${SITE_URL_CATEGORIES[c].label}: ${counts.by_category[c]}`}
              className={cn(
                "animate-fill-x h-full cursor-pointer transition-[filter,scale] duration-200 hover:scale-y-[1.4] hover:brightness-110",
                SITE_URL_CATEGORIES[c].dot,
                (hot ?? category) === c && "scale-y-[1.4] brightness-110",
              )}
              style={{ flex: counts.by_category[c], "--fill-delay": `${200 + j * 50}ms` } as React.CSSProperties}
              onClick={() => toggle(c)}
              {...hover(c)}
            />
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        <button type="button" aria-pressed={category === null} className={chip(category === null)} onClick={() => onCategoryChange(null)}>
          All
          <span className="font-mono text-[10.5px] font-semibold">{counts.total - counts.excluded}</span>
        </button>
        {active.map((c) => (
          <button key={c} type="button" aria-pressed={category === c} className={chip(category === c)} onClick={() => toggle(c)} {...hover(c)}>
            <i className={cn("size-2.25 rounded-[3px]", SITE_URL_CATEGORIES[c].dot)} />
            {SITE_URL_CATEGORIES[c].label}
            <span className="font-mono text-[10.5px] font-semibold">{counts.by_category[c]}</span>
          </button>
        ))}
      </div>
    </>
  );
}
