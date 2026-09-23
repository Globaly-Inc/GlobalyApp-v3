"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Combobox } from "@/components/combobox";
import { cn } from "@/lib/utils";
import { allExtractionsApi } from "../apis";
import { SITE_URL_CATEGORY_LABELS } from "../const";
import { fmtTime } from "../utils";
import { SITE_URL_CATEGORIES, type SiteUrlCategory, type SnapshotMarkdown, type SnapshotRow } from "../apis/types";

const PAGE_SIZE = 20;
/** Shows the row's category whoever set it. Picking one pins it as admin-owned so a re-run never overwrites it; "Auto" clears that pin. */
const ROW_CATEGORIES = [{ value: "auto", label: "Auto" }, ...SITE_URL_CATEGORIES.map((c) => ({ value: c, label: SITE_URL_CATEGORY_LABELS[c] }))];

/** Site tab body. Step 2 of the chain: what was actually fetched, per page. Read-only. */
export function SnapshotsTab({ jobId }: Readonly<{ jobId: string }>) {
  const [rows, setRows] = useState<SnapshotRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<SnapshotMarkdown | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await allExtractionsApi.getSnapshots(jobId, { page, limit: PAGE_SIZE, q: query || undefined });
      setRows(res.data);
      setTotal(res.meta.total);
    } catch (e) {
      toast.error("Could not load snapshots", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [jobId, page, query]);

  useEffect(() => {
    if (fetchedRef.current) { load(); return; }
    fetchedRef.current = true;
    load();
  }, [load]);

  const setCategory = async (row: SnapshotRow, value: string) => {
    setOpening(row.id);
    try {
      await allExtractionsApi.patchSiteUrl(row.site_url_id, { category: value === "auto" ? null : (value as SiteUrlCategory) });
      await load();
    } catch (e) {
      toast.error("Could not change the category", { description: (e as Error).message });
    } finally {
      setOpening(null);
    }
  };

  const view = async (row: SnapshotRow) => {
    setOpening(row.id);
    try {
      setOpen(await allExtractionsApi.getSnapshotMarkdown(jobId, row.id));
    } catch (e) {
      toast.error("Could not open the snapshot", { description: (e as Error).message });
    } finally {
      setOpening(null);
    }
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(q.trim()); }}>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search URLs…" className="h-8 w-64 text-xs" />
          <Button type="submit" variant="outline" size="sm" className="h-8 cursor-pointer"><Search className="h-3.5 w-3.5" /></Button>
        </form>
        <span className="text-xs text-muted-foreground">{total} page{total === 1 ? "" : "s"} stored for this site</span>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="px-2 py-2">URL</th>
              <th className="w-52 px-2 py-2">Category</th>
              <th className="w-20 px-2 py-2">Scraper</th>
              <th className="w-36 px-2 py-2">Fetched at</th>
              <th className="w-16 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr><td colSpan={5} className="px-2 py-8 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={5} className="px-2 py-8 text-center text-muted-foreground">
                No snapshots yet — run “Map site”, then “Snapshot” above.
              </td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className={cn("border-t border-border", r.excluded && "opacity-60")}>
                <td className="max-w-xl truncate px-2 py-1.5 font-mono text-[11px]" title={`${r.url}\n${r.gcs_path}`}>
                  <a href={r.url} target="_blank" rel="noreferrer" className="hover:underline">{r.url}</a>
                </td>
                <td className="px-2 py-1.5">
                  <Combobox
                    className="w-36"
                    options={ROW_CATEGORIES}
                    value={r.category ?? "auto"}
                    disabled={opening === r.id}
                    onChange={(v) => setCategory(r, v)}
                  />
                </td>
                <td className="px-2 py-1.5 text-muted-foreground">{r.scraper}</td>
                <td className="px-2 py-1.5 text-muted-foreground">{fmtTime(r.scraped_at)}</td>
                <td className="px-2 py-1.5 text-right">
                  <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px] cursor-pointer" disabled={opening === r.id} onClick={() => view(r)} title="Read the stored markdown">
                    {opening === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                    View
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} total={total} limit={PAGE_SIZE} onPageChange={setPage} />

      <Sheet open={open !== null} onOpenChange={(o) => { if (!o) setOpen(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="truncate text-sm">{open?.url}</SheetTitle>
            <SheetDescription>Stored snapshot · fetched {fmtTime(open?.scraped_at)} · {open?.markdown.length.toLocaleString()} chars. This is exactly what the model is shown.</SheetDescription>
          </SheetHeader>
          <pre className="mx-4 mb-4 whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed">{open?.markdown}</pre>
        </SheetContent>
      </Sheet>
    </div>
  );
}
