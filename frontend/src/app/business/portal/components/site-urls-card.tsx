"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, FileText, Globe, Loader2, Pencil, RefreshCw, Save, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { businessApi } from "../../apis";
import type { SiteUrlCategory, SiteUrlSnapshot, SiteUrlsPage } from "../../apis/types";
import { EXTRACTION_POLL_INTERVAL_MS as POLL_INTERVAL_MS, EXTRACTION_MAX_POLLS as MAX_POLLS } from "../const";

const DEFAULT_PAGE_SIZE = 10;

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

/** Self-service twin of the admin's Site tab — shows what the crawl found on this org's own site,
 *  and lets the owner hand-correct one page's content (unlike the admin tab, there's no category/
 *  exclude curation here — see getExtractionSiteUrls' forced excluded: false). */
export function SiteUrlsCard() {
  const [page, setPage] = useState<SiteUrlsPage | null>(null);
  const [category, setCategory] = useState<SiteUrlCategory | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [snapshot, setSnapshot] = useState<SiteUrlSnapshot | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRefreshing, setBulkRefreshing] = useState(false);
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
    setEditing(false);
    try {
      setSnapshot(await businessApi.getExtractionSiteUrlSnapshot(url));
    } catch (e) {
      toast.error("Couldn't open this page", { description: e instanceof Error ? e.message : "Please try again." });
    } finally {
      setOpening(null);
    }
  };

  const startEditing = () => {
    if (!snapshot) return;
    setDraft(snapshot.markdown);
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!snapshot) return;
    setSaving(true);
    try {
      const updated = await businessApi.updateExtractionSiteUrlSnapshot(snapshot.url, draft);
      setSnapshot(updated);
      setEditing(false);
      const re = updated.reExtraction;
      if (re?.outcome === "shared_page") {
        toast.success("Page content updated", {
          description: `This page lists ${re.courseCount} courses — too many to re-extract automatically; please update them individually.`,
        });
      } else if (re && re.failedCount > 0) {
        // Some of the courses sharing this page couldn't be queued — say so explicitly rather
        // than a plain success, since those still hold the old extraction until re-saved.
        toast.warning("Page content updated", {
          description: re.courseCount > 0
            ? `${re.courseCount} course${re.courseCount === 1 ? "" : "s"} refreshed, but ${re.failedCount} couldn't be queued — edit and save this page again to retry ${re.failedCount === 1 ? "it" : "them"}.`
            : `Couldn't queue re-extraction for ${re.failedCount} course${re.failedCount === 1 ? "" : "s"} sharing this page — edit and save this page again to retry.`,
        });
      } else if (re?.outcome === "triggered" && re.courseCount > 1) {
        toast.success("Page content updated", {
          description: `${re.courseCount} courses on this page are being refreshed from your correction.`,
        });
      } else {
        toast.success("Page content updated");
      }
    } catch (e) {
      toast.error("Couldn't save", { description: e instanceof Error ? e.message : "Please try again." });
    } finally {
      setSaving(false);
    }
  };

  const toggleSelected = (url: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url); else next.add(url);
      return next;
    });
  };

  const reportRefreshResult = (result: { queued: string[]; rejected: { url: string; error: string }[] }) => {
    if (result.rejected.length === 0) {
      toast.success(result.queued.length === 1 ? "Page queued for refresh" : `${result.queued.length} pages queued for refresh`);
    } else if (result.queued.length === 0) {
      toast.error("Couldn't queue refresh", { description: result.rejected[0]!.error });
    } else {
      toast.warning(`Queued ${result.queued.length} of ${result.queued.length + result.rejected.length} pages`, {
        description: result.rejected[0]!.error,
      });
    }
  };

  // Selection can span multiple pages, but the endpoint caps a single request at 10 URLs
  // (SiteUrlRefreshSchema) — chunk and merge results rather than sending it all in one request
  // that fails validation outright.
  const REFRESH_BATCH_SIZE = 10;

  const refreshSelected = async () => {
    const urls = [...selected];
    const batches: string[][] = [];
    for (let i = 0; i < urls.length; i += REFRESH_BATCH_SIZE) batches.push(urls.slice(i, i + REFRESH_BATCH_SIZE));
    setBulkRefreshing(true);
    try {
      const results = await Promise.allSettled(batches.map((batch) => businessApi.refreshExtractionSiteUrls(batch)));
      const merged = { queued: [] as string[], rejected: [] as { url: string; error: string }[] };
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          merged.queued.push(...r.value.queued);
          merged.rejected.push(...r.value.rejected);
        } else {
          const error = r.reason instanceof Error ? r.reason.message : "Request failed";
          merged.rejected.push(...batches[i]!.map((url) => ({ url, error })));
        }
      });
      reportRefreshResult(merged);
      setSelected(new Set(merged.rejected.map((r) => r.url)));
    } catch (e) {
      toast.error("Couldn't refresh", { description: e instanceof Error ? e.message : "Please try again." });
    } finally {
      setBulkRefreshing(false);
    }
  };

  if (page && (!page.counts || page.counts.total === 0)) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <Globe className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium">No pages discovered yet</p>
          <p className="text-xs text-muted-foreground">
            Once your website extraction finishes crawling, the pages it found will show up here.
          </p>
        </CardContent>
      </Card>
    );
  }

  const counts = page?.counts;
  const activeCategories = counts ? CATEGORY_ORDER.filter((c) => counts.by_category[c] > 0) : [];

  return (
    <>
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
              onClick={() => { setCategory(null); setPageNum(1); setSelected(new Set()); }}
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
                onClick={() => { setCategory(c); setPageNum(1); setSelected(new Set()); }}
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
                  size="icon-sm"
                  className={cn("h-7 w-7 shrink-0", selected.has(u.url) && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary")}
                  aria-pressed={selected.has(u.url)}
                  onClick={() => toggleSelected(u.url)}
                  title="Queue this page to re-pull from your live site"
                  aria-label="Queue this page to re-pull from your live site"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
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

        {page && page.meta.total > 0 && (
          <Pagination
            page={page.meta.page}
            total={page.meta.total}
            limit={limit}
            onPageChange={setPageNum}
            onPageSizeChange={(next) => { setLimit(next); setPageNum(1); }}
          />
        )}
      </CardContent>

      <Sheet open={snapshot !== null} onOpenChange={(open) => { if (!open) { setSnapshot(null); setEditing(false); } }}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <div className="flex items-center justify-between gap-2 pr-8">
              <div className="flex min-w-0 items-center gap-2">
                <SheetTitle className="truncate text-sm">{snapshot?.url}</SheetTitle>
                {snapshot?.edited && <Badge variant="secondary" className="shrink-0">Manually edited</Badge>}
              </div>
              {!editing && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0"
                  onClick={startEditing}
                  aria-label="Edit this page's content"
                  title="Edit this page's content"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
            </div>
            <SheetDescription>
              {editing
                ? "Editing stops this page from being refreshed by a future crawl, until you edit it again."
                : `What we extracted · fetched ${snapshot ? new Date(snapshot.scraped_at).toLocaleString() : ""} · ${snapshot?.markdown.length.toLocaleString()} characters`}
            </SheetDescription>
          </SheetHeader>
          {editing ? (
            <div className="mx-4 mb-4 flex flex-col gap-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="min-h-[50vh] font-mono text-[11px] leading-relaxed"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" disabled={saving} onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button size="sm" className="gap-1.5" disabled={saving || draft.trim().length === 0} onClick={saveEdit}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <pre className="mx-4 mb-4 whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed">
              {snapshot?.markdown}
            </pre>
          )}
        </SheetContent>
      </Sheet>
    </Card>

    {selected.size > 0 && (
      <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-background px-4 py-2 shadow-lg">
        <span className="text-xs text-muted-foreground">{selected.size} selected</span>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5" disabled={bulkRefreshing} onClick={() => setSelected(new Set())}>
          <X className="h-3.5 w-3.5" /> Clear
        </Button>
        <Button size="sm" className="h-8 gap-1.5" disabled={bulkRefreshing} onClick={refreshSelected}>
          {bulkRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh {selected.size} page{selected.size === 1 ? "" : "s"}
        </Button>
      </div>
    )}
    </>
  );
}
