"use client";

import { Fragment } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, FileText, Info, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { FINISHED_STATUSES, PIPELINE_STAGES } from "../const";
import type { ExtractionJob, PipelineProgress } from "../apis/types";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

// Raw provider errors (Gemini/Firecrawl SDK failures) can be a multi-line dump with
// JSON payloads and links — show a short human-readable line, full text lives behind "View Logs".
function summarizeError(message: string, max = 140) {
  const firstLine = (message.split("\n")[0] ?? "").trim();
  const firstSentence = firstLine.split(/(?<=[.!?])\s/)[0] ?? firstLine;
  return firstSentence.length <= max ? firstSentence : `${firstSentence.slice(0, max).trimEnd()}…`;
}

// Jobs finished via an older pipeline path (or promoted straight through) can leave
// pipeline_progress missing these stage keys entirely — job status wins over stale/absent detail.
// Every connector is a fixed width so spacing stays identical regardless of container
// size or label length — flex-grow distribution looked equal on paper but rounded unevenly.
function Stepper({
  progress, jobFinished, jobFailed,
}: Readonly<{ progress: PipelineProgress; jobFinished: boolean; jobFailed: boolean }>) {
  const stages = PIPELINE_STAGES.map((s) => ({ ...s, stage: progress[s.key] }));
  // A failed job dies at the first stage that never reached "done" — often before
  // pipeline_progress records anything at all, so every stage would otherwise read
  // as plain "Pending" with no sign of where things actually broke.
  const failureIndex = jobFailed ? stages.findIndex((s) => s.stage?.status !== "done") : -1;
  return (
    <div className="flex items-start justify-start">
      {stages.map(({ key, label, icon: Icon, stage }, i) => {
        const isDone = jobFinished || stage?.status === "done";
        const isRunning = !jobFinished && !jobFailed && stage?.status === "processing";
        const isFailed = i === failureIndex;
        const prevDone = jobFinished || (i > 0 && stages[i - 1]?.stage?.status === "done");
        return (
          <Fragment key={key}>
            {i > 0 && <div className={cn("mt-3.5 h-px w-16 shrink-0", prevDone ? "bg-emerald-400" : "bg-border")} />}
            <div className="flex shrink-0 flex-col items-center gap-1 text-center">
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                  isDone && "bg-emerald-100 text-emerald-600",
                  isRunning && "bg-purple-100 text-purple-600",
                  isFailed && "bg-red-100 text-red-600",
                  !isDone && !isRunning && !isFailed && "bg-muted text-muted-foreground",
                )}
              >
                {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isFailed ? <XCircle className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
              </div>
              <span className={cn("w-20 text-xs font-medium", isRunning && "text-purple-700", isFailed && "text-red-700")}>{label}</span>
              <span className={cn("text-[10px]", isFailed ? "text-red-600" : "text-muted-foreground")}>
                {isDone ? "Completed" : isRunning ? "In progress" : isFailed ? "Failed" : "Pending"}
              </span>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

function StatusPanel({ job }: Readonly<{ job: ExtractionJob }>) {
  if (job.status === "failed") {
    return (
      <div className="flex w-full flex-col gap-2 border border-red-200 bg-red-50 p-2.5 rounded-md">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800">Job failed</p>
            <p className="text-xs text-red-700">
              {job.error_message ? summarizeError(job.error_message) : `The job failed on ${formatDateTime(job.updated_at)}.`} Please re-run the job or check the logs for more details.
            </p>
          </div>
        </div>
        <Link
          href={`/admin/data/all-extractions/${job.id}?tab=overview`}
          className="flex w-fit items-center gap-1.5 self-end rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
        >
          <FileText className="h-3.5 w-3.5" />
          View Logs
        </Link>
      </div>
    );
  }

  if (job.status === "processing" || job.status === "extracting" || job.status === "scraping") {
    return (
      <div className="flex w-full items-start gap-2 border border-purple-200 rounded-md bg-purple-50 p-2.5">
        <Info className="h-4 w-4 shrink-0 text-purple-600 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-purple-800">Job is currently running</p>
          <p className="text-xs text-purple-700">
            This job was started on {formatDateTime(job.processing_heartbeat_at || job.created_at)}. You can re-run the job if needed.
          </p>
        </div>
      </div>
    );
  }

  return null;
}

function hasStatusPanel(job: ExtractionJob) {
  return job.status === "failed" || job.status === "processing" || job.status === "extracting" || job.status === "scraping";
}

export function PipelineProgressPanel({
  job, progress,
}: Readonly<{ job: ExtractionJob; progress: PipelineProgress }>) {
  const showPanel = hasStatusPanel(job);
  return (
    <div className="mt-2 flex items-start gap-6 border border-border p-4 ml-16 rounded-lg bg-muted/30">
      <div className={showPanel ? "flex-1 min-w-0" : "w-full"}>
        <Stepper
          progress={progress}
          jobFinished={FINISHED_STATUSES.includes(job.status) || job.status === "review"}
          jobFailed={job.status === "failed"}
        />
        {(job.pages_scraped > 0 || job.pages_failed > 0) && (
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span>{job.pages_scraped} scraped</span>
            {job.pages_failed > 0 && <span className="text-destructive">{job.pages_failed} failed</span>}
          </div>
        )}
      </div>
      {showPanel && (
        <div className="flex-1 min-w-0">
          <StatusPanel job={job} />
        </div>
      )}
    </div>
  );
}
