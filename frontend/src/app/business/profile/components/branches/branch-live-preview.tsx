"use client";

import { Building2, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { BRANCH_TYPE_OPTIONS } from "@/app/admin/platform/businesses/const";
import type { BranchType, SharedServices } from "../../apis/types";
import { hueOf } from "./branch-row";

/** The branch as it will hang under the head office on the Branches tab, updated as the form fills. */
export function BranchLivePreview({
  parent,
  parentLocation,
  name,
  city,
  country,
  hasContact,
  branchType,
  sharedServices,
}: Readonly<{
  parent: { logo_url: string | null; business_name: string } | undefined;
  parentLocation: string;
  name: string;
  city: string;
  country: string;
  hasContact: boolean;
  branchType: BranchType;
  sharedServices: SharedServices;
}>) {
  const n = name.trim();
  const services = sharedServices === "all" ? "All services" : sharedServices.length ? `${sharedServices.length} service${sharedServices.length === 1 ? "" : "s"}` : null;
  const typeLabel = BRANCH_TYPE_OPTIONS.find((o) => o.value === branchType)?.label;
  // Remounting on these restarts the card's pulse each time one of them changes.
  const pulseKey = [country, city, branchType, services].join("|");
  const checks = [
    ["Branch name", n.length >= 2],
    ["Country and city", !!(country && city)],
    ["Email or phone", hasContact],
    ["Branch type", true],
  ] as const;

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        Preview
        <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
          <span className="animate-ai-pulse size-1.5 rounded-full bg-current" /> Live
        </span>
      </div>

      <div className="flex items-center gap-2.5 rounded-lg border border-primary/25 bg-gradient-to-r from-primary/10 to-card p-2.5">
        <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary text-primary-foreground">
          {parent?.logo_url
            // eslint-disable-next-line @next/next/no-img-element -- signed storage URL, not a static asset
            ? <img src={parent.logo_url} alt="" className="size-full bg-background object-contain p-0.5" />
            : <Building2 className="size-4" />}
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">{parent?.business_name ?? "Head office"}</p>
          <p className="truncate text-[11px] text-muted-foreground">Head office{parentLocation && ` · ${parentLocation}`}</p>
        </div>
      </div>

      <div className="relative pl-6">
        <span aria-hidden className="absolute -top-3 left-2.5 h-[calc(50%+12px)] w-0.5 rounded-full bg-border" />
        <div
          key={pulseKey}
          className={cn(
            "animate-bump relative flex items-center gap-2.5 rounded-lg border-[1.5px] bg-card p-2.5 transition-[border-color]",
            n && city ? "border-solid border-primary/30" : "border-dashed border-primary/45",
          )}
        >
          <span aria-hidden className="absolute -left-[15px] top-1/2 h-0.5 w-[13px] rounded-full bg-primary" />
          <div
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold uppercase bg-[hsl(var(--h)_70%_94%)] text-[hsl(var(--h)_55%_32%)] dark:bg-[hsl(var(--h)_35%_20%)] dark:text-[hsl(var(--h)_70%_78%)]"
            style={{ "--h": n ? hueOf(n) : 220 } as React.CSSProperties}
          >
            {n ? n.slice(0, 2) : "?"}
          </div>
          <div className="min-w-0 flex-1">
            <p className={cn("truncate text-xs", n ? "font-semibold" : "italic text-muted-foreground")}>{n || "Your new branch"}</p>
            <p className="truncate text-[11px] text-muted-foreground">{[city, country].filter(Boolean).join(", ") || "Location appears here"}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              <Badge className="h-4 px-1.5 text-[10px]">New</Badge>
              {typeLabel && <Badge variant="outline" className="h-4 px-1.5 text-[10px]">{typeLabel}</Badge>}
              {services && <Badge variant="outline" className="h-4 px-1.5 text-[10px]">{services}</Badge>}
            </div>
          </div>
        </div>
      </div>

      <ul className="flex flex-col gap-1.5 border-t pt-3">
        {checks.map(([label, ok]) => (
          <li key={label} className={cn("flex items-center gap-2 text-xs transition-colors", ok ? "text-foreground" : "text-muted-foreground")}>
            <span
              className={cn(
                "flex size-4 items-center justify-center rounded-full border-[1.5px] transition-colors",
                ok ? "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500" : "border-border",
              )}
            >
              {ok && <Check className="animate-pop-in size-2.5" strokeWidth={3} />}
            </span>
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}
