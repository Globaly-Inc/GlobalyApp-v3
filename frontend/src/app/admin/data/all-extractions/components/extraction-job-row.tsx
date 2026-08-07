"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Pause, Play, XCircle, Trash2, Globe, Calendar } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PAUSABLE_STATUSES, PUBLISHABLE_STATUSES } from "../const";
import { ExtractionStatusBadge, NeedsAttentionBadge } from "./status-badge";
import type { ExtractionJob } from "../apis/types";

export function ExtractionJobRow({
  job,
  selected,
  onToggleSelect,
  onPause,
  onResume,
  onDecline,
  onDelete,
}: Readonly<{
  job: ExtractionJob;
  selected: boolean;
  onToggleSelect: () => void;
  onPause: () => void;
  onResume: () => void;
  onDecline: () => void;
  onDelete: () => void;
}>) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isPublishable = PUBLISHABLE_STATUSES.includes(job.status);
  const isPausable = PAUSABLE_STATUSES.includes(job.status);
  const isResumable = job.status === "paused" || job.status === "stalled";

  return (
    <Card className="flex flex-row items-start justify-between gap-3 p-4">
      <div className="flex items-start gap-3 min-w-0">
        {isPublishable && (
          <div className="pt-1">
            <Checkbox checked={selected} onCheckedChange={onToggleSelect} />
          </div>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-foreground truncate">{job.institution_name || job.institution_url}</p>
            <ExtractionStatusBadge status={job.status} />
            <NeedsAttentionBadge job={job} />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1 truncate">
              <Globe className="h-3 w-3 flex-shrink-0" />
              {job.institution_url}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {new Date(job.created_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
            </span>
            <span>{job.courses_extracted} courses</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
        <Button
          variant="outline"
          className="gap-1.5 cursor-pointer"
          onClick={() => router.push(`/admin/data/all-extractions/${job.id}`)}
        >
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

        {isPublishable && (
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
    </Card>
  );
}
