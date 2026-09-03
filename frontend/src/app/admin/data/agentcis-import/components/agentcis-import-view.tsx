"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { MAX_SELECTION } from "../const";
import {
  searchAgentCIS,
  importAgentCIS,
  bulkCrawlAgentCIS,
  fetchAgentcisJobs,
  deleteAgentcisJob,
  toggleSelection,
  clearSelection,
  clearImportResult,
  clearBulkCrawlResult,
} from "../store/agentcis-import-slice";
import { getAgentcisId } from "../utils";
import { AgentcisSearchCard } from "./agentcis-search-card";
import { AgentcisBulkCrawlCard } from "./agentcis-bulk-crawl-card";
import { AgentcisJobsTable } from "./agentcis-jobs-table";
import { AgentcisJobErrorDialog } from "./agentcis-job-error-dialog";
import type { AgentcisJob } from "../apis/types";

export function AgentcisImportView() {
  const dispatch = useAppDispatch();
  const {
    searchResults, selectedIds, searchStatus, importStatus, importResult,
    bulkCrawlStatus, bulkCrawlResult, error, jobs, jobsStatus,
  } = useAppSelector((state) => state.dataAgentcisImport);

  const [query, setQuery] = useState("");
  const [errorJob, setErrorJob] = useState<AgentcisJob | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialFetchRef = useRef(false);

  useEffect(() => {
    if (initialFetchRef.current) return;
    initialFetchRef.current = true;
    dispatch(searchAgentCIS(""));
    dispatch(fetchAgentcisJobs());
  }, [dispatch]);

  useEffect(() => {
    const id = setInterval(() => dispatch(fetchAgentcisJobs()), 5000);
    return () => clearInterval(id);
  }, [dispatch]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => dispatch(searchAgentCIS(query)), 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, dispatch]);

  const handleImport = useCallback(() => {
    if (selectedIds.length === 0) {
      toast.error("Select at least one institution first.");
      return;
    }
    dispatch(importAgentCIS(selectedIds)).then(() => {
      setTimeout(() => dispatch(fetchAgentcisJobs()), 1500);
    });
  }, [dispatch, selectedIds]);

  const handleBulkCrawl = useCallback((startPage: number, maxPages: number) => {
    dispatch(bulkCrawlAgentCIS({ startPage, maxPages })).then(() => {
      setTimeout(() => dispatch(fetchAgentcisJobs()), 1500);
    });
  }, [dispatch]);

  const handleToggle = (id: string | number) => {
    const sid = String(id);
    if (!selectedIds.includes(sid) && selectedIds.length >= MAX_SELECTION) {
      toast.error(`Maximum ${MAX_SELECTION} institutions per import.`);
      return;
    }
    dispatch(toggleSelection(sid));
  };

  // Re-dispatches the same institution by its stored agentcis_id (see backend
  // agentcis-staging.ts). Older jobs from before this was tracked fall back to the
  // original delete-and-ask-to-re-search behavior.
  const handleRetry = useCallback((job: AgentcisJob) => {
    const agentcisId = getAgentcisId(job);
    if (!agentcisId) {
      dispatch(deleteAgentcisJob(job.id));
      toast.info(`Deleted failed job "${job.institution_name}". Search and re-import to retry.`);
      return;
    }
    dispatch(importAgentCIS([agentcisId])).then(() => {
      dispatch(deleteAgentcisJob(job.id));
      toast.success(`Re-queued "${job.institution_name ?? agentcisId}".`);
      setTimeout(() => dispatch(fetchAgentcisJobs()), 1500);
    });
  }, [dispatch]);

  const handleDelete = useCallback((job: AgentcisJob) => {
    dispatch(deleteAgentcisJob(job.id));
    toast.success(`Deleted job "${job.institution_name ?? job.id}".`);
  }, [dispatch]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">AgentCIS Import</h1>
        <p className="text-muted-foreground mt-1">
          Search AgentCIS and import institutions into the extraction queue.
        </p>
      </div>

      <AgentcisSearchCard
        query={query}
        onQueryChange={setQuery}
        searchLoading={searchStatus === "loading"}
        results={searchResults}
        selectedIds={selectedIds}
        onToggle={handleToggle}
        onClearSelection={() => dispatch(clearSelection())}
        onImport={handleImport}
        importLoading={importStatus === "loading"}
        importResult={importResult}
        onClearImportResult={() => dispatch(clearImportResult())}
        error={error}
      />

      <AgentcisBulkCrawlCard
        onCrawl={handleBulkCrawl}
        loading={bulkCrawlStatus === "loading"}
        result={bulkCrawlResult}
        onClearResult={() => dispatch(clearBulkCrawlResult())}
        error={bulkCrawlStatus === "failed" ? error : null}
      />

      <AgentcisJobsTable
        jobs={jobs}
        jobsLoading={jobsStatus === "loading"}
        onRefresh={() => dispatch(fetchAgentcisJobs())}
        onRetry={handleRetry}
        onDelete={handleDelete}
        onViewError={setErrorJob}
      />

      <AgentcisJobErrorDialog job={errorJob} onOpenChange={(open) => !open && setErrorJob(null)} />
    </div>
  );
}
