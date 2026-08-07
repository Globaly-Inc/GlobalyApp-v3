import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_CONFIG, FINISHED_STATUSES } from "../const";
import type { ExtractionJob } from "../apis/types";

export function ExtractionStatusBadge({ status }: Readonly<{ status: ExtractionJob["status"] }>) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", cfg.className)}>
      <cfg.icon className={cn("h-3 w-3", cfg.spin && "animate-spin")} />
      {cfg.label}
    </span>
  );
}

/** Derived, not a real status — finished job with zero agents and zero courses. */
export function NeedsAttentionBadge({ job }: Readonly<{ job: ExtractionJob }>) {
  const agentsKnown = job.agent_count !== undefined;
  const isEmpty = FINISHED_STATUSES.includes(job.status) && agentsKnown && job.agent_count === 0 && job.courses_extracted === 0;
  if (!isEmpty) return null;

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-orange-300 text-orange-700 bg-orange-50">
      <AlertCircle className="h-3 w-3" />
      Needs attention — no data
    </span>
  );
}
