"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Search, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { AdminSegmentedTabs } from "@/app/admin/components/admin-segmented-tabs";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchVisitors } from "../store/ai-widget-visitors-slice";
import { VISITORS_PAGE_SIZE, VISITOR_TABS } from "../const";
import { downloadCsv, visitorsToCsv } from "../utils";
import { VisitorsTable } from "./visitors-table";
import type { VisitorStatusFilter } from "../apis/types";

/**
 * Everyone who has talked to this org's AI embed widget.
 *
 * Tenant scoping is entirely the backend's: `ai_widget_visitors` lives in the tenant schema, so
 * the endpoint has no org id to pass and this component has none to send. Nothing here can widen
 * what it sees by asking differently, which is the reason to keep it that way.
 *
 * Visitor vs Lead is likewise never chosen here — it is read off the row (`v.status`), derived
 * server-side from whether the person ever handed over a name and email. The tabs filter it;
 * nothing in this page sets it.
 */
export function VisitorsTab() {
  const dispatch = useAppDispatch();
  const { items, total, counts, status, error } = useAppSelector((s) => s.aiWidgetVisitors);

  const [tab, setTab] = useState<VisitorStatusFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const router = useRouter();

  // One effect for every input, debounced. The timer's cleanup is also what makes this safe
  // under Strict Mode's double-invoke — the first run's timer is cancelled before it fires, so
  // a mount sends one request, not two.
  useEffect(() => {
    const timer = setTimeout(() => {
      dispatch(fetchVisitors({ page, limit: VISITORS_PAGE_SIZE, status: tab, search: search.trim() || undefined }));
    }, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [dispatch, page, tab, search]);

  // Selection is per result set. Keeping it across a filter change would let "3 selected" mean
  // three rows nobody can see any more — and the export below would then quietly disagree with
  // the list it was taken from.
  const changeQuery = (apply: () => void) => {
    setSelectedIds(new Set());
    setPage(1);
    apply();
  };

  const exportSelected = () => {
    const rows = items.filter((v) => selectedIds.has(v.id));
    downloadCsv(`widget-${tab === "all" ? "visitors" : tab}s-${new Date().toISOString().slice(0, 10)}.csv`, visitorsToCsv(rows));
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Visitors &amp; Leads</span>
          <Badge variant="secondary">{counts.all}</Badge>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-10 pl-8"
            placeholder="Search name or email"
            value={search}
            onChange={(e) => changeQuery(() => setSearch(e.target.value))}
          />
        </div>
      </div>

      <AdminSegmentedTabs
        options={VISITOR_TABS.map((t) => ({ ...t, count: counts[t.value] }))}
        value={tab}
        onChange={(next) => changeQuery(() => setTab(next))}
      />

      {selectedIds.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 p-2.5">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={exportSelected}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
              <X className="mr-1.5 h-3.5 w-3.5" /> Clear
            </Button>
          </div>
        </div>
      )}

      {status === "loading" && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      )}

      {status === "failed" && (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          {error ?? "Couldn't load visitors."}
        </div>
      )}

      {status === "idle" && items.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
          <Users className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium">
            {search || tab !== "all" ? "Nothing matches these filters" : "No one has used your AI widget yet"}
          </p>
          {!search && tab === "all" && (
            <p className="max-w-sm text-xs text-muted-foreground">
              Visitors appear here as soon as someone sends their first message, and become leads
              when they share their name and email.
            </p>
          )}
        </div>
      )}

      {status === "idle" && items.length > 0 && (
        <VisitorsTable
          visitors={items}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
          // The table stays routing-agnostic: it reports which row was picked, this decides
          // that picking one means opening that visitor's page.
          onView={(v) => router.push(`/business/ai-widget/visitors/${v.id}`)}
        />
      )}

      {total > 0 && (
        <Pagination
          page={page}
          total={total}
          limit={VISITORS_PAGE_SIZE}
          onPageChange={(p) => { setSelectedIds(new Set()); setPage(p); }}
        />
      )}

    </div>
  );
}
