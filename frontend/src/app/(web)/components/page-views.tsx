"use client";

import { useEffect, useRef, useState } from "react";
import { Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const API_BASE = `${(process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "")}/api/v3`;

/**
 * "N views" on a public detail page. The POST records this visit and returns the new total, so
 * displaying it costs no second request.
 *
 * Client-side rather than part of the page's own data fetch: those are cached (`revalidate: 30`),
 * and a counter that only moves once per cache window isn't counting visits.
 */
/** Mirrors PAGE_VIEW_TYPES in the backend module — and the page_views_type_chk DB constraint. */
export type PageViewType = "business" | "service" | "course" | "institution" | "visa-service";

export function PageViews({
  type, id, className,
}: Readonly<{ type: PageViewType; id: string | number; className?: string }>) {
  const [views, setViews] = useState<number | null>(null);
  // Strict Mode double-invokes effects, and a client-side route change to another id must still
  // count — so the guard remembers which page it counted, not merely that it ran.
  const counted = useRef("");
  const key = `${type}:${id}`;

  useEffect(() => {
    if (counted.current === key) return;
    counted.current = key;
    fetch(`${API_BASE}/page-views/${key.replace(":", "/")}`, { method: "POST" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { views: number } | null) => data && setViews(data.views))
      .catch(() => {});
  }, [key]);

  // Nothing until it lands: a placeholder that turns into a number is worse than one that appears.
  if (views === null) return null;

  return (
    // tabular-nums so the pill doesn't jump a pixel wider when 999 becomes 1,000.
    <Badge
      variant="secondary"
      className={cn("h-6 gap-1.5 border-primary/15 bg-primary/10 px-2.5 text-primary", className)}
    >
      <Eye />
      <span className="font-semibold tabular-nums">{views.toLocaleString()}</span>
      <span className="font-normal text-primary/70">views</span>
    </Badge>
  );
}
