"use client";

import { useEffect, useState } from "react";
import { EyeOff, Files, Globe } from "lucide-react";
// import { ListTree } from "lucide-react";
// import { Button } from "@/components/ui/button";
// import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StepChainBar } from "./step-chain-bar";
// import { SiteUrlsTab } from "./site-urls-tab";
import { SnapshotsTab } from "./snapshots-tab";
import { allExtractionsApi } from "../apis";
import type { ExtractionJob, SiteUrlCounts } from "../apis/types";

/**
 * Site tab: the step chain, site-map counts (found / active / inactive), then the stored snapshots.
 * The site map itself (every discovered URL, its category, exclude/restore) used to live behind a
 * Details button — kept below, commented out, until the analytics replaces it for good.
 */
export function SiteTab({ jobId, job, onReload }: Readonly<{ jobId: string; job: ExtractionJob; onReload: () => void }>) {
  // const [detailsOpen, setDetailsOpen] = useState(false);
  const [counts, setCounts] = useState<SiteUrlCounts | null>(null);

  // Refetched on every `job` change: onReload (a step Run, the header's refresh) hands down a new job
  // object, so the counts follow the same "refresh to see progress" model as the step chips instead
  // of freezing at mount.
  useEffect(() => {
    let stale = false;
    // ponytail: counts ride on the existing site-urls list endpoint; limit 1 keeps the payload to the counts we need.
    allExtractionsApi.getSiteUrls(jobId, { limit: 1 })
      .then((res) => { if (!stale) setCounts(res.counts); })
      .catch(() => { if (!stale) setCounts(null); });
    return () => { stale = true; };
  }, [jobId, job]);

  // Inactive = the snapshot step could not read the page (404 / blocked / empty). Admin-excluded rows
  // are neither active nor inactive here; they live in the site map.
  // `?? 0` on dead: a backend started before 2026-09-23 returns counts without it, and NaN renders as a React warning.
  const total = counts?.total ?? "—";
  const inactive = counts?.dead ?? "—";
  const active = counts ? counts.total - counts.excluded - (counts.dead ?? 0) : "—";

  const stat = (Icon: typeof Globe, value: number | string, label: string, tone = "", title?: string) => (
    <span title={title} className={`flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs ${tone}`}>
      <Icon className="h-3.5 w-3.5" />
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );

  return (
    <div>
      <StepChainBar job={job} highlight={["site_map", "site_snapshot", "url_classify", "queue_pages"]} onChanged={onReload} />

      <div className="mb-3 flex justify-end gap-1.5">
        {stat(Globe, total, "Sites found")}
        {stat(Files, active, "Active", "text-emerald-700")}
        {stat(EyeOff, inactive, "Inactive", "text-rose-700", "Pages the snapshot could not read: not found, blocked, or empty")}
      </div>

      {/* <div className="mb-3 flex justify-end">
        <Button variant="outline" size="sm" className="h-8 gap-1.5 cursor-pointer" onClick={() => setDetailsOpen(true)}>
          <ListTree className="h-3.5 w-3.5" /> Details
        </Button>
      </div> */}

      <SnapshotsTab jobId={jobId} />

      {/* <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-5xl">
          <SheetHeader>
            <SheetTitle className="text-sm">Site map</SheetTitle>
            <SheetDescription>
              Every URL discovered on the site, its category and whether it will be scraped. Exclude a URL to keep it out of
              Snapshot, Classify and Queue; set a category to pin it so a re-run never overwrites it.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">
            <SiteUrlsTab jobId={jobId} />
          </div>
        </SheetContent>
      </Sheet> */}
    </div>
  );
}
