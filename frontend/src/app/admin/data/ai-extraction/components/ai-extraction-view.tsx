"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Eye,
  Pause,
  Play,
  XCircle,
  Trash2,
  Globe,
  Calendar,
  Loader2,
  CheckCircle2,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
  fetchAiExtractionJobs,
  pauseAiJob,
  resumeAiJob,
  deleteAiJob,
  declineAiJob,
} from "../store/ai-extraction-slice";
import { ACTIVE_STATUSES, PAUSABLE_STATUSES, PIPELINE_STAGES, STATUS_CONFIG } from "../const";
import type { AiExtractionJob, PipelineProgress } from "../apis/types";
import { ExtractionStatusBadge } from "../../all-extractions/components/status-badge";
import { cn } from "@/lib/utils";

export function AiExtractionView() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { jobs, status } = useAppSelector((state) => state.dataAiExtraction);
  const [searchQuery, setSearchQuery] = useState("");
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchAiExtractionJobs());
  }, [dispatch]);

  // ponytail: poll every 8s when active jobs exist, same as V2 reference
  useEffect(() => {
    const hasActive = jobs.some((j) => ACTIVE_STATUSES.includes(j.status));
    if (!hasActive) return;
    const interval = setInterval(() => dispatch(fetchAiExtractionJobs()), 8000);
    return () => clearInterval(interval);
  }, [jobs, dispatch]);

  const visibleJobs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter(
      (j) =>
        (j.institution_name || "").toLowerCase().includes(q) ||
        j.institution_url.toLowerCase().includes(q),
    );
  }, [jobs, searchQuery]);

  const runAction = async (
    thunk: ReturnType<typeof pauseAiJob> | ReturnType<typeof resumeAiJob> | ReturnType<typeof deleteAiJob> | ReturnType<typeof declineAiJob>,
    successMessage: string,
  ) => {
    const result = await dispatch(thunk);
    if ("error" in result && result.error) {
      toast.error("Action failed", { description: (result.error as { message?: string }).message ?? "Please try again." });
      return;
    }
    toast.success(successMessage);
  };

  const isLoading = status === "loading" && jobs.length === 0;

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">AI Extraction</h1>
        <p className="text-muted-foreground mt-1">
          Ongoing AI extractions — crawl, extract, and stage for review.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <p className="font-semibold text-foreground">In-Progress Jobs</p>
          <p className="text-sm text-muted-foreground">
            {visibleJobs.length} job{visibleJobs.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by name or URL..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 w-56 pl-8 text-xs"
            />
          </div>

          <Button
            size="lg"
            className="h-10 gap-1.5 px-4 cursor-pointer"
            onClick={() => router.push("/admin/data/all-extractions")}
          >
            <Plus className="h-4 w-4" />
            New Extraction
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {!isLoading && visibleJobs.length === 0 && (
        <Card className="border-dashed">
          <div className="py-16 flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-accent flex items-center justify-center">
              <Building2 className="w-7 h-7 text-primary" />
            </div>
            <p className="text-muted-foreground text-sm">
              {searchQuery ? "No jobs match your search." : "No AI extractions in progress."}
            </p>
            {!searchQuery && (
              <Button className="gap-1.5 cursor-pointer" onClick={() => router.push("/admin/data/all-extractions")}>
                <Plus className="h-4 w-4" />
                Start an Extraction
              </Button>
            )}
          </div>
        </Card>
      )}

      <div className="space-y-3">
        {visibleJobs.map((job) => (
          <AiJobCard
            key={job.id}
            job={job}
            onView={() => router.push(`/admin/data/all-extractions/${job.id}`)}
            onPause={() => runAction(pauseAiJob(job.id), "Paused")}
            onResume={() => runAction(resumeAiJob(job.id), "Resumed")}
            onDecline={() => runAction(declineAiJob(job.id), "Extraction declined")}
            onDelete={() => runAction(deleteAiJob(job.id), "Deleted")}
          />
        ))}
      </div>
    </div>
  );
}

// ── Job card with pipeline progress ──────────────────────────────

function AiJobCard({
  job,
  onView,
  onPause,
  onResume,
  onDecline,
  onDelete,
}: Readonly<{
  job: AiExtractionJob;
  onView: () => void;
  onPause: () => void;
  onResume: () => void;
  onDecline: () => void;
  onDelete: () => void;
}>) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isPausable = PAUSABLE_STATUSES.includes(job.status);
  const isResumable = job.status === "paused" || job.status === "stalled";
  const isDeclinable = job.status === "review";

  return (
    <Card className="p-4">
      <div className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-foreground truncate">
              {job.institution_name || job.institution_url}
            </p>
            <ExtractionStatusBadge status={job.status} />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1 truncate">
              <Globe className="h-3 w-3 flex-shrink-0" />
              {job.institution_url}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {new Date(job.created_at).toLocaleDateString(undefined, {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
            {job.courses_extracted > 0 && <span>{job.courses_extracted} courses</span>}
            {job.pages_scraped > 0 && <span>{job.pages_scraped} pages scraped</span>}
            {job.pages_failed > 0 && (
              <span className="text-destructive">{job.pages_failed} failed</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <Button variant="outline" className="gap-1.5 cursor-pointer" onClick={onView}>
            <Eye className="h-3.5 w-3.5" />
            View
          </Button>

          {isPausable && (
            <Button variant="outline" className="gap-1.5 text-orange-600 cursor-pointer" onClick={onPause}>
              <Pause className="h-3.5 w-3.5" />
              Pause
            </Button>
          )}

          {isResumable && (
            <Button variant="outline" className="gap-1.5 text-emerald-600 cursor-pointer" onClick={onResume}>
              <Play className="h-3.5 w-3.5" />
              {job.status === "stalled" ? "Recover" : "Resume"}
            </Button>
          )}

          {isDeclinable && (
            <Button
              variant="outline"
              className="gap-1.5 text-destructive border-destructive/30 cursor-pointer"
              onClick={onDecline}
            >
              <XCircle className="h-3.5 w-3.5" />
              Decline
            </Button>
          )}

          <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive cursor-pointer"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete extraction?</DialogTitle>
                <DialogDescription>
                  This will permanently delete all extracted data for{" "}
                  <strong>{job.institution_name || job.institution_url}</strong>.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" className="cursor-pointer" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="cursor-pointer"
                  onClick={() => {
                    setConfirmDelete(false);
                    onDelete();
                  }}
                >
                  Delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <PipelineProgressView
        progress={job.pipeline_progress ?? null}
        pagesScraped={job.pages_scraped}
        pagesFailed={job.pages_failed}
      />
    </Card>
  );
}

// ── Pipeline progress bar section ────────────────────────────────

function PipelineProgressView({
  progress,
  pagesScraped,
  pagesFailed,
}: Readonly<{
  progress: PipelineProgress | null;
  pagesScraped: number;
  pagesFailed: number;
}>) {
  if (!progress || Object.keys(progress).length === 0) return null;

  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      {PIPELINE_STAGES.map(({ key, label, icon: Icon }) => {
        const stage = progress[key];
        if (!stage) return null;
        const pct =
          stage.total && stage.total > 0
            ? Math.round(((stage.done || 0) / stage.total) * 100)
            : stage.status === "done"
              ? 100
              : 0;
        const isDone = stage.status === "done";
        const isActive = stage.status === "processing";

        return (
          <div key={key} className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 w-32 shrink-0 text-xs">
              {isDone ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              ) : isActive ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              ) : (
                <Icon className="w-3.5 h-3.5 text-muted-foreground" />
              )}
              <span
                className={cn(
                  isDone
                    ? "text-emerald-700"
                    : isActive
                      ? "text-foreground font-medium"
                      : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </div>
            <div className="flex-1">
              <Progress value={pct} className="h-1.5" />
            </div>
            <span className="text-xs text-muted-foreground w-16 text-right">
              {stage.total ? `${stage.done || 0}/${stage.total}` : isDone ? "Done" : "\u2014"}
            </span>
          </div>
        );
      })}
      {(pagesScraped > 0 || pagesFailed > 0) && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
          <span>{pagesScraped} scraped</span>
          {pagesFailed > 0 && <span className="text-destructive">{pagesFailed} failed</span>}
        </div>
      )}
    </div>
  );
}
