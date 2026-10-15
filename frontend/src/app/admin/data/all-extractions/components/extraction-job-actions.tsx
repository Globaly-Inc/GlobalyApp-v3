"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Eye,
  FileText,
  Loader2,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  RotateCw,
  Trash2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { PAUSABLE_STATUSES, PUBLISHABLE_STATUSES } from "../const";
import { useRerunJob } from "./rerun-extraction-button";
import type { ExtractionJob } from "../apis/types";

export type ExtractionJobActionProps = Readonly<{
  job: ExtractionJob;
  onPause: () => void;
  onResume: () => void;
  onDecline: () => void;
  onDelete: () => void;
  onReload: () => void;
  /** Omitted in modes where publishing isn't offered. */
  onPublish?: () => void;
  publishing?: boolean;
}>;

/** Last cell of a job row: publish, pipeline toggle, and the "…" menu (plus the dialogs it opens). */
export function ExtractionJobActions({
  job,
  onPause,
  onResume,
  onDecline,
  onDelete,
  onReload,
  onPublish,
  publishing = false,
  hasPipeline,
  expanded,
  onToggleExpanded,
}: ExtractionJobActionProps & Readonly<{ hasPipeline: boolean; expanded: boolean; onToggleExpanded: () => void }>) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { rerun, running: rerunning, dialog: rerunDialog } = useRerunJob(job.id, onReload);

  const isPublishable = PUBLISHABLE_STATUSES.includes(job.status);
  const isPausable = PAUSABLE_STATUSES.includes(job.status);
  const isResumable = job.status === "paused" || job.status === "stalled";
  const name = job.institution_name || job.institution_url;
  const publishLabel = job.status === "exported" ? "Re-publish / Repair" : "Publish to Business";
  const detailHref = `/admin/data/all-extractions/${job.id}`;

  return (
    <div className="flex items-center justify-end gap-1.5">
      {isPublishable && onPublish && (
        <Button size="sm" variant="outline" className="gap-1.5" disabled={publishing} onClick={onPublish} aria-label={publishLabel}>
          {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{job.status === "exported" ? "Re-publish" : "Publish"}</span>
        </Button>
      )}

      {hasPipeline && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={expanded ? "Hide pipeline progress" : "Show pipeline progress — track the status of each step"}
          aria-expanded={expanded}
          title="Pipeline Progress · Track the status of each step"
          onClick={onToggleExpanded}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`More actions for ${name}`}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => router.push(detailHref)}>
            <Eye className="h-3.5 w-3.5" /> View Details
          </DropdownMenuItem>
          <DropdownMenuItem onClick={rerun} disabled={rerunning} className="text-chart-4">
            <RotateCw className="h-3.5 w-3.5" /> Re-run Job
          </DropdownMenuItem>
          {isPausable && (
            <DropdownMenuItem onClick={onPause} className="text-warning">
              <Pause className="h-3.5 w-3.5" /> Pause
            </DropdownMenuItem>
          )}
          {isResumable && (
            <DropdownMenuItem onClick={onResume} className="text-success">
              <Play className="h-3.5 w-3.5" /> {job.status === "stalled" ? "Recover" : "Resume"}
            </DropdownMenuItem>
          )}
          {isPublishable && job.status !== "exported" && (
            <DropdownMenuItem onClick={onDecline} className="text-destructive">
              <XCircle className="h-3.5 w-3.5" /> Decline
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => router.push(`${detailHref}?tab=overview`)}>
            <FileText className="h-3.5 w-3.5" /> View Logs
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push(`${detailHref}?tab=overview`)}>
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
              This will permanently delete all extracted data for <strong>{name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
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
  );
}
