"use client";

import { useState } from "react";
import { ListTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StepChainBar } from "./step-chain-bar";
import { SiteUrlsTab } from "./site-urls-tab";
import { SnapshotsTab } from "./snapshots-tab";
import type { ExtractionJob } from "../apis/types";

/**
 * Site tab: the step chain, then the stored snapshots. The site map (every discovered URL, its
 * category, exclude/restore) lives behind the Details button — it is the admin's pruning tool, not
 * the thing they look at every time.
 */
export function SiteTab({ jobId, job, onReload }: Readonly<{ jobId: string; job: ExtractionJob; onReload: () => void }>) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <div>
      <StepChainBar job={job} highlight={["site_map", "site_snapshot", "url_classify", "queue_pages"]} onChanged={onReload} />

      <div className="mb-3 flex justify-end">
        <Button variant="outline" size="sm" className="h-8 gap-1.5 cursor-pointer" onClick={() => setDetailsOpen(true)}>
          <ListTree className="h-3.5 w-3.5" /> Details
        </Button>
      </div>

      <SnapshotsTab jobId={jobId} />

      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-5xl">
          <SheetHeader>
            <SheetTitle className="text-sm">Site map</SheetTitle>
            <SheetDescription>
              Every URL discovered on the site, its category and whether it will be scraped. Exclude a URL to keep it out of
              Snapshot, Classify and Queue; set a category to pin it so a re-run never overwrites it.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-3">
            <SiteUrlsTab jobId={jobId} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
