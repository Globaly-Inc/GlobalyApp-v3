"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  Globe,
  Loader2,
  Pause,
  Play,
  Trash2,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ACTIVE_STATUSES, PAUSABLE_STATUSES, PIPELINE_STAGES, PUBLISHABLE_STATUSES } from "../const";
import { ExtractionStatusBadge, NeedsAttentionBadge } from "./status-badge";
import type { ExtractionJob, PipelineProgress } from "../apis/types";

export function ExtractionJobRow({
  job,
  selected,
  onToggleSelect,
  onPause,
  onResume,
  onDecline,
  onDelete,
  onPublish,
  publishing = false,
}: Readonly<{
  job: ExtractionJob;
  selected: boolean;
  onToggleSelect: () => void;
  onPause: () => void;
  onResume: () => void;
  onDecline: () => void;
  onDelete: () => void;
  /** Omitted in modes where publishing isn't offered. */
  onPublish?: () => void;
  publishing?: boolean;
}>) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const isPublishable = PUBLISHABLE_STATUSES.includes(job.status);
  const isPausable = PAUSABLE_STATUSES.includes(job.status);
  const isResumable = job.status === "paused" || job.status === "stalled";
  const isActive = ACTIVE_STATUSES.includes(job.status);

  const progress = (job.pipeline_progress ?? null) as PipelineProgress | null;
  const hasPipeline = Boolean(progress && Object.keys(progress).length > 0);
  const verificationPct = job.verification_total
    ? Math.round((job.verification_score / job.verification_total) * 100)
    : 0;

  return (
    <Card
      className={cn(
        "flex flex-col gap-0 p-5 transition-shadow hover:shadow-md",
        selected && "ring-2 ring-primary"
      )}
    >
      <div className="flex flex-row items-start justify-between gap-4">
        <div className="flex flex-1 items-start gap-3 min-w-0">
          {isPublishable && (
            <div className="pt-1">
              <Checkbox checked={selected} onCheckedChange={onToggleSelect} />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              {/* ponytail: <p>, not a heading — globals.css puts h1-h4 in the Fraunces serif */}
              <p className="font-semibold text-foreground truncate">{job.institution_name || job.institution_url}</p>
              <ExtractionStatusBadge status={job.status} />
              <NeedsAttentionBadge job={job} />
            </div>
            <div className="flex flex-wrap items-center gap-4 mt-1.5 text-sm text-muted-foreground">
              <span className="flex items-center gap-1 truncate">
                <Globe className="h-3.5 w-3.5 flex-shrink-0" />
                {job.institution_url}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {new Date(job.created_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
              </span>
              {job.courses_extracted > 0 && <span>{job.courses_extracted} courses</span>}
              {Boolean(job.agent_count) && <span>{job.agent_count} agents</span>}
              {Boolean(job.campus_count) && <span>{job.campus_count} branches</span>}
              {isActive && (
                <span className="flex items-center gap-1 text-xs text-amber-600 animate-pulse">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Processing
                </span>
              )}
            </div>

            {job.verification_total > 0 && (
              <div className="flex items-center gap-3 mt-3">
                <Progress value={verificationPct} className="h-1.5 max-w-xs flex-1" />
                <span className="text-xs text-muted-foreground">
                  {job.verification_score}/{job.verification_total} verified
                </span>
              </div>
            )}

            {hasPipeline && (
              <Button
                variant="ghost"
                className="mt-2 h-7 gap-1 px-2 text-xs text-muted-foreground cursor-pointer"
                onClick={() => setExpanded((s) => !s)}
              >
                {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                Pipeline Progress
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <Button
            variant="outline"
            className="gap-1.5 px-3 cursor-pointer"
            onClick={() => router.push(`/admin/data/all-extractions/${job.id}`)}
          >
            <Eye className="h-3.5 w-3.5" />
            View
          </Button>

          {isPausable && (
            <Button variant="outline" className="gap-1.5 px-3 text-orange-600 cursor-pointer" onClick={onPause}>
              <Pause className="h-3.5 w-3.5" />
              Pause
            </Button>
          )}

          {isResumable && (
            <Button variant="outline" className="gap-1.5 px-3 text-emerald-600 cursor-pointer" onClick={onResume}>
              <Play className="h-3.5 w-3.5" />
              {job.status === "stalled" ? "Recover" : "Resume"}
            </Button>
          )}

          {isPublishable && (
            <Button
              variant="outline"
              className="gap-1.5 px-3 text-destructive border-destructive/30 cursor-pointer"
              onClick={onDecline}
            >
              <XCircle className="h-3.5 w-3.5" />
              Decline
            </Button>
          )}

          {isPublishable && onPublish && (
            <Button className="gap-1.5 px-3 cursor-pointer" disabled={publishing} onClick={onPublish}>
              {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
              Publish
            </Button>
          )}

          <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
            <Button
              variant="ghost"
              size="icon-sm"
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

      {expanded && progress && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          {PIPELINE_STAGES.map(({ key, label, icon: Icon }) => {
            const stage = progress[key];
            if (!stage) return null;
            const pct = stage.total ? Math.round(((stage.done || 0) / stage.total) * 100) : stage.status === "done" ? 100 : 0;
            const isDone = stage.status === "done";
            const isRunning = stage.status === "processing";

            return (
              <div key={key} className="flex items-center gap-3">
                <div className="flex w-32 shrink-0 items-center gap-1.5 text-xs">
                  {isDone ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  ) : isRunning ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  ) : (
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className={cn(isDone && "text-emerald-700", isRunning ? "text-foreground font-medium" : !isDone && "text-muted-foreground")}>
                    {label}
                  </span>
                </div>
                <Progress value={pct} className="h-1.5 flex-1" />
                <span className="w-16 text-right text-xs text-muted-foreground">
                  {stage.total ? `${stage.done || 0}/${stage.total}` : isDone ? "Done" : "—"}
                </span>
              </div>
            );
          })}
          {(job.pages_scraped > 0 || job.pages_failed > 0) && (
            <div className="flex items-center gap-3 pt-1 text-xs text-muted-foreground">
              <span>{job.pages_scraped} scraped</span>
              {job.pages_failed > 0 && <span className="text-destructive">{job.pages_failed} failed</span>}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
