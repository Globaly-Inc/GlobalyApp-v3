"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Search, Upload, Loader2, X, CheckCircle2, RefreshCw, Trash2, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { MAX_SELECTION } from "../const";
import {
  searchAgentCIS,
  importAgentCIS,
  fetchAgentcisJobs,
  deleteAgentcisJob,
  toggleSelection,
  clearSelection,
  clearImportResult,
} from "../store/agentcis-import-slice";
import type { AgentcisJob } from "../apis/types";

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (Math.abs(minutes) < 60) return rtf.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(-hours, "hour");
  const days = Math.round(hours / 24);
  return rtf.format(-days, "day");
}

const STATUS_BADGE: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  pending: { variant: "secondary", label: "Pending" },
  processing: { variant: "outline", label: "Processing" },
  done: { variant: "default", label: "Done" },
  failed: { variant: "destructive", label: "Failed" },
};

function progressText(job: AgentcisJob): string {
  const pp = job.pipeline_progress;
  if (!pp) return "—";
  const phase = String(pp.phase ?? "");
  const current = Number(pp.current ?? 0);
  const total = Number(pp.total ?? 0);
  if (phase === "done") return `${job.courses_extracted} courses extracted`;
  if (total > 0) return `${phase} ${current}/${total}`;
  return phase || "—";
}

export function AgentcisImportView() {
  const dispatch = useAppDispatch();
  const {
    searchResults, selectedIds, searchStatus, importStatus, importResult, error,
    jobs, jobsStatus,
  } = useAppSelector((state) => state.dataAgentcisImport);

  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialFetchRef = useRef(false);

  // Fetch default results + jobs on mount
  useEffect(() => {
    if (initialFetchRef.current) return;
    initialFetchRef.current = true;
    dispatch(searchAgentCIS(""));
    dispatch(fetchAgentcisJobs());
  }, [dispatch]);

  // Poll jobs every 5s
  useEffect(() => {
    const id = setInterval(() => dispatch(fetchAgentcisJobs()), 5000);
    return () => clearInterval(id);
  }, [dispatch]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      dispatch(searchAgentCIS(query));
    }, 350);
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
      // Refresh jobs after import to show newly queued ones
      setTimeout(() => dispatch(fetchAgentcisJobs()), 1500);
    });
  }, [dispatch, selectedIds]);

  const handleToggle = (id: string | number) => {
    const sid = String(id);
    if (!selectedIds.includes(sid) && selectedIds.length >= MAX_SELECTION) {
      toast.error(`Maximum ${MAX_SELECTION} institutions per import.`);
      return;
    }
    dispatch(toggleSelection(sid));
  };

  const handleRetry = useCallback((job: AgentcisJob) => {
    // Re-import the same institution by name — we don't have the original AgentCIS id on the job
    // but we can search for it. For now, delete the failed job and let the user search + re-import.
    dispatch(deleteAgentcisJob(job.id));
    toast.info(`Deleted failed job "${job.institution_name}". Search and re-import to retry.`);
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

      {/* Search + Import */}
      <Card>
        <CardContent className="p-6 space-y-5">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search institutions by name..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
            {searchStatus === "loading" && (
              <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>

          {/* Selection summary */}
          {selectedIds.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {selectedIds.length}/{MAX_SELECTION} selected
              </span>
              <Button variant="ghost" size="sm" onClick={() => dispatch(clearSelection())}>
                Clear all
              </Button>
            </div>
          )}

          {/* Results table */}
          {searchResults.length === 0 && searchStatus !== "loading" ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {query ? "No institutions found." : "Start typing to search AgentCIS..."}
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs">
                  <tr>
                    <th className="w-10 p-3" />
                    <th className="text-left p-3 font-medium">Name</th>
                    <th className="text-left p-3 font-medium">Country</th>
                    <th className="text-left p-3 font-medium">City</th>
                  </tr>
                </thead>
                <tbody>
                  {searchResults.map((r) => {
                    const sid = String(r.id);
                    return (
                      <tr
                        key={sid}
                        className="border-t hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => handleToggle(r.id)}
                      >
                        <td className="p-3 text-center">
                          <Checkbox checked={selectedIds.includes(sid)} onCheckedChange={() => handleToggle(r.id)} />
                        </td>
                        <td className="p-3 font-medium text-foreground">{r.name}</td>
                        <td className="p-3 text-muted-foreground">{r.country ?? "—"}</td>
                        <td className="p-3 text-muted-foreground">{r.city ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Import button */}
          <div className="flex items-center gap-3">
            <Button
              onClick={handleImport}
              disabled={importStatus === "loading" || selectedIds.length === 0}
              className="gap-2"
            >
              {importStatus === "loading" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {importStatus === "loading"
                ? "Importing..."
                : `Import Selected${selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}`}
            </Button>

            {error && <span className="text-sm text-destructive">{error}</span>}
          </div>

          {/* Import result */}
          {importResult && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>
                Import dispatched — {importResult.job_count} job{importResult.job_count === 1 ? "" : "s"} queued.
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-6 w-6 p-0"
                onClick={() => dispatch(clearImportResult())}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ongoing Imports */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-foreground">Ongoing Imports</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {jobs.length} job{jobs.length === 1 ? "" : "s"} · auto-refreshes every 5s
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => dispatch(fetchAgentcisJobs())}
              disabled={jobsStatus === "loading"}
              className="gap-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${jobsStatus === "loading" ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {jobs.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No imports found. Search and import institutions above.
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs">
                  <tr>
                    <th className="text-left p-3 font-medium">Institution</th>
                    <th className="text-left p-3 font-medium w-28">Status</th>
                    <th className="text-left p-3 font-medium">Progress</th>
                    <th className="text-left p-3 font-medium w-32">Updated</th>
                    <th className="text-right p-3 font-medium w-20">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => {
                    const badge = STATUS_BADGE[job.status] ?? { variant: "secondary" as const, label: job.status };
                    return (
                      <tr key={job.id} className="border-t hover:bg-muted/30 transition-colors">
                        <td className="p-3">
                          <div className="font-medium text-foreground">
                            {job.institution_name ?? "—"}
                          </div>
                          {job.institution_url && (
                            <div className="text-xs text-muted-foreground truncate max-w-xs">
                              {job.institution_url.replace(/^https?:\/\//, "").substring(0, 40)}
                            </div>
                          )}
                        </td>
                        <td className="p-3">
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {progressText(job)}
                          {job.status === "failed" && job.pipeline_progress?.error != null && (
                            <div className="text-xs text-destructive mt-0.5 truncate max-w-xs">
                              {String(job.pipeline_progress.error).split("\n")[0]}
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {relativeTime(job.updated_at)}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {job.status === "done" && (
                              <a
                                href={`/admin/data/all-extractions?job=${job.id}`}
                                className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                                title="Review"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                            {job.status === "failed" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleRetry(job)}
                                title="Retry"
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {(job.status === "failed" || job.status === "done") && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => handleDelete(job)}
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
