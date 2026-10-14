"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { Landmark } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { TableCell, TableRow } from "@/components/ui/table";
import { ACTIVE_STATUSES, FINISHED_STATUSES, PIPELINE_STAGES, PUBLISHABLE_STATUSES } from "../const";
import { ExtractionStatusBadge, NeedsAttentionBadge } from "./status-badge";
import { SourceBadge } from "./source-badge";
import { RowActors } from "./row-actors";
import { PipelineProgressPanel } from "./pipeline-progress-panel";
import { ExtractionJobActions, type ExtractionJobActionProps } from "./extraction-job-actions";
import type { ExtractionJob, PipelineProgress } from "../apis/types";

/** Column headers for the rows below — kept beside the row so the two can't drift apart. */
export const EXTRACTION_JOB_COLUMNS = [
  { label: "Select", className: "w-px", srOnly: true },
  { label: "Institution" },
  { label: "Status" },
  { label: "Extracted", className: "hidden md:table-cell" },
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

/** Only a running job gets a bar — a finished one's status pill already says it. */
function ProgressLine({ pct }: Readonly<{ pct: number }>) {
  return (
    <div className="mt-1.5 flex w-32 items-center gap-2">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-chart-4" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  );
}

export function ExtractionJobRow({
  selected,
  onToggleSelect,
  index = 0,
  ...actionProps
}: ExtractionJobActionProps & Readonly<{ selected: boolean; onToggleSelect: () => void; index?: number }>) {
  const { job } = actionProps;
  const [expanded, setExpanded] = useState(false);

  const isPublishable = PUBLISHABLE_STATUSES.includes(job.status);
  const progress = (job.pipeline_progress ?? null) as PipelineProgress | null;
  const hasPipeline = Boolean(progress && Object.keys(progress).length > 0);
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
  const created = new Date(job.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const creator = job.created_by_name || job.created_by_email;
  const running = ACTIVE_STATUSES.includes(job.status);

  return (
    <Fragment>
      {/* Rows rise in one after another, capped so a long page doesn't keep animating. */}
      <TableRow data-state={selected ? "selected" : undefined} className="animate-row-rise" style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}>
        <TableCell>
          {isPublishable && <Checkbox checked={selected} onCheckedChange={onToggleSelect} aria-label={`Select ${name}`} />}
        </TableCell>
        <TableCell primary>
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
              <Landmark className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <Link href={`/admin/data/all-extractions/${job.id}`} className="truncate font-medium text-foreground hover:underline">
                  {name}
                </Link>
                <NeedsAttentionBadge job={job} />
                <SourceBadge sourceType={job.source_type} />
              </div>
              <p className="truncate text-xs text-muted-foreground">{job.institution_url}</p>
              {/* Below md the Created column is hidden — keep the date and both actors reachable here. */}
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground md:hidden">
                <span>{created}</span>
                <RowActors row={job} />
              </div>
              {/* The Extracted column hides below md — keep its counts readable here. */}
              {countText && <p className="mt-0.5 text-xs text-muted-foreground md:hidden">{countText}</p>}
            </div>
          </div>
        </TableCell>
        <TableCell>
          <ExtractionStatusBadge status={job.status} />
          {running && <ProgressLine pct={pct} />}
        </TableCell>
        <TableCell className="hidden text-muted-foreground md:table-cell">{countText || "—"}</TableCell>
        <TableCell className="hidden md:table-cell">
          <div>{created}</div>
          {/* One line: the full Added by / Edited by pair lives on the job's own header. */}
          <div className="text-xs text-muted-foreground">{creator ? `by ${creator}` : "Extracted automatically"}</div>
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
