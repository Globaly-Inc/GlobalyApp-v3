"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  BookOpen,
  Building2,
  Calendar,
  ChevronDown,
  ChevronUp,
  Eye,
  FileText,
  Globe,
  Landmark,
  Loader2,
  MoreVertical,
  Pause,
  Pencil,
  Play,
  RotateCw,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ACTIVE_STATUSES, FINISHED_STATUSES, PAUSABLE_STATUSES, PIPELINE_STAGES, PUBLISHABLE_STATUSES, STATUS_CONFIG } from "../const";
import { ExtractionStatusBadge, NeedsAttentionBadge } from "./status-badge";
import { useRerunJob } from "./rerun-extraction-button";
import { PipelineProgressPanel } from "./pipeline-progress-panel";
import type { ExtractionJob, PipelineProgress } from "../apis/types";

function StatPill({ icon: Icon, children }: Readonly<{ icon: React.ElementType; children: React.ReactNode }>) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      <Icon className="h-3 w-3" />
      {children}
    </span>
  );
}

// Weighted mean of pipeline stage completion — a "processing" stage counts its own
// done/total ratio (or half-credit with no counts yet) so the bar isn't stuck between steps.
function overallProgressPct(job: ExtractionJob, progress: PipelineProgress | null) {
  if (job.status === "failed" || job.status === "declined") return 0;
  // A finished/published job is 100% done regardless of how many discovered pages
  // actually got scraped — not every discovered URL needs scraping to complete.
  if (FINISHED_STATUSES.includes(job.status) || job.status === "review") return 100;
  if (progress) {
    const known = PIPELINE_STAGES.map((s) => progress[s.key]).filter(Boolean);
    if (known.length > 0) {
      const sum = known.reduce((acc, stage) => {
        if (stage!.status === "done") return acc + 1;
        // Clamp to 1 — a stage's own done/total can exceed 1 mid-run (e.g. discovery
        // finds more pages than the initial estimate), but it's still just "in progress".
        if (stage!.status === "processing") return acc + Math.min(1, stage!.total ? (stage!.done || 0) / stage!.total : 0.5);
        return acc;
      }, 0);
      return Math.min(100, Math.round((sum / PIPELINE_STAGES.length) * 100));
    }
  }
  // total_pages_found is an early site-mapping estimate; pages_scraped can legitimately
  // grow past it as pagination discovers more pages during the actual crawl.
  if (job.total_pages_found) return Math.min(100, Math.round((job.pages_scraped / job.total_pages_found) * 100));
  if (job.verification_total) return Math.min(100, Math.round((job.verification_score / job.verification_total) * 100));
  return 0;
}

export function ExtractionJobRow({
  job,
  selected,
  onToggleSelect,
  onPause,
  onResume,
  onDecline,
  onDelete,
  onPublish,
  onReload,
  publishing = false,
}: Readonly<{
  job: ExtractionJob;
  selected: boolean;
  onToggleSelect: () => void;
  onPause: () => void;
  onResume: () => void;
  onDecline: () => void;
  onDelete: () => void;
  onReload: () => void;
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
  const { rerun, running: rerunning, dialog: rerunDialog } = useRerunJob(job.id, onReload);

  const progress = (job.pipeline_progress ?? null) as PipelineProgress | null;
  const hasPipeline = Boolean(progress && Object.keys(progress).length > 0);
  const status = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.pending;
  const progressPct = overallProgressPct(job, progress);

  return (
    <Card
      className={cn(
        "flex flex-col gap-0 border-l-4 p-5 transition-shadow hover:shadow-md",
        status.accent,
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
          <div className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-full", status.className)}>
            <Landmark className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              {/* ponytail: <p>, not a heading — globals.css puts h1-h4 in the Fraunces serif */}
              <p className="font-semibold text-foreground truncate">{job.institution_name || job.institution_url}</p>
              <ExtractionStatusBadge status={job.status} />
              <NeedsAttentionBadge job={job} />
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-1.5 text-sm text-muted-foreground">
              <span className="flex items-center gap-1 truncate">
                <Globe className="h-3.5 w-3.5 shrink-0" />
                {job.institution_url}
              </span>
              <span className="flex items-center gap-1 shrink-0">
                <Calendar className="h-3.5 w-3.5" />
                {new Date(job.created_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
              </span>
            </div>

            {(job.courses_extracted > 0 || Boolean(job.agent_count) || Boolean(job.campus_count)) && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {job.courses_extracted > 0 && <StatPill icon={BookOpen}>{job.courses_extracted} courses</StatPill>}
                {Boolean(job.agent_count) && <StatPill icon={Users}>{job.agent_count} agents</StatPill>}
                {Boolean(job.campus_count) && <StatPill icon={Building2}>{job.campus_count} branches</StatPill>}
              </div>
            )}

            {hasPipeline && (
              <Button
                variant="outline"
                className="mt-3 h-7 gap-1.5 px-2.5 text-xs text-muted-foreground cursor-pointer"
                onClick={() => setExpanded((s) => !s)}
              >
                {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                Pipeline Progress
                <span className="text-muted-foreground/70">· Track the status of each step</span>
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-start gap-4 shrink-0">
          <div className="w-32 pt-1">
            <span className="text-xs text-muted-foreground">Progress</span>
            <div className={cn("text-lg font-bold leading-tight", job.status === "failed" ? "text-red-600" : isActive ? "text-purple-600" : "text-foreground")}>
              {progressPct}%
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", job.status === "failed" ? "bg-red-500" : isActive ? "bg-purple-500" : "bg-emerald-500")}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Button
              variant="outline"
              className="gap-1.5 px-3 cursor-pointer"
              onClick={() => router.push(`/admin/data/all-extractions/${job.id}`)}
            >
              <Eye className="h-3.5 w-3.5" />
              View
            </Button>

            {isPublishable && onPublish && (
              <Button className="gap-1.5 px-3 cursor-pointer" disabled={publishing} onClick={onPublish}>
                {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                Publish
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger className="flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground">
                <MoreVertical className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => router.push(`/admin/data/all-extractions/${job.id}`)}>
                  <Eye className="h-3.5 w-3.5" /> View Details
                </DropdownMenuItem>
                {job.status === "failed" && (
                  <DropdownMenuItem onClick={rerun} disabled={rerunning} className="text-purple-600">
                    <RotateCw className="h-3.5 w-3.5" /> Re-run Job
                  </DropdownMenuItem>
                )}
                {isPausable && (
                  <DropdownMenuItem onClick={onPause} className="text-orange-600">
                    <Pause className="h-3.5 w-3.5" /> Pause
                  </DropdownMenuItem>
                )}
                {isResumable && (
                  <DropdownMenuItem onClick={onResume} className="text-emerald-600">
                    <Play className="h-3.5 w-3.5" /> {job.status === "stalled" ? "Recover" : "Resume"}
                  </DropdownMenuItem>
                )}
                {isPublishable && (
                  <DropdownMenuItem onClick={onDecline} className="text-destructive">
                    <XCircle className="h-3.5 w-3.5" /> Decline
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => router.push(`/admin/data/all-extractions/${job.id}?tab=overview`)}>
                  <FileText className="h-3.5 w-3.5" /> View Logs
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push(`/admin/data/all-extractions/${job.id}?tab=overview`)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setConfirmDelete(true)} className="text-destructive">
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
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
            {rerunDialog}
          </div>
        </div>
      </div>

      {expanded && progress && <PipelineProgressPanel job={job} progress={progress} />}
    </Card>
  );
}
