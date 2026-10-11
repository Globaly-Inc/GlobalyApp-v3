"use client";

import { useEffect, useRef, useState } from "react";
import { CircleCheck, FileClock, GraduationCap, Plus, Star, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar, SearchInput } from "@/components/ui/filter-bar";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Table, TableBody, TableCard, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SectionTabs } from "@/components/section-tabs";
import { ConfirmDeleteDialog } from "../../../components/confirm-delete-dialog";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { STATUS_TABS } from "../const";
import {
  fetchScholarshipCounts, fetchScholarships,
  removeScholarship, removeScholarships, setFilters, setPage, updateScholarship,
} from "../store/scholarships-slice";
import type { ScholarshipListParams } from "../apis/real-api";
import type { StatusFilter } from "../types";
import type { Scholarship } from "../apis/types";
import { EMPTY_ADVANCED_FILTERS, ScholarshipAdvancedFilters, type AdvancedFilters } from "./scholarship-advanced-filters";
import { ScholarshipDialog } from "./scholarship-dialog";
import { ScholarshipImportDialog } from "./scholarship-import-dialog";
import { SCHOLARSHIP_COLUMNS, ScholarshipRow } from "./scholarship-row";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

type Filters = Omit<ScholarshipListParams, "page" | "limit">;

function filtersFor(status: StatusFilter, search: string, advanced: AdvancedFilters): Filters {
  const filters: Filters = {};
  if (search.trim()) filters.search = search.trim();
  if (status === "published") filters.is_published = true;
  if (status === "draft") filters.is_published = false;
  if (status === "featured") filters.is_featured = true;
  if (advanced.country) filters.country = advanced.country;
  if (advanced.coverageMin) filters.coverage_min = Number(advanced.coverageMin);
  if (advanced.coverageMax) filters.coverage_max = Number(advanced.coverageMax);
  if (advanced.deadlineFrom) filters.deadline_from = advanced.deadlineFrom;
  if (advanced.deadlineTo) filters.deadline_to = advanced.deadlineTo;
  return filters;
}

type Tone = { badge: string; top: string };

const TONES: Record<"neutral" | "green" | "gray" | "amber", Tone> = {
  neutral: { badge: "bg-primary/10 text-primary", top: "bg-primary" },
  green: { badge: "bg-success/15 text-success", top: "bg-success" },
  gray: { badge: "bg-muted text-muted-foreground", top: "bg-muted-foreground/40" },
  amber: { badge: "bg-warning/15 text-warning", top: "bg-warning" },
};

function StatCard({
  icon: Icon, label, value, tone,
}: Readonly<{ icon: typeof GraduationCap; label: string; value: number; tone: keyof typeof TONES }>) {
  const t = TONES[tone];
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className={`h-1 w-full ${t.top}`} />
      <CardContent className="flex items-center gap-3.5 px-5 py-5">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${t.badge}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-3xl font-bold tabular-nums leading-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function ScholarshipsView() {
  const dispatch = useAppDispatch();
  const { scholarships, page, limit, total, counts, status: listStatus } = useAppSelector((state) => state.monitoringScholarships);
  const fetchedRef = useRef(false);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [advanced, setAdvanced] = useState<AdvancedFilters>(EMPTY_ADVANCED_FILTERS);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Scholarship | null>(null);
  const [deleting, setDeleting] = useState<Scholarship | "selection" | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const deletingRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchScholarships({}));
    dispatch(fetchScholarshipCounts());
  }, [dispatch]);

  // Search/status/advanced-filter change resets to page 1 and re-fetches; debounced so typing doesn't fire a request per keystroke.
  useEffect(() => {
    if (!fetchedRef.current) return;
    const timeout = setTimeout(() => {
      const filters = filtersFor(status, search, advanced);
      dispatch(setFilters(filters));
      dispatch(fetchScholarships({ page: 1, ...filters }));
    }, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, advanced]);

  const goToPage = (next: number) => {
    dispatch(setPage(next));
    dispatch(fetchScholarships({ page: next }));
    setSelected(new Set());
  };

  const changePageSize = (next: number) => {
    dispatch(fetchScholarships({ page: 1, limit: next }));
    setSelected(new Set());
  };

  const allSelected = scholarships.length > 0 && scholarships.every((s) => selected.has(s.id));
  const someSelected = scholarships.some((s) => selected.has(s.id));

  const handleToggle = (s: Scholarship, field: "is_published" | "is_featured", value: boolean) => {
    dispatch(updateScholarship({ id: s.id, input: { [field]: value } }));
  };

  const handleSaved = () => {
    dispatch(fetchScholarships({}));
    dispatch(fetchScholarshipCounts());
  };

  const handleConfirmDelete = async () => {
    if (!deleting || deletingRef.current) return;
    deletingRef.current = true;
    setBusy(true);
    if (deleting === "selection") {
      const result = await dispatch(removeScholarships([...selected]));
      setSelected(new Set());
      if (removeScholarships.fulfilled.match(result)) {
        dispatch(fetchScholarshipCounts());
        // Optimistic removal can empty the current page while rows remain on others — backfill it.
        if (scholarships.length === selected.size) dispatch(fetchScholarships({}));
      }
    } else {
      await dispatch(removeScholarship(deleting.id));
    }
    deletingRef.current = false;
    setBusy(false);
    setDeleting(null);
  };

  const toggleSelect = (id: number, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleSelectAll = (checked: boolean) => {
    setSelected(checked ? new Set(scholarships.map((s) => s.id)) : new Set());
  };

  return (
    <PageBody>
      <PageHeader
        title={<><GraduationCap /> Scholarships</>}
        subtitle="Manage scholarship listings, featured placement, and publish status."
      >
        <Button variant="outline" onClick={() => setImportOpen(true)}>
          <Upload className="h-4 w-4" /> Bulk import (XLSX)
        </Button>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4" /> New scholarship
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={GraduationCap} label="Total" value={counts.total} tone="neutral" />
        <StatCard icon={CircleCheck} label="Published" value={counts.published} tone="green" />
        <StatCard icon={FileClock} label="Draft" value={counts.draft} tone="gray" />
        <StatCard icon={Star} label="Featured" value={counts.featured} tone="amber" />
      </div>

      <div className="flex flex-col gap-4">
        <SectionTabs options={STATUS_TABS} value={status} onChange={setStatus} className="mb-0" />

        <FilterBar>
          <SearchInput placeholder="Search by title or provider…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <ScholarshipAdvancedFilters value={advanced} onApply={setAdvanced} />
          <span className="shrink-0 px-2 text-sm text-muted-foreground">
            {total} scholarship{total === 1 ? "" : "s"}
          </span>
        </FilterBar>

        {selected.size > 0 && (
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 px-4 py-2.5">
            <p className="text-sm font-medium text-foreground">{selected.size} selected</p>
            <div className="flex items-center gap-2">
              <Button variant="destructive" size="sm" onClick={() => setDeleting("selection")}>
                <Trash2 className="h-4 w-4" /> Delete {selected.size}
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Clear selection" onClick={() => setSelected(new Set())}>
                <X />
              </Button>
            </div>
          </div>
        )}

        {listStatus === "loading" && scholarships.length === 0 && <ListSkeleton count={6} itemClassName="h-14" />}
        {listStatus !== "loading" && scholarships.length === 0 && (
          <EmptyState icon={GraduationCap} title="No scholarships found." />
        )}
        {scholarships.length > 0 && (
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-px">
                    <Checkbox
                      checked={allSelected}
                      indeterminate={someSelected && !allSelected}
                      onCheckedChange={(v) => toggleSelectAll(!!v)}
                      aria-label="Select all"
                    />
                  </TableHead>
                  {SCHOLARSHIP_COLUMNS.map((col) => (
                    <TableHead key={col.label} className={"className" in col ? col.className : undefined}>
                      {"srOnly" in col ? <span className="sr-only">{col.label}</span> : col.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {scholarships.map((s) => (
                  <ScholarshipRow
                    key={s.id}
                    scholarship={s}
                    selected={selected.has(s.id)}
                    onSelect={(checked) => toggleSelect(s.id, checked)}
                    onToggle={(field, value) => handleToggle(s, field, value)}
                    onEdit={() => { setEditing(s); setDialogOpen(true); }}
                    onDelete={() => setDeleting(s)}
                  />
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
            onPageChange={goToPage}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            onPageSizeChange={changePageSize}
          />
        )}
      </div>

      <ScholarshipDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} onSaved={handleSaved} />
      <ScholarshipImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <ConfirmDeleteDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        name={deleting === "selection" ? `${selected.size} scholarships` : deleting?.title ?? "this scholarship"}
        onConfirm={handleConfirmDelete}
        deleting={busy}
      />
    </PageBody>
  );
}
