"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { Pagination } from "@/components/ui/pagination";
import { Table, TableBody, TableCard, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchBusinessCategoryOptions } from "@/app/admin/platform/categories/store/categories-slice";
import { DynamicIcon } from "@/components/dynamic-icon";
import { ACTIVE_STATUSES, MODE_HEADINGS, PUBLISHABLE_STATUSES, type DashboardMode } from "../const";
import {
  declineJob,
  deleteJob,
  fetchAllExtractions,
  pauseJob,
  promoteJob,
  resumeJob,
} from "../store/all-extractions-slice";
import type { GetJobsParams } from "../apis/types";
import { EXTRACTION_JOB_COLUMNS, ExtractionJobRow } from "./extraction-job-row";
import { JobsListToolbar } from "./jobs-list-toolbar";
import { JobsBulkBar } from "./jobs-bulk-bar";
import { useJobsListFilters } from "./use-jobs-list-filters";

const POLL_MS = 8000;

export function JobsList({ mode, onNewExtraction }: Readonly<{ mode: DashboardMode; onNewExtraction?: () => void }>) {
  const dispatch = useAppDispatch();
  const { jobs, meta, status } = useAppSelector((state) => state.dataAllExtractions);
  const businessCategories = useAppSelector((state) => state.platformCategories.businessCategoryOptions);

  const {
    searchQuery, setSearchQuery, debouncedQuery,
    sortOrder, setSortOrder,
    sourceFilter, setSourceFilter,
    statusFilter, setStatusFilter,
    businessCategoryFilter, setBusinessCategoryFilter,
    showDeclined, setShowDeclined,
    page, setPage, pageSize, setPageSize,
    hasActiveFilters, clearFilters,
  } = useJobsListFilters();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);

  const isCompleted = mode === "completed";
  const showNewExtractionButton = Boolean(onNewExtraction) && (mode === "all" || mode === "ai-ongoing");
  const canPublish = mode === "all" || isCompleted;

  const categoriesFetchedRef = useRef(false);
  useEffect(() => {
    if (categoriesFetchedRef.current) return;
    categoriesFetchedRef.current = true;
    if (businessCategories.length === 0) dispatch(fetchBusinessCategoryOptions());
  }, [dispatch, businessCategories.length]);

  // Any filter/sort/mode/page-size change invalidates the current page — but not the initial
  // mount, where page may have been restored from the URL (?page=N&per_page=N on reload).
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    setPage(1);
  }, [mode, showDeclined, debouncedQuery, sortOrder, sourceFilter, statusFilter, businessCategoryFilter, pageSize]);

  const fetchParams = useMemo<GetJobsParams>(
    () => ({
      mode,
      page,
      limit: pageSize,
      sort: sortOrder,
      statusLabel: statusFilter,
      sourceFilter,
      businessCategoryId: businessCategoryFilter === "all" ? undefined : Number(businessCategoryFilter),
      showDeclined,
      q: debouncedQuery || undefined,
    }),
    [mode, page, pageSize, sortOrder, statusFilter, sourceFilter, businessCategoryFilter, showDeclined, debouncedQuery],
  );

  const lastFetchKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = JSON.stringify(fetchParams);
    if (lastFetchKeyRef.current === key) return;
    lastFetchKeyRef.current = key;
    setSelectedIds(new Set());
    dispatch(fetchAllExtractions(fetchParams));
  }, [dispatch, fetchParams]);

  const hasActiveJob = jobs.some((j) => ACTIVE_STATUSES.includes(j.status));
  useEffect(() => {
    if (isCompleted || !hasActiveJob) return;
    const interval = setInterval(() => dispatch(fetchAllExtractions(fetchParams)), POLL_MS);
    return () => clearInterval(interval);
  }, [hasActiveJob, dispatch, isCompleted, fetchParams]);

  const allPageSelected = jobs.length > 0 && jobs.every((j) => selectedIds.has(j.id));
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

  const toggleSelectAllOnPage = () => {
    setSelectedIds(allPageSelected ? new Set() : new Set(jobs.map((j) => j.id)));
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
    dispatch(fetchAllExtractions(fetchParams));
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
    dispatch(fetchAllExtractions(fetchParams));
  };

  const handleBulkDelete = async () => {
    setConfirmBulkDelete(false);
    setBulkBusy(true);
    await Promise.all([...selectedIds].map((id) => dispatch(deleteJob(id))));
    setBulkBusy(false);
    setSelectedIds(new Set());
    toast.success("Deleted");
    dispatch(fetchAllExtractions(fetchParams));
  };

  const isLoading = status === "loading" && jobs.length === 0;
  const businessCategoryOptions = [
    { value: "all", label: "All categories" },
    ...businessCategories.map((c) => ({
      value: String(c.id),
      label: c.name,
      icon: <DynamicIcon name={c.icon} fallback="Building2" className="h-4 w-4" />,
    })),
  ];

  return (
    <div className="space-y-4 pb-20">
      <JobsListToolbar
        jobCount={meta.total}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        sortOrder={sortOrder}
        onSortOrderChange={setSortOrder}
        sourceFilter={sourceFilter}
        onSourceFilterChange={setSourceFilter}
        showSourceFilter={isCompleted}
        businessCategoryFilter={businessCategoryFilter}
        onBusinessCategoryFilterChange={setBusinessCategoryFilter}
        businessCategoryOptions={businessCategoryOptions}
        showDeclinedToggle={mode !== "ai-ongoing"}
        showDeclined={showDeclined}
        onToggleShowDeclined={() => setShowDeclined(!showDeclined)}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
      />

      {isLoading && <ListSkeleton count={6} itemClassName="h-16" />}

      {!isLoading && meta.total === 0 && (
        <EmptyState
          icon={Building2}
          title={debouncedQuery ? "No jobs match your search." : MODE_HEADINGS[mode].empty}
          action={
            !debouncedQuery && showNewExtractionButton ? (
              <Button className="gap-1.5" onClick={onNewExtraction}>
                <Plus className="h-4 w-4" />
                Start an Extraction
              </Button>
            ) : undefined
          }
        />
      )}

      {jobs.length > 0 && (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                {EXTRACTION_JOB_COLUMNS.map((col) => (
                  <TableHead key={col.label} numeric={"numeric" in col} className={"className" in col ? col.className : undefined}>
                    {col.label === "Select" ? (
                      <Checkbox checked={allPageSelected} onCheckedChange={toggleSelectAllOnPage} aria-label={allPageSelected ? "Deselect page" : "Select page"} />
                    ) : "srOnly" in col ? (
                      <span className="sr-only">{col.label}</span>
                    ) : (
                      col.label
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job, i) => (
                <ExtractionJobRow
                  key={job.id}
                  index={i}
                  job={job}
                  selected={selectedIds.has(job.id)}
                  onToggleSelect={() => toggleSelect(job.id)}
                  onPause={() => runAction(pauseJob(job.id), "Paused")}
                  onResume={() => runAction(resumeJob(job.id), "Resumed")}
                  onDecline={() => runAction(declineJob(job.id), "Extraction declined")}
                  onDelete={() => runAction(deleteJob(job.id), "Deleted")}
                  onPublish={canPublish ? () => handlePublish(job.id) : undefined}
                  onReload={() => dispatch(fetchAllExtractions(fetchParams))}
                  publishing={publishingId === job.id}
                />
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}

      {meta.total > 0 && (
        <Pagination page={page} total={meta.total} limit={pageSize} onPageChange={setPage} align="end" onPageSizeChange={setPageSize} />
      )}

      <JobsBulkBar
        selectedCount={selectedIds.size}
        selectablePublishCount={selectablePublishCount}
        bulkBusy={bulkBusy}
        confirmBulkDelete={confirmBulkDelete}
        onConfirmBulkDeleteChange={setConfirmBulkDelete}
        onClear={() => setSelectedIds(new Set())}
        onPublish={handleBulkPublish}
        onDelete={handleBulkDelete}
      />
    </div>
  );
}
