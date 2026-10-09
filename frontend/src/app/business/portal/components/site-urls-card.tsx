"use client";

import { useEffect, useRef, useState } from "react";
import { Globe } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { PortalPageHeader } from "@/app/business/profile/components/portal-ui/portal-page-header";
import { PortalStats } from "@/app/business/profile/components/portal-ui/portal-stats";
import { PortalStatTile } from "@/app/business/profile/components/portal-ui/portal-stat-tile";
import { businessApi } from "../../apis";
import type { SiteUrlCategory, SiteUrlSnapshot, SiteUrlsPage } from "../../apis/types";
import { EXTRACTION_POLL_INTERVAL_MS as POLL_INTERVAL_MS, EXTRACTION_MAX_POLLS as MAX_POLLS } from "../const";
import { SiteUrlDistribution } from "./site-url-distribution";
import { SiteUrlRow } from "./site-url-row";
import { SiteUrlSnapshotSheet } from "./site-url-snapshot-sheet";

const DEFAULT_PAGE_SIZE = 10;

/** Self-service twin of the admin's Site tab — shows what the crawl found on this org's own site,
 *  and lets the owner hand-correct one page's content (unlike the admin tab, there's no category/
 *  exclude curation here — see getExtractionSiteUrls' forced excluded: false). */
/** sharedFrom: this branch reads its head office's extraction (same website) — view only, since
 * edits and re-pulls belong to the head office's own job. */
export function SiteUrlsCard({ sharedFrom = null }: Readonly<{ sharedFrom?: string | null }> = {}) {
  const [page, setPage] = useState<SiteUrlsPage | null>(null);
  const [category, setCategory] = useState<SiteUrlCategory | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [snapshot, setSnapshot] = useState<SiteUrlSnapshot | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<Set<string>>(new Set());
  const pollCountRef = useRef(0);
  const requestIdRef = useRef(0);
  const fetchedForRef = useRef<string | null>(null);

  const fetchPage = () => {
    const requestId = ++requestIdRef.current;
    businessApi
      .getExtractionSiteUrls({ page: pageNum, limit, category: category ?? undefined })
      .then((result) => { if (requestId === requestIdRef.current) setPage(result); })
      .catch(() => {
        if (requestId === requestIdRef.current) {
          setPage((prev) => prev ?? { data: [], meta: { page: 1, limit, total: 0, totalPages: 0 }, counts: null });
        }
      });
  };

  // No separate loading flag: the previous page's rows stay on screen until the next page
  // resolves, so switching category/page never flashes a spinner — only the very first load
  // (page === null) shows the skeleton below.
  //
  // fetchedForRef guards against React Strict Mode's dev-only double-invoke: the initial mount
  // runs this effect twice with the same deps, which would otherwise fire the request twice.
  useEffect(() => {
    const key = `${category ?? ""}:${pageNum}:${limit}`;
    if (fetchedForRef.current === key) return;
    fetchedForRef.current = key;
    fetchPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, pageNum, limit]);

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

  // Mockup behaviour: the row's icon re-pulls that one page right away and spins until queued.
  const refresh = async (url: string) => {
    setRefreshing((prev) => new Set(prev).add(url));
    try {
      const result = await businessApi.refreshExtractionSiteUrls([url]);
      if (result.rejected.length === 0) toast.success("Page queued to be read again");
      else toast.error("Couldn't read this page again", { description: result.rejected[0]!.error });
    } catch (e) {
      toast.error("Couldn't read this page again", { description: e instanceof Error ? e.message : "Please try again." });
    } finally {
      setRefreshing((prev) => { const next = new Set(prev); next.delete(url); return next; });
    }
  };

  const viewOnly = !!sharedFrom;
  const counts = page?.counts;
  // by_category only counts live, non-excluded, categorised pages; total is every URL the crawl found.
  const classified = counts ? Object.values(counts.by_category).reduce((s, n) => s + n, 0) : 0;
  let host: string | null = null;
  try { if (page?.data[0]) host = new URL(page.data[0].url).host; } catch { /* malformed URL: no host in subtitle */ }
  const changeCategory = (c: SiteUrlCategory | null) => { setCategory(c); setPageNum(1); };
  const empty = page !== null && (!counts || counts.total === 0);

  // Mockup `.page`: one bordered panel, 22px padding, 16px between blocks.
  return (
    <Card className="stagger-in gap-4 rounded-[18px] p-5.5">
      <div>
        <PortalPageHeader
          title="Pages on your site"
          subtitle={host
            ? <>What we found on <span className="font-mono">{host}</span> and how each page was classified.</>
            : "What we found on your site and how each page was classified."}
        />
        {sharedFrom && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Shared from {sharedFrom}&apos;s extraction — view only. Edit or refresh these pages from the head office.
          </p>
        )}
      </div>

      {empty ? (
        <div className="grid justify-items-center gap-1.5 rounded-[14px] border-[1.5px] border-dashed p-7.5 text-center text-muted-foreground">
          <Globe className="h-8 w-8 text-muted-foreground/40" />
          <b className="text-sm font-semibold text-foreground">No pages discovered yet</b>
          <span className="text-xs">Once your website extraction finishes crawling, the pages it found will show up here.</span>
        </div>
      ) : (
        <>
          {counts && (
            <PortalStats>
              <PortalStatTile value={counts.total} label="Pages discovered" />
              <PortalStatTile value={classified} label="Pages classified" />
              <PortalStatTile value={counts.by_category.course} label="Course pages" />
              <PortalStatTile value={counts.by_category.other} label={'Unclassified ("Other")'} />
            </PortalStats>
          )}

          {counts && <SiteUrlDistribution counts={counts} category={category} onCategoryChange={changeCategory} />}

          <div className="overflow-hidden rounded-[14px] border">
            {page === null ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 border-b px-3.5 py-2.75 last:border-b-0">
                  <Skeleton className="h-4 w-24 shrink-0" />
                  <Skeleton className="h-4 flex-1" />
                </div>
              ))
            ) : page.data.length === 0 ? (
              <div className="grid justify-items-center gap-1.5 p-7.5 text-center text-muted-foreground">
                <b className="text-sm font-semibold text-foreground">No pages match</b>
                <span className="text-xs">Try another category.</span>
              </div>
            ) : (
              page.data.map((u, i) => (
                <SiteUrlRow
                  key={u.id}
                  row={u}
                  index={i}
                  viewOnly={viewOnly}
                  refreshing={refreshing.has(u.url)}
                  opening={opening === u.url}
                  onRefresh={() => refresh(u.url)}
                  onView={() => view(u.url)}
                />
              ))
            )}
          </div>

          {/* Pagination carries its own mt-4; the panel's gap already spaces it (mockup `.foot`). */}
          {page && page.meta.total > 0 && (
            <div className="[&>div]:mt-0">
              <Pagination
                page={page.meta.page}
                total={page.meta.total}
                limit={limit}
                onPageChange={setPageNum}
                onPageSizeChange={(next) => { setLimit(next); setPageNum(1); }}
              />
            </div>
          )}
        </>
      )}

      <SiteUrlSnapshotSheet snapshot={snapshot} onSnapshotChange={setSnapshot} viewOnly={viewOnly} />
    </Card>
  );
}
