"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Building2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchBusinessCategoryOptions } from "@/app/admin/platform/categories/store/categories-slice";
import { DynamicIcon } from "@/components/dynamic-icon";
import { ACTIVE_STATUSES, MODE_HEADINGS, PUBLISHABLE_STATUSES, type DashboardMode, type SortOrder } from "../const";
import {
  declineJob,
  deleteJob,
  fetchAllExtractions,
  pauseJob,
  promoteJob,
  resumeJob,
} from "../store/all-extractions-slice";
import type { GetJobsParams } from "../apis/types";
import { ExtractionJobRow } from "./extraction-job-row";
import { NewExtractionDialog } from "./new-extraction-dialog";
import { JobsListToolbar } from "./jobs-list-toolbar";
import { JobsBulkBar } from "./jobs-bulk-bar";

const POLL_MS = 8000;
const DEFAULT_PAGE_SIZE = 10;

export function JobsList({ mode }: Readonly<{ mode: DashboardMode }>) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { jobs, meta, status } = useAppSelector((state) => state.dataAllExtractions);
  const businessCategories = useAppSelector((state) => state.platformCategories.businessCategoryOptions);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [businessCategoryFilter, setBusinessCategoryFilter] = useState("all");
  const [showDeclined, setShowDeclined] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPageState] = useState(() => Number(searchParams.get("page")) || 1);
  const [pageSize, setPageSizeState] = useState(() => Number(searchParams.get("per_page")) || DEFAULT_PAGE_SIZE);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);

  const isCompleted = mode === "completed";
  const showNewExtractionButton = mode === "all" || mode === "ai-ongoing";
  const canPublish = mode === "all" || isCompleted;

  const setPage = (next: number) => {
    setPageState(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(next));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const setPageSize = (next: number) => {
    setPageSizeState(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("per_page", String(next));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const categoriesFetchedRef = useRef(false);
  useEffect(() => {
    if (categoriesFetchedRef.current) return;
    categoriesFetchedRef.current = true;
    if (businessCategories.length === 0) dispatch(fetchBusinessCategoryOptions());
  }, [dispatch, businessCategories.length]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

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
    <div className="pb-20">
      <NewExtractionDialog open={showNewForm} onOpenChange={setShowNewForm} />

      <JobsListToolbar
        mode={mode}
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
        showSelectAll={jobs.length > 0}
        allPageSelected={allPageSelected}
        onToggleSelectAll={toggleSelectAllOnPage}
        showDeclinedToggle={mode !== "ai-ongoing"}
        showDeclined={showDeclined}
        onToggleShowDeclined={() => setShowDeclined((s) => !s)}
        showNewExtractionButton={showNewExtractionButton}
        onNewExtraction={() => setShowNewForm(true)}
      />

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!isLoading && meta.total === 0 && (
        <Card className="border-dashed">
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent">
              <Building2 className="h-7 w-7 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground">
              {debouncedQuery ? "No jobs match your search." : MODE_HEADINGS[mode].empty}
            </p>
            {!debouncedQuery && showNewExtractionButton && (
              <Button className="gap-1.5 cursor-pointer" onClick={() => setShowNewForm(true)}>
                <Plus className="h-4 w-4" />
                Start an Extraction
              </Button>
            )}
          </div>
        </Card>
      )}

      <div className="space-y-3">
        {jobs.map((job) => (
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
            onReload={() => dispatch(fetchAllExtractions(fetchParams))}
            publishing={publishingId === job.id}
          />
        ))}
      </div>

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
