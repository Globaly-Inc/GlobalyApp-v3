"use client";

import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { AgentcisJob } from "../apis/types";

/** Full pipeline_progress JSON for a failed job — V1 had this as a dedicated debug
 * dialog; V3 previously only showed a truncated first line inline in the table. */
export function AgentcisJobErrorDialog({
  job,
  onOpenChange,
}: Readonly<{ job: AgentcisJob | null; onOpenChange: (open: boolean) => void }>) {
  return (
    <Dialog open={job != null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import failed{job ? `: ${job.institution_name ?? job.id}` : ""}</DialogTitle>
          <DialogDescription>Full pipeline progress recorded at the time of failure.</DialogDescription>
        </DialogHeader>
        <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">
          {job ? JSON.stringify(job.pipeline_progress, null, 2) : ""}
        </pre>
      </DialogContent>
    </Dialog>
  );
}
