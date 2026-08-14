"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Plus, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import {
  ACTIVE_STATUSES,
  MODE_HEADINGS,
  PUBLISHABLE_STATUSES,
  SORT_OPTIONS,
  SOURCE_FILTER_OPTIONS,
  type DashboardMode,
  type SortOrder,
} from "../const";
import {
  declineJob,
  deleteJob,
  fetchAllExtractions,
  pauseJob,
  promoteJob,
  resumeJob,
} from "../store/all-extractions-slice";
import { ExtractionJobRow } from "./extraction-job-row";
import { NewExtractionDialog } from "./new-extraction-dialog";

const POLL_MS = 8000;

/**
 * The one extraction list. `mode` picks the status filter, the wording and the
 * two mode-only controls — everything else (search, sort, select-all, declined
 * toggle, bulk bar) is identical on all three pages. Ported from V2's
 * ExtractionDashboard, which drove the same three screens off the same prop.
 */
export function JobsList({ mode }: Readonly<{ mode: DashboardMode }>) {
  const dispatch = useAppDispatch();
  const { jobs, status } = useAppSelector((state) => state.dataAllExtractions);

  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [showDeclined, setShowDeclined] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const fetchedModeRef = useRef<DashboardMode | null>(null);

  const isCompleted = mode === "completed";
  const showNewExtractionButton = mode === "all" || mode === "ai-ongoing";
  const canPublish = mode === "all" || isCompleted;

  // Keyed on the mode, not a boolean: still one fetch per mount under Strict Mode,
  // but switching sub-tab refetches with the new status filter.
  useEffect(() => {
    if (fetchedModeRef.current === mode) return;
    fetchedModeRef.current = mode;
    setSelectedIds(new Set()); // ids from the previous tab aren't in this list
    dispatch(fetchAllExtractions(mode));
  }, [dispatch, mode]);

  // Live refresh only where jobs can still move — completed rows never change on their own.
  useEffect(() => {
    if (isCompleted) return;
    if (!jobs.some((j) => ACTIVE_STATUSES.includes(j.status))) return;
    const interval = setInterval(() => dispatch(fetchAllExtractions(mode)), POLL_MS);
    return () => clearInterval(interval);
  }, [jobs, dispatch, mode, isCompleted]);

  const declinedCount = jobs.filter((j) => j.status === "declined").length;

  const visibleJobs = useMemo(() => {
    const base = showDeclined ? jobs : jobs.filter((j) => j.status !== "declined");
    const bySource =
      isCompleted && sourceFilter !== "all"
        ? base.filter((j) => (sourceFilter === "agentcis" ? j.source_type === "agentcis" : j.source_type !== "agentcis"))
        : base;
    const q = searchQuery.trim().toLowerCase();
    const searched = q
      ? bySource.filter(
          (j) => (j.institution_name || "").toLowerCase().includes(q) || j.institution_url.toLowerCase().includes(q),
        )
      : bySource;
    return [...searched].sort((a, b) => {
      switch (sortOrder) {
        case "oldest":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "name_asc":
          return (a.institution_name || "").localeCompare(b.institution_name || "");
        case "name_desc":
          return (b.institution_name || "").localeCompare(a.institution_name || "");
        case "newest":
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
  }, [jobs, showDeclined, searchQuery, sortOrder, sourceFilter, isCompleted]);

  const allVisibleSelected = visibleJobs.length > 0 && visibleJobs.every((j) => selectedIds.has(j.id));
  const selectablePublishCount = [...selectedIds].filter((id) => {
    const job = jobs.find((j) => j.id === id);
    return job && PUBLISHABLE_STATUSES.includes(job.status);
  }).length;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedIds(allVisibleSelected ? new Set() : new Set(visibleJobs.map((j) => j.id)));
  };

  const runAction = async (
    thunk: ReturnType<typeof declineJob | typeof deleteJob | typeof pauseJob | typeof resumeJob>,
    successMessage: string,
  ) => {
    const result = await dispatch(thunk);
    if ("error" in result && result.error) {
      toast.error("Action failed", { description: (result.error as { message?: string }).message ?? "Please try again." });
      return;
    }
    toast.success(successMessage);
  };

  const handlePublish = async (id: string) => {
    setPublishingId(id);
    const result = await dispatch(promoteJob(id));
    setPublishingId(null);
    if ("error" in result && result.error) {
      toast.error("Publish failed", { description: (result.error as { message?: string }).message ?? "Please try again." });
      return;
    }
    toast.success("Published to live catalog");
  };

  const handleBulkPublish = async () => {
    const ids = [...selectedIds].filter((id) => {
      const job = jobs.find((j) => j.id === id);
      return job && PUBLISHABLE_STATUSES.includes(job.status);
    });
    setBulkBusy(true);
    await Promise.all(ids.map((id) => dispatch(promoteJob(id))));
    setBulkBusy(false);
    setSelectedIds(new Set());
    toast.success(`Published ${ids.length} to the live catalog`);
    dispatch(fetchAllExtractions(mode));
  };

  const handleBulkDelete = async () => {
    setConfirmBulkDelete(false);
    setBulkBusy(true);
    await Promise.all([...selectedIds].map((id) => dispatch(deleteJob(id))));
    setBulkBusy(false);
    setSelectedIds(new Set());
    toast.success("Deleted");
    dispatch(fetchAllExtractions(mode));
  };

  const isLoading = status === "loading" && jobs.length === 0;

  return (
    <div className="pb-20">
      {showNewForm && <NewExtractionDialog open={showNewForm} onOpenChange={setShowNewForm} />}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <p className="font-semibold text-foreground">{MODE_HEADINGS[mode].title}</p>
          <p className="text-sm text-muted-foreground">
            {visibleJobs.length} job{visibleJobs.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by name or URL…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-56 pl-7 text-xs"
            />
          </div>

          <Combobox
            options={SORT_OPTIONS}
            value={sortOrder}
            onChange={(v) => setSortOrder(v as SortOrder)}
            className="h-8 w-40 text-xs cursor-pointer"
          />

          {visibleJobs.length > 0 && (
            <Button variant="ghost" className="h-8 gap-1.5 text-xs cursor-pointer" onClick={toggleSelectAllVisible}>
              {/* ponytail: rendered as a span — a real checkbox button inside a button is invalid HTML */}
              <Checkbox checked={allVisibleSelected} render={<span />} className="pointer-events-none" />
              {allVisibleSelected ? "Deselect all" : "Select all"}
            </Button>
          )}

          {isCompleted && (
            <Combobox
              options={SOURCE_FILTER_OPTIONS}
              value={sourceFilter}
              onChange={setSourceFilter}
              className="h-8 w-36 text-xs cursor-pointer"
            />
          )}

          {declinedCount > 0 && (
            <Button
              variant="ghost"
              className="h-8 gap-1.5 text-xs text-muted-foreground cursor-pointer"
              onClick={() => setShowDeclined((s) => !s)}
            >
              {showDeclined ? "Hide" : "Show"} declined ({declinedCount})
            </Button>
          )}

          {showNewExtractionButton && (
            <Button className="gap-2 px-4 cursor-pointer" onClick={() => setShowNewForm(true)}>
              <Plus className="h-4 w-4" />
              New Extraction
            </Button>
          )}
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!isLoading && visibleJobs.length === 0 && (
        <Card className="border-dashed">
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent">
              <Building2 className="h-7 w-7 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground">
              {searchQuery ? "No jobs match your search." : MODE_HEADINGS[mode].empty}
            </p>
            {!searchQuery && showNewExtractionButton && (
              <Button className="gap-1.5 cursor-pointer" onClick={() => setShowNewForm(true)}>
                <Plus className="h-4 w-4" />
                Start an Extraction
              </Button>
            )}
          </div>
        </Card>
      )}

      <div className="space-y-3">
        {visibleJobs.map((job) => (
          <ExtractionJobRow
            key={job.id}
            job={job}
            selected={selectedIds.has(job.id)}
            onToggleSelect={() => toggleSelect(job.id)}
            onPause={() => runAction(pauseJob(job.id), "Paused")}
            onResume={() => runAction(resumeJob(job.id), "Resumed")}
            onDecline={() => runAction(declineJob(job.id), "Extraction declined")}
            onDelete={() => runAction(deleteJob(job.id), "Deleted")}
            onPublish={canPublish ? () => handlePublish(job.id) : undefined}
            publishing={publishingId === job.id}
          />
        ))}
      </div>

      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-background border border-border shadow-lg rounded-full px-4 py-2 flex items-center gap-3">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <span className="text-xs text-muted-foreground">({selectablePublishCount} publishable)</span>
          <Button variant="ghost" size="sm" className="h-8 cursor-pointer" onClick={() => setSelectedIds(new Set())}>
            Clear
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5 cursor-pointer"
            disabled={bulkBusy || selectablePublishCount === 0}
            onClick={handleBulkPublish}
          >
            <Upload className="h-3.5 w-3.5" />
            Publish {selectablePublishCount} to Business
          </Button>
          <Dialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
            <Button
              variant="destructive"
              size="sm"
              className="h-8 gap-1.5 cursor-pointer"
              disabled={bulkBusy}
              onClick={() => setConfirmBulkDelete(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete {selectedIds.size}
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  Delete {selectedIds.size} extraction{selectedIds.size === 1 ? "" : "s"}?
                </DialogTitle>
                <DialogDescription>
                  This will permanently delete all extracted data for the selected job
                  {selectedIds.size === 1 ? "" : "s"}. This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" className="cursor-pointer" onClick={() => setConfirmBulkDelete(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" className="cursor-pointer" onClick={handleBulkDelete}>
                  Delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}
