"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EyeOff, Eye, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Combobox } from "@/components/combobox";
import { cn } from "@/lib/utils";
import { allExtractionsApi } from "../apis";
import { SITE_URL_CATEGORY_LABELS } from "../const";
import { SITE_URL_CATEGORIES, type SiteUrl, type SiteUrlCategory, type SiteUrlCounts } from "../apis/types";

const PAGE_SIZE = 20;
const EMPTY_COUNTS: SiteUrlCounts = {
  total: 0, unclassified: 0, excluded: 0,
  by_category: Object.fromEntries(SITE_URL_CATEGORIES.map((c) => [c, 0])) as Record<SiteUrlCategory, number>,
};

type CategoryFilter = "all" | SiteUrlCategory | "unclassified";
type ExcludedFilter = "active" | "excluded" | "all";

const CATEGORY_OPTIONS = SITE_URL_CATEGORIES.map((c) => ({ value: c, label: SITE_URL_CATEGORY_LABELS[c] }));
const CATEGORY_FILTERS: { value: CategoryFilter; label: string }[] = [
  { value: "all", label: "All categories" },
  ...CATEGORY_OPTIONS,
  { value: "unclassified", label: "Not yet classified" },
];
const EXCLUDED_FILTERS: { value: ExcludedFilter; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "excluded", label: "Excluded" },
  { value: "all", label: "Active + excluded" },
];
const ROW_CATEGORIES: { value: string; label: string }[] = [{ value: "auto", label: "Auto" }, ...CATEGORY_OPTIONS];

/**
 * Site tab → Details sheet. Steps 1 and 4 of the chain, as a table the admin can prune before anything is scraped or sent to
 * Gemini. Excluding a URL keeps it out of snapshot, classify and queue; setting a category pins it
 * as admin-owned so a re-run of the classifier never overwrites it. Only `course` pages are queued.
 */
export function SiteUrlsTab({ jobId }: Readonly<{ jobId: string }>) {
  const [rows, setRows] = useState<SiteUrl[]>([]);
  const [counts, setCounts] = useState<SiteUrlCounts>(EMPTY_COUNTS);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [excluded, setExcluded] = useState<ExcludedFilter>("active");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await allExtractionsApi.getSiteUrls(jobId, {
        page, limit: PAGE_SIZE, q: query || undefined,
        category: category === "all" ? undefined : category,
        excluded: excluded === "all" ? undefined : excluded === "excluded",
      });
      setRows(res.data);
      setTotal(res.meta.total);
      setCounts(res.counts);
      setSelected(new Set());
    } catch (e) {
      toast.error("Could not load the site URL list", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [jobId, page, category, excluded, query]);

  useEffect(() => {
    if (fetchedRef.current) { load(); return; }
    fetchedRef.current = true;
    load();
  }, [load]);

  const patch = async (row: SiteUrl, change: { excluded?: boolean; category?: SiteUrlCategory | null }) => {
    setBusy(row.id);
    try {
      await allExtractionsApi.patchSiteUrl(row.id, change);
      await load();
    } catch (e) {
      toast.error("Update failed", { description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const bulk = async (exclude: boolean) => {
    if (selected.size === 0) return;
    setBusy("bulk");
    try {
      await allExtractionsApi.bulkExcludeSiteUrls(jobId, [...selected], exclude);
      toast.success(`${selected.size} URL${selected.size === 1 ? "" : "s"} ${exclude ? "excluded" : "restored"}`);
      await load();
    } catch (e) {
      toast.error("Bulk update failed", { description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allOnPageSelected ? new Set() : new Set(rows.map((r) => r.id)));
  const toggleOne = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // Every chip is a filter. "All" is every row including excluded; "Excluded" flips the excluded
  // filter; a category chip narrows to that category among active rows. Clicking the active chip
  // goes back to the default view (all categories, active rows).
  type Target = { category: CategoryFilter; excluded: ExcludedFilter };
  const DEFAULT: Target = { category: "all", excluded: "active" };
  const applyTarget = (t: Target) => {
    const isActive = category === t.category && excluded === t.excluded;
    const next = isActive && !(t.category === DEFAULT.category && t.excluded === DEFAULT.excluded) ? DEFAULT : t;
    setCategory(next.category); setExcluded(next.excluded); setPage(1);
  };
  const chip = (label: string, n: number, target: Target, tone = "") => {
    const isActive = category === target.category && excluded === target.excluded;
    return (
      <button
        key={label}
        type="button"
        onClick={() => applyTarget(target)}
        className={cn(
          "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs cursor-pointer hover:bg-muted/60",
          isActive ? "border-primary bg-primary/5 text-primary" : "border-border",
          tone,
        )}
      >
        <span className="font-semibold tabular-nums">{n}</span>
        <span className={cn(isActive ? "text-primary" : "text-muted-foreground")}>{label}</span>
      </button>
    );
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {chip("All", counts.total, { category: "all", excluded: "all" })}
        {chip("Not yet classified", counts.unclassified, { category: "unclassified", excluded: "active" }, "text-amber-700")}
        {chip("Excluded by you", counts.excluded, { category: "all", excluded: "excluded" })}
        {SITE_URL_CATEGORIES.map((c) => chip(SITE_URL_CATEGORY_LABELS[c], counts.by_category[c] ?? 0, { category: c, excluded: "active" }, c === "course" ? "text-emerald-700" : ""))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(q.trim()); }}
        >
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search URLs…" className="h-8 w-64 text-xs" />
          <Button type="submit" variant="outline" size="sm" className="h-8 cursor-pointer"><Search className="h-3.5 w-3.5" /></Button>
        </form>
        <Combobox className="w-44" options={CATEGORY_FILTERS} value={category} onChange={(v) => { setCategory(v as CategoryFilter); setPage(1); }} />
        <Combobox className="w-44" options={EXCLUDED_FILTERS} value={excluded} onChange={(v) => { setExcluded(v as ExcludedFilter); setPage(1); }} />
        {selected.size > 0 && (
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">{selected.size} selected</span>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 cursor-pointer" disabled={busy !== null} onClick={() => bulk(true)}>
              <EyeOff className="h-3.5 w-3.5" /> Exclude
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 cursor-pointer" disabled={busy !== null} onClick={() => bulk(false)}>
              <Eye className="h-3.5 w-3.5" /> Restore
            </Button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-2"><Checkbox checked={allOnPageSelected} onCheckedChange={toggleAll} aria-label="Select all on page" /></th>
              <th className="px-2 py-2">URL</th>
              <th className="w-28 px-2 py-2">Found via</th>
              <th className="w-44 px-2 py-2">Category</th>
              <th className="w-24 px-2 py-2">Decided by</th>
              <th className="w-24 px-2 py-2 text-right">Excluded</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr><td colSpan={6} className="px-2 py-8 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="px-2 py-8 text-center text-muted-foreground">
                {counts.total === 0 ? "No URLs yet — run “Map site” on the Site tab." : "Nothing matches these filters."}
              </td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className={cn("border-t border-border", r.excluded && "opacity-60")}>
                <td className="px-2 py-1.5"><Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggleOne(r.id)} aria-label={`Select ${r.url}`} /></td>
                <td className="max-w-xl truncate px-2 py-1.5 font-mono text-[11px]" title={r.url}>
                  <a href={r.url} target="_blank" rel="noreferrer" className="hover:underline">{r.url}</a>
                </td>
                <td className="px-2 py-1.5 text-muted-foreground">{r.source}</td>
                <td className="px-2 py-1.5">
                  <Combobox
                    className="w-36"
                    options={ROW_CATEGORIES}
                    value={r.category_source === "admin" && r.category ? r.category : "auto"}
                    disabled={busy === r.id}
                    onChange={(v) => patch(r, { category: v === "auto" ? null : (v as SiteUrlCategory) })}
                  />
                  {r.category_source !== "admin" && r.category && <span className="ml-1.5 text-[10px] text-muted-foreground">({SITE_URL_CATEGORY_LABELS[r.category]})</span>}
                </td>
                <td className="px-2 py-1.5 text-muted-foreground">{r.category_source ?? "—"}</td>
                <td className="px-2 py-1.5 text-right">
                  <Button
                    variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px] cursor-pointer" disabled={busy === r.id}
                    onClick={() => patch(r, { excluded: !r.excluded })}
                    title={r.excluded ? "Restore this URL" : "Exclude from snapshot, classify and queue"}
                  >
                    {busy === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : r.excluded ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    {r.excluded ? "Restore" : "Exclude"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} total={total} limit={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
}
