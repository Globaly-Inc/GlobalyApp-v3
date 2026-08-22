"use client";

import { useState } from "react";
import { ScanSearch, Loader2, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { MAX_CRAWL_PAGES } from "../const";
import type { BulkCrawlResult } from "../apis/types";

/** V1 parity: scan a page range of AgentCIS's unfiltered institution listing and queue
 * everything found, for when the goal is "import a batch" rather than "find one by name". */
export function AgentcisBulkCrawlCard({
  onCrawl,
  loading,
  result,
  onClearResult,
  error,
}: Readonly<{
  onCrawl: (startPage: number, maxPages: number) => void;
  loading: boolean;
  result: BulkCrawlResult | null;
  onClearResult: () => void;
  error: string | null;
}>) {
  const [startPage, setStartPage] = useState(1);
  const [maxPages, setMaxPages] = useState(5);

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div>
          <h3 className="font-semibold text-foreground">Bulk Crawl</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Scan AgentCIS&apos;s full institution listing by page instead of searching by name.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="crawl-start-page">Start page</Label>
            <Input
              id="crawl-start-page"
              type="number"
              min={1}
              className="w-28"
              value={startPage}
              onChange={(e) => setStartPage(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="crawl-max-pages">Pages to scan</Label>
            <Input
              id="crawl-max-pages"
              type="number"
              min={1}
              max={MAX_CRAWL_PAGES}
              className="w-28"
              value={maxPages}
              onChange={(e) => setMaxPages(Math.min(MAX_CRAWL_PAGES, Math.max(1, Number(e.target.value) || 1)))}
            />
          </div>
          <Button onClick={() => onCrawl(startPage, maxPages)} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
            {loading ? "Scanning..." : "Start Crawl"}
          </Button>
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>

        {result && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              Scanned {result.pages_scanned} page{result.pages_scanned === 1 ? "" : "s"} — {result.job_count} job
              {result.job_count === 1 ? "" : "s"} queued.
            </span>
            <Button variant="ghost" size="sm" className="ml-auto h-6 w-6 p-0" onClick={onClearResult}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
