"use client";

import { useEffect, useState } from "react";
import { Building2, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { allExtractionsApi } from "../apis";
import type { PortalBranch } from "../apis/types";

/** Branches the org added by hand in its own portal. They aren't extraction data, so they're
 *  listed read-only here — edit them from the org's Branches tab. */
export function PortalBranchesSection({ jobId }: Readonly<{ jobId: string }>) {
  const [branches, setBranches] = useState<PortalBranch[]>([]);

  useEffect(() => {
    allExtractionsApi.getPortalBranches(jobId).then(setBranches).catch(() => setBranches([]));
  }, [jobId]);

  if (branches.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Added in the portal · {branches.length}
      </p>
      {branches.map((b) => (
        <div key={b.id} className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Building2 className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{b.name ?? "Unnamed branch"}</p>
            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              {[b.city, b.state, b.country].filter(Boolean).join(", ") || "No address"}
            </p>
          </div>
          <Badge variant="outline" className="text-[10px]">Manual</Badge>
        </div>
      ))}
    </div>
  );
}
