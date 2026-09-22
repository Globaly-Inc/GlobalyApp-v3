"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, FileText, Globe, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { businessApi } from "../../apis";
import type { SiteUrlCategory, SiteUrlSnapshot, SiteUrlsPage } from "../../apis/types";
import { EXTRACTION_POLL_INTERVAL_MS as POLL_INTERVAL_MS, EXTRACTION_MAX_POLLS as MAX_POLLS } from "../const";

const PAGE_SIZE = 8;

const CATEGORY_LABELS: Record<SiteUrlCategory, string> = {
  overview: "Overview",
  about_us: "About us",
  contact_us: "Contact us",
  course: "Courses",
  branches: "Branches",
  agents: "Agents",
  fees: "Fees",
  study_units: "Study units",
  study_options: "Study options",
  intake: "Intake",
  eligibility: "Eligibility",
  accreditations: "Accreditations",
  other: "Other",
};

const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS) as SiteUrlCategory[];

/** Read-only self-service twin of the admin's Site tab — shows what the crawl found on this org's own site. */
export function SiteUrlsCard() {
  const [page, setPage] = useState<SiteUrlsPage | null>(null);
  const [category, setCategory] = useState<SiteUrlCategory | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [snapshot, setSnapshot] = useState<SiteUrlSnapshot | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const pollCountRef = useRef(0);
  const requestIdRef = useRef(0);

  const fetchPage = () => {
    const requestId = ++requestIdRef.current;
    businessApi
      .getExtractionSiteUrls({ page: pageNum, limit: PAGE_SIZE, category: category ?? undefined })
      .then((result) => { if (requestId === requestIdRef.current) setPage(result); })
      .catch(() => {
        if (requestId === requestIdRef.current) {
          setPage((prev) => prev ?? { data: [], meta: { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 }, counts: null });
        }
      });
  };

  // No separate loading flag: the previous page's rows stay on screen until the next page
  // resolves, so switching category/page never flashes a spinner — only the very first load
  // (page === null) shows the skeleton below.
  useEffect(() => {
    fetchPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, pageNum]);

  // This card has no signal of its own for "extraction still running" (that lives on the sibling
  // ExtractionProgressCard) — an active crawl keeps discovering pages after this card's own fetch
  // already resolved with none, and with the card returning null below there's no control left to
  // trigger a refetch. So it just re-polls on its own, same cadence/ceiling as the progress card.
  useEffect(() => {
    if (pollCountRef.current >= MAX_POLLS) return undefined;
    const timer = setTimeout(() => {
      pollCountRef.current += 1;
      fetchPage();
    }, POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const view = async (url: string) => {
    setOpening(url);
    try {
      setSnapshot(await businessApi.getExtractionSiteUrlSnapshot(url));
    } catch (e) {
      toast.error("Couldn't open this page", { description: e instanceof Error ? e.message : "Please try again." });
    } finally {
      setOpening(null);
    }
  };

  if (page && (!page.counts || page.counts.total === 0)) return null;

  const counts = page?.counts;
  const activeCategories = counts ? CATEGORY_ORDER.filter((c) => counts.by_category[c] > 0) : [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Globe className="h-4 w-4 text-primary" />
            Pages found on your site
          </CardTitle>
          {counts && <Badge variant="secondary">{counts.total} found</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {counts && (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => { setCategory(null); setPageNum(1); }}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                category === null ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              All ({counts.total - counts.excluded})
            </button>
            {activeCategories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { setCategory(c); setPageNum(1); }}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  category === c ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {CATEGORY_LABELS[c]} ({counts.by_category[c]})
              </button>
            ))}
          </div>
        )}

        <div className="divide-y divide-border rounded-lg border border-border">
          {page === null ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                <Skeleton className="h-5 w-20 shrink-0 rounded-full" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))
          ) : (
            page.data.map((u) => (
              <div key={u.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <Badge variant="outline" className="shrink-0 font-normal">
                  {u.category ? CATEGORY_LABELS[u.category] : "Unclassified"}
                </Badge>
                <a
                  href={u.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-w-0 flex-1 items-center gap-1 truncate text-muted-foreground hover:text-foreground hover:underline"
                >
                  <span className="truncate">{u.url}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
                {u.category_source === "admin" && <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" />}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 gap-1 px-2 text-xs"
                  disabled={opening === u.url}
                  onClick={() => view(u.url)}
                  title="See what was extracted from this page"
                >
                  {opening === u.url ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                  View
                </Button>
              </div>
            ))
          )}
        </div>

        {page && page.meta.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={pageNum <= 1}
              onClick={() => setPageNum((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {page.meta.page} of {page.meta.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={pageNum >= page.meta.totalPages}
              onClick={() => setPageNum((p) => p + 1)}
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>

      <Sheet open={snapshot !== null} onOpenChange={(open) => { if (!open) setSnapshot(null); }}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle className="truncate text-sm">{snapshot?.url}</SheetTitle>
            <SheetDescription>
              What we extracted · fetched {snapshot ? new Date(snapshot.scraped_at).toLocaleString() : ""} ·{" "}
              {snapshot?.markdown.length.toLocaleString()} characters
            </SheetDescription>
          </SheetHeader>
          <pre className="mx-4 mb-4 whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed">
            {snapshot?.markdown}
          </pre>
        </SheetContent>
      </Sheet>
    </Card>
  );
}
