"use client";

import { Loader2, MapPin, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { OriginChip } from "../origin-chip";
import type { Branch } from "../../apis/types";

/** Stable per-name hue so a branch keeps the same avatar colour between visits. */
export const hueOf = (name: string) => [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

/** Bolds the searched substring; the server matches the same way (case-insensitive contains). */
function Highlight({ text, query }: Readonly<{ text: string; query: string }>) {
  const i = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-primary/20 px-px text-inherit">{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
  );
}

export function BranchRow({
  branch: b,
  index,
  logo,
  query,
  leaving,
  converting,
  convertBusy,
  onEdit,
  onDelete,
}: Readonly<{
  branch: Branch;
  index: number;
  logo: string | null;
  query: string;
  leaving: boolean;
  converting: boolean;
  convertBusy: boolean;
  onEdit: () => void;
  onDelete: () => void;
}>) {
  const hue = hueOf(b.name);
  const linked = b.linked_business_id != null || b.linked_institution_id != null;
  return (
    <div
      className={cn(
        "group relative flex items-center gap-3 rounded-xl border bg-card p-3 transition-[transform,box-shadow,border-color] duration-200",
        "hover:-translate-y-px hover:border-primary/30 hover:shadow-[0_8px_24px_-12px_rgb(17_26_64/0.25)]",
        leaving ? "animate-row-leave" : "animate-row-rise",
      )}
      style={{ animationDelay: leaving ? undefined : `${200 + Math.min(index, 10) * 55}ms` }}
    >
      {/* Stub joining the row to the connector line drawn by the tab. */}
      <span aria-hidden className="absolute -left-[17px] top-1/2 h-0.5 w-[15px] rounded-full bg-border transition-colors group-hover:bg-primary" />
      <div
        className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg text-xs font-semibold uppercase transition-transform duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] group-hover:-rotate-3 group-hover:scale-105 bg-[hsl(var(--h)_70%_94%)] text-[hsl(var(--h)_55%_32%)] dark:bg-[hsl(var(--h)_35%_20%)] dark:text-[hsl(var(--h)_70%_78%)]"
        style={{ "--h": hue } as React.CSSProperties}
      >
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed storage URL, not a static asset
          <img src={logo} alt="" className="size-full bg-background object-contain p-0.5" />
        ) : b.name.slice(0, 2)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold"><Highlight text={b.name} query={query} /></span>
          {b.is_primary && <Badge className="text-[10px]">Head Office</Badge>}
          {b.origin && <OriginChip origin={b.origin} />}
          {linked && <Badge variant="outline" className="text-[10px] capitalize">{b.branch_type.replaceAll("_", " ")}</Badge>}
        </div>
        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
          <MapPin className="size-3 shrink-0" />
          {[b.city, b.state, b.country].filter(Boolean).join(", ") || "—"}
        </p>
      </div>
      <div className="flex items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {b.extracted ? (
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={convertBusy}
            onClick={onEdit}
            aria-label="Edit branch"
            title="Edit — sets this extracted branch up so you can complete its details"
          >
            {converting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
          </Button>
        ) : (
          <>
            <Button size="icon-sm" variant="ghost" onClick={onEdit} aria-label="Edit branch">
              <Pencil className="h-4 w-4" />
            </Button>
            {!b.is_primary && (
              <Button size="icon-sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={onDelete} aria-label="Remove branch">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
