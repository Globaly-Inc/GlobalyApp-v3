"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, History } from "lucide-react";
import { Combobox } from "@/components/combobox";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar, SearchInput } from "@/components/ui/filter-bar";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { Pagination } from "@/components/ui/pagination";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SectionTabs } from "@/components/section-tabs";
import { cn } from "@/lib/utils";
import { ExtractionStatusBadge } from "@/app/admin/data/all-extractions/components/status-badge";
import type { ExtractionJob } from "@/app/admin/data/all-extractions/apis/types";
import { spreadsheetImportApi } from "../apis";
import { ImportCoursesPanel } from "./import-courses-panel";

type Tab = "imported" | "failed";
const FAILED = ["failed"];
/** Status filter for the Imported tab — each option covers the raw statuses sharing its badge label. */
const STATUS_FILTERS: { value: string; label: string; statuses: string[] }[] = [
  { value: "all", label: "All statuses", statuses: [] },
  { value: "processing", label: "Processing", statuses: ["processing"] },
  { value: "review", label: "Pending Review", statuses: ["review"] },
  { value: "approved", label: "Approved", statuses: ["verified", "approved"] },
  { value: "completed", label: "Completed", statuses: ["done", "completed"] },
  { value: "published", label: "Published", statuses: ["exported", "pushed"] },
  { value: "declined", label: "Declined", statuses: ["declined"] },
];
const SEARCH_DEBOUNCE_MS = 300;

/** Past spreadsheet imports — paged, searchable by institution name and filterable by status, split
 * into those that went through and those that failed while staging. `refreshKey` changes when the
 * wizard closes, so a fresh import shows up without a reload. */
export function ImportHistory({ refreshKey }: Readonly<{ refreshKey: number }>) {
  const [tab, setTab] = useState<Tab>("imported");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [jobs, setJobs] = useState<ExtractionJob[] | null>(null);
  const [totals, setTotals] = useState<Record<Tab, number>>({ imported: 0, failed: 0 });
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setQ(search.trim()); setPage(1); }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let live = true;
    const statuses = tab === "failed" ? FAILED : STATUS_FILTERS.find((f) => f.value === status)!.statuses;
    const excludeStatuses = tab === "failed" ? [] : FAILED;
    // The other tab's count comes from a one-row page of it, so both tab labels stay current.
    const other = tab === "failed" ? { excludeStatuses: FAILED } : { statuses: FAILED };
    Promise.all([
      spreadsheetImportApi.listImports({ page, limit, q: q || undefined, statuses, excludeStatuses }),
      spreadsheetImportApi.listImports({ page: 1, limit: 1, q: q || undefined, ...other }),
    ])
      .then(([current, rest]) => {
        if (!live) return;
        setJobs(current.jobs);
        setTotals(tab === "failed"
          ? { failed: current.meta.total, imported: rest.meta.total }
          : { imported: current.meta.total, failed: rest.meta.total });
        setError(null);
      })
      .catch((e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [tab, status, q, page, limit, refreshKey]);

  const total = totals[tab];

  const tabOptions = [
    { value: "imported" as const, label: "Imported", count: totals.imported },
    { value: "failed" as const, label: "Failed", count: totals.failed },
  ];

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-base font-medium text-foreground">Import history</h2>

      <SectionTabs
        options={tabOptions}
        value={tab}
        onChange={(v) => { setTab(v); setPage(1); setExpanded(null); }}
        className="mb-0"
      />

      <FilterBar>
        <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search institutions…" />
        {tab === "imported" && (
          <Combobox
            options={STATUS_FILTERS.map((f) => ({ value: f.value, label: f.label }))}
            value={status}
            onChange={(v) => { setStatus(v || "all"); setPage(1); }}
            className="h-10 w-48"
          />
        )}
        <span className="shrink-0 px-2 text-sm text-muted-foreground">
          {total} import{total === 1 ? "" : "s"}
        </span>
      </FilterBar>

      {error ? (
        <p className="text-sm text-destructive">Couldn&apos;t load imports: {error}</p>
      ) : !jobs ? (
        <ListSkeleton count={4} itemClassName="h-12" />
      ) : jobs.length === 0 ? (
        <EmptyState
          compact
          icon={History}
          title={q || status !== "all" ? "No imports match." : tab === "failed" ? "No failed imports." : "Nothing imported yet."}
        />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"><span className="sr-only">Expand</span></TableHead>
                <TableHead>Institution</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">{tab === "failed" ? "Reason" : "Courses"}</TableHead>
                <TableHead className="hidden lg:table-cell">Imported</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((j) => (
                <Fragment key={j.id}>
                  <TableRow>
                    <TableCell>
                      <button
                        type="button"
                        aria-label="Show courses"
                        aria-expanded={expanded === j.id}
                        onClick={() => setExpanded((e) => (e === j.id ? null : j.id))}
                        className="cursor-pointer text-muted-foreground"
                      >
                        <ChevronDown className={cn("h-4 w-4 transition-transform", expanded !== j.id && "-rotate-90")} />
                      </button>
                    </TableCell>
                    <TableCell primary className="font-medium">
                      <Link href={`/admin/data/all-extractions/${j.id}`} className="block truncate text-primary hover:underline">
                        {j.institution_name || "(unnamed)"}
                      </Link>
                      {/* Fallbacks for the columns hidden on narrow screens. */}
                      {tab === "failed" ? (
                        <p className="text-xs font-normal whitespace-normal text-destructive md:hidden">{j.error_message || "Failed while importing"}</p>
                      ) : (
                        <p className="text-xs font-normal text-muted-foreground md:hidden">{j.courses_extracted} courses</p>
                      )}
                      <p className="truncate text-xs font-normal text-muted-foreground lg:hidden">{new Date(j.created_at).toLocaleString()}</p>
                    </TableCell>
                    <TableCell><ExtractionStatusBadge status={j.status} /></TableCell>
                    {tab === "failed"
                      ? <TableCell className="hidden max-w-md text-xs whitespace-normal text-destructive md:table-cell">{j.error_message || "Failed while importing"}</TableCell>
                      : <TableCell className="hidden md:table-cell">{j.courses_extracted}</TableCell>}
                    <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">{new Date(j.created_at).toLocaleString()}</TableCell>
                  </TableRow>
                  {expanded === j.id && (
                    <TableRow>
                      <TableCell colSpan={5} className="bg-muted/30 p-4"><ImportCoursesPanel jobId={j.id} /></TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}

      {total > 0 && (
        <Pagination
          page={page}
          limit={limit}
          total={total}
          onPageChange={(p) => { setPage(p); setExpanded(null); }}
          onPageSizeChange={(l) => { setLimit(l); setPage(1); }}
        />
      )}
    </section>
  );
}
