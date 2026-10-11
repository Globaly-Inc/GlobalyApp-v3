"use client";

import { useEffect, useState } from "react";
import { visitorHref } from "@/app/business/ai-widget/const";
import { useRouter } from "next/navigation";
import { Download, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar, SearchInput } from "@/components/ui/filter-bar";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { TableCard } from "@/components/ui/table";
import { SectionTabs } from "@/components/section-tabs";
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

  // Rendered at /business/contacts/visitors, which BusinessShell gives PortalShell `width="wide"`.
  return (
    <PageBody>
      <PageHeader title={<><Users /> Visitors &amp; Leads</>} subtitle="Everyone who has chatted with your AI widget." />

      <SectionTabs
        options={VISITOR_TABS.map((t) => ({ ...t, count: counts[t.value] }))}
        value={tab}
        onChange={(next) => changeQuery(() => setTab(next))}
        className="mb-0"
      />

      <FilterBar>
        <SearchInput
          placeholder="Search name, email or programme"
          value={search}
          onChange={(e) => changeQuery(() => setSearch(e.target.value))}
        />
        <span className="shrink-0 px-2 text-sm text-muted-foreground">
          {total} {VISITOR_TABS.find((t) => t.value === tab)?.label.toLowerCase()}
        </span>
      </FilterBar>

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 p-2.5">
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

      {status === "loading" && <ListSkeleton count={6} itemClassName="h-14" />}

      {status === "failed" && (
        <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          {error ?? "Couldn't load visitors."}
        </div>
      )}

      {status === "idle" && items.length === 0 && (
        <EmptyState
          icon={Users}
          title={search || tab !== "all" ? "Nothing matches these filters" : "No one has used your AI widget yet"}
          description={
            !search && tab === "all"
              ? "Visitors appear here as soon as someone sends their first message, and become leads when they share their name and email."
              : undefined
          }
        />
      )}

      {status === "idle" && items.length > 0 && (
        <TableCard>
          <VisitorsTable
            visitors={items}
            selectedIds={selectedIds}
            onSelectedIdsChange={setSelectedIds}
            // The table stays routing-agnostic: it reports which row was picked, this decides
            // that picking one means opening that visitor's page.
            onView={(v) => router.push(visitorHref(v.id))}
          />
        </TableCard>
      )}

      {total > 0 && (
        <Pagination
          page={page}
          total={total}
          limit={VISITORS_PAGE_SIZE}
          onPageChange={(p) => { setSelectedIds(new Set()); setPage(p); }}
        />
      )}
    </PageBody>
  );
}
