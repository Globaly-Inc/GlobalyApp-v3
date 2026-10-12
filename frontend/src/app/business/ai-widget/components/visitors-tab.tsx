"use client";

import { useEffect, useState } from "react";
import { visitorHref } from "@/app/business/ai-widget/const";
import { useRouter } from "next/navigation";
import { Download, Loader2, Search, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { PortalPageHeader } from "@/app/business/profile/components/portal-ui/portal-page-header";
import { PortalStats } from "@/app/business/profile/components/portal-ui/portal-stats";
import { PortalStatTile } from "@/app/business/profile/components/portal-ui/portal-stat-tile";
import { SEARCH_INPUT } from "@/app/business/profile/components/portal-ui/portal-ui";
import { TeamSubTabs } from "@/app/business/profile/components/members/team-sub-tabs";
import { fetchVisitors } from "../store/ai-widget-visitors-slice";
import { VISITORS_PAGE_SIZE, VISITOR_TABS } from "../const";
import { downloadCsv, visitorsToCsv } from "../utils";
import { VisitorsTable } from "./visitors-table";
import { ChannelPicker, type ChannelFilter } from "@/app/business/messages/components/channel-picker";
import type { VisitorStatusFilter } from "../apis/types";

/**
 * Everyone who has messaged this org, on the website widget, WhatsApp, Instagram or Facebook —
 * laid out like the Team tab (header, summary tiles, pill tabs, portal table) so the two pages
 * read as one app.
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
  const [channel, setChannel] = useState<ChannelFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const router = useRouter();

  // One effect for every input, debounced. The timer's cleanup is also what makes this safe
  // under Strict Mode's double-invoke — the first run's timer is cancelled before it fires, so
  // a mount sends one request, not two.
  useEffect(() => {
    const timer = setTimeout(() => {
      dispatch(fetchVisitors({ page, limit: VISITORS_PAGE_SIZE, status: tab, search: search.trim() || undefined, channel: channel === "all" ? undefined : channel }));
    }, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [dispatch, page, tab, search, channel]);

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

  const filtered = !!search || tab !== "all" || channel !== "all";

  return (
    <Card>
      <CardContent className="stagger-in grid gap-4">
        <PortalPageHeader title="Visitors & Leads" subtitle="Everyone who has messaged you, on your website, WhatsApp, Instagram or Facebook.">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              className={SEARCH_INPUT}
              placeholder="Search name, email, phone or handle"
              aria-label="Search visitors"
              value={search}
              onChange={(e) => changeQuery(() => setSearch(e.target.value))}
            />
          </div>
        </PortalPageHeader>

        {/* Counts are for the whole list (they ignore search and channel), like the Team tiles. */}
        <PortalStats>
          <PortalStatTile value={counts.all} label="People" />
          <PortalStatTile value={counts.visitor} label="Visitors" />
          <PortalStatTile value={counts.lead} label="Leads" />
        </PortalStats>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <TeamSubTabs
            label="Visitors view"
            options={VISITOR_TABS.map((t) => ({ ...t, count: counts[t.value] }))}
            value={tab}
            onChange={(next) => changeQuery(() => setTab(next))}
          />
          <div className="w-full sm:w-60">
            <ChannelPicker value={channel} onChange={(next) => changeQuery(() => setChannel(next))} />
          </div>
        </div>

        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] border bg-muted/40 p-2.5">
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
          <div className="rounded-[14px] border border-dashed py-12 text-center text-sm text-muted-foreground">
            {error ?? "Couldn't load visitors."}
          </div>
        )}

        {status === "idle" && items.length === 0 && (
          <div className={cn("flex flex-col items-center gap-3 rounded-[14px] border border-dashed py-12 text-center")}>
            <Users className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium">{filtered ? "Nothing matches these filters" : "No one has messaged you yet"}</p>
            {!filtered && (
              <p className="max-w-sm text-xs text-muted-foreground">
                People appear here as soon as they send their first message, and become leads when
                they share their name and email.
              </p>
            )}
          </div>
        )}

        {status === "idle" && items.length > 0 && (
          <div className="grid min-w-0">
            <VisitorsTable
              visitors={items}
              selectedIds={selectedIds}
              onSelectedIdsChange={setSelectedIds}
              // The table stays routing-agnostic: it reports which row was picked, this decides
              // that picking one means opening that visitor's page.
              onView={(v) => router.push(visitorHref(v.id))}
            />
          </div>
        )}

        {total > 0 && (
          <Pagination
            page={page}
            total={total}
            limit={VISITORS_PAGE_SIZE}
            onPageChange={(p) => { setSelectedIds(new Set()); setPage(p); }}
          />
        )}
      </CardContent>
    </Card>
  );
}
