"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, CircleCheck, FileClock, GraduationCap, Plus, Star, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminSegmentedTabs } from "../../../components/admin-segmented-tabs";
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
import { ScholarshipRow } from "./scholarship-row";
import { ScholarshipsTableHeader } from "./scholarships-table-header";

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
  green: { badge: "bg-emerald-500/10 text-emerald-600", top: "bg-emerald-500" },
  gray: { badge: "bg-muted text-muted-foreground", top: "bg-muted-foreground/40" },
  amber: { badge: "bg-amber-500/10 text-amber-600", top: "bg-amber-500" },
};

function StatCard({
  icon: Icon, label, value, tone,
}: Readonly<{ icon: typeof GraduationCap; label: string; value: number; tone: keyof typeof TONES }>) {
  const t = TONES[tone];
  return (
    <Card className="gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md">
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
  const { scholarships, page, limit, totalPages, total, counts } = useAppSelector((state) => state.monitoringScholarships);
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
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Scholarships</h1>
          <p className="text-muted-foreground mt-1">Manage scholarship listings, featured placement, and publish status.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" /> Bulk import (XLSX)
          </Button>
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" /> New scholarship
          </Button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-4 gap-4">
        <StatCard icon={GraduationCap} label="Total" value={counts.total} tone="neutral" />
        <StatCard icon={CircleCheck} label="Published" value={counts.published} tone="green" />
        <StatCard icon={FileClock} label="Draft" value={counts.draft} tone="gray" />
        <StatCard icon={Star} label="Featured" value={counts.featured} tone="amber" />
      </div>

      <div className="mb-4 flex items-center gap-3">
        <AdminSegmentedTabs options={STATUS_TABS} value={status} onChange={setStatus} className="mb-0" />
        <ScholarshipAdvancedFilters value={advanced} onApply={setAdvanced} />
        <Input placeholder="Search by title or provider…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-10 max-w-sm ml-auto" />
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-border bg-muted/50 px-4 py-2.5">
          <p className="text-sm font-medium text-foreground">{selected.size} selected</p>
          <div className="flex items-center gap-2">
            <Button variant="destructive" size="sm" onClick={() => setDeleting("selection")}>
              <Trash2 className="h-4 w-4" /> Delete {selected.size}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelected(new Set())}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* overflow-visible overrides Card's own baked-in overflow-hidden, which would otherwise trap the sticky table header inside this box */}
      <Card className="overflow-visible py-0">
        <CardContent className="p-0">
          {scholarships.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No scholarships found.</p>
          ) : (
            <>
              <ScholarshipsTableHeader allSelected={allSelected} someSelected={someSelected} onSelectAll={toggleSelectAll} />
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
            </>
          )}
        </CardContent>
      </Card>

      {total > 0 && (
        <div className="mt-3 flex items-center justify-end gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>Rows per page</span>
            <Select value={String(limit)} onValueChange={(v) => v && changePageSize(Number(v))}>
              <SelectTrigger className="h-8 w-17.5 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p>Page {page} of {totalPages} · {total} total</p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <ScholarshipDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} onSaved={handleSaved} />
      <ScholarshipImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <ConfirmDeleteDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        name={deleting === "selection" ? `${selected.size} scholarships` : deleting?.title ?? "this scholarship"}
        onConfirm={handleConfirmDelete}
        deleting={busy}
      />
    </div>
  );
}
