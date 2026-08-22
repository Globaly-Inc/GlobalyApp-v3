"use client";

import { RefreshCw, Trash2, ExternalLink, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { STATUS_BADGE } from "../const";
import { relativeTime, progressText, progressCounters, firstErrorLine } from "../utils";
import type { AgentcisJob } from "../apis/types";

export function AgentcisJobRow({
  job,
  onRetry,
  onDelete,
  onViewError,
}: Readonly<{
  job: AgentcisJob;
  onRetry: (job: AgentcisJob) => void;
  onDelete: (job: AgentcisJob) => void;
  onViewError: (job: AgentcisJob) => void;
}>) {
  const badge = STATUS_BADGE[job.status] ?? { variant: "secondary" as const, label: job.status };
  const counters = progressCounters(job);
  const errorLine = job.status === "failed" ? firstErrorLine(job) : null;

  return (
    <tr className="border-t hover:bg-muted/30 transition-colors">
      <td className="p-3">
        <div className="font-medium text-foreground">{job.institution_name ?? "—"}</div>
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
        <div>{progressText(job)}</div>
        {counters && <div className="text-xs text-muted-foreground/80 mt-0.5">{counters}</div>}
        {errorLine && (
          <button
            type="button"
            onClick={() => onViewError(job)}
            className="mt-0.5 flex items-center gap-1 text-xs text-destructive hover:underline truncate max-w-xs cursor-pointer"
          >
            <AlertCircle className="h-3 w-3 shrink-0" />
            <span className="truncate">{errorLine}</span>
          </button>
        )}
      </td>
      <td className="p-3 text-xs text-muted-foreground">{relativeTime(job.updated_at)}</td>
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
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onRetry(job)} title="Retry">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          )}
          {(job.status === "failed" || job.status === "done") && (
            <Button
              variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => onDelete(job)} title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
