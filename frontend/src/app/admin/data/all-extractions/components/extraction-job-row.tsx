"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { FileSpreadsheet, Landmark } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ACTIVE_STATUSES, FINISHED_STATUSES, PIPELINE_STAGES, PUBLISHABLE_STATUSES, STATUS_CONFIG } from "../const";
import { ExtractionStatusBadge, NeedsAttentionBadge } from "./status-badge";
import { RowActors } from "./row-actors";
import { PipelineProgressPanel } from "./pipeline-progress-panel";
import { ExtractionJobActions, type ExtractionJobActionProps } from "./extraction-job-actions";
import type { ExtractionJob, PipelineProgress } from "../apis/types";

/** Column headers for the rows below — kept beside the row so the two can't drift apart. */
export const EXTRACTION_JOB_COLUMNS = [
  { label: "Select", className: "w-px", srOnly: true },
  { label: "Institution" },
  { label: "Status" },
  { label: "Progress", className: "hidden md:table-cell" },
  { label: "Courses", className: "hidden lg:table-cell", numeric: true },
  { label: "Agents", className: "hidden lg:table-cell", numeric: true },
  { label: "Branches", className: "hidden lg:table-cell", numeric: true },
  { label: "Created", className: "hidden md:table-cell" },
  { label: "Actions", className: "w-px", srOnly: true },
] as const;

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

function ProgressCell({ job, pct }: Readonly<{ job: ExtractionJob; pct: number }>) {
  const isFailed = job.status === "failed";
  const isActive = ACTIVE_STATUSES.includes(job.status);
  return (
    <div className="w-28">
      <div className={cn("text-sm font-semibold", isFailed ? "text-destructive" : isActive ? "text-purple-600" : "text-foreground")}>
        {pct}%
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", isFailed ? "bg-destructive" : isActive ? "bg-purple-500" : "bg-success")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

const count = (n: number | undefined | null) => (n ? n : "—");

export function ExtractionJobRow({
  selected,
  onToggleSelect,
  ...actionProps
}: ExtractionJobActionProps & Readonly<{ selected: boolean; onToggleSelect: () => void }>) {
  const { job } = actionProps;
  const [expanded, setExpanded] = useState(false);

  const isPublishable = PUBLISHABLE_STATUSES.includes(job.status);
  const progress = (job.pipeline_progress ?? null) as PipelineProgress | null;
  const hasPipeline = Boolean(progress && Object.keys(progress).length > 0);
  const status = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.pending;
  const name = job.institution_name || job.institution_url;
  const pct = overallProgressPct(job, progress);
  const counts = [
    [job.courses_extracted, "course"],
    [job.agent_count, "agent"],
    [job.campus_count, "branch"],
  ] as const;
  const countText = counts
    .filter(([n]) => n)
    .map(([n, unit]) => `${n} ${unit === "branch" ? (n === 1 ? "branch" : "branches") : `${unit}${n === 1 ? "" : "s"}`}`)
    .join(" · ");
  const created = new Date(job.created_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

  return (
    <Fragment>
      <TableRow data-state={selected ? "selected" : undefined}>
        <TableCell>
          {isPublishable && <Checkbox checked={selected} onCheckedChange={onToggleSelect} aria-label={`Select ${name}`} />}
        </TableCell>
        <TableCell primary>
          <div className="flex min-w-0 items-center gap-3">
            <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", status.className)}>
              <Landmark className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <Link href={`/admin/data/all-extractions/${job.id}`} className="truncate font-medium text-foreground hover:underline">
                  {name}
                </Link>
                <NeedsAttentionBadge job={job} />
                {job.source_type === "spreadsheet" && (
                  <Badge variant="info">
                    <FileSpreadsheet /> Spreadsheet
                  </Badge>
                )}
              </div>
              <p className="truncate text-xs text-muted-foreground">{job.institution_url}</p>
              {/* Below md the Created column is hidden — keep the date and both actors reachable here. */}
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground md:hidden">
                <span>{created}</span>
                <RowActors row={job} />
              </div>
              {/* Progress and counts columns hide at md / lg — keep them readable here, as the old row did. */}
              <p className="mt-0.5 text-xs text-muted-foreground md:hidden">
                {pct}% · {status.label}
              </p>
              {countText && <p className="mt-0.5 text-xs text-muted-foreground lg:hidden">{countText}</p>}
            </div>
          </div>
        </TableCell>
        <TableCell>
          <ExtractionStatusBadge status={job.status} />
        </TableCell>
        <TableCell className="hidden md:table-cell">
          <ProgressCell job={job} pct={pct} />
        </TableCell>
        <TableCell numeric className="hidden lg:table-cell">{count(job.courses_extracted)}</TableCell>
        <TableCell numeric className="hidden lg:table-cell">{count(job.agent_count)}</TableCell>
        <TableCell numeric className="hidden lg:table-cell">{count(job.campus_count)}</TableCell>
        <TableCell className="hidden md:table-cell">
          <div className="text-muted-foreground">{created}</div>
          {/* Both actors, same wording as the job header and every sub-tab card. */}
          <RowActors row={job} className="flex-col items-start gap-y-0.5" />
        </TableCell>
        <TableCell>
          <ExtractionJobActions
            {...actionProps}
            hasPipeline={hasPipeline}
            expanded={expanded}
            onToggleExpanded={() => setExpanded((s) => !s)}
          />
        </TableCell>
      </TableRow>
      {expanded && progress && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={EXTRACTION_JOB_COLUMNS.length} className="bg-muted/30 whitespace-normal">
            <div className="overflow-x-auto">
              <PipelineProgressPanel job={job} progress={progress} />
            </div>
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
}
