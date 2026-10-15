"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, MoreHorizontal, Play, RotateCcw, Square, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAppDispatch } from "@/lib/hooks";
import { ACTIVE_STATUSES, PUBLISHABLE_STATUSES } from "../const";
import { declineJob, promoteJob, resetPipeline, resumeJob, stopAllExtraction } from "../store/all-extractions-slice";
import { useConfirmDelete } from "./use-confirm-delete";
import { RerunExtractionButton } from "./rerun-extraction-button";
import { EnrichFromWebButton } from "./enrich-from-web-button";
import { StepModeToggle } from "./step-mode-toggle";
import { JobStatusBadge } from "./job-status-badge";
import { RowActors } from "./row-actors";
import type { ExtractionJob, InstitutionOverview } from "../apis/types";

const RESETTABLE_STATUSES = ["pending", "failed", "mapping", "scraping", "extracting", "verifying", "paused"];
// Matches extraction-job-row.tsx's isResumable — a stopped job is "paused", a worker that died
// mid-crawl without ever flipping the job's own status leaves it "stalled".
const RESUMABLE_STATUSES = ["paused", "stalled"];

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** The extraction's header card: cover, logo, name and status, actions, and the crawl's headline counts. */
export function JobHeader({
  job, overview, coursesTotal, onReload,
}: Readonly<{ job: ExtractionJob; overview: InstitutionOverview | null; coursesTotal?: number; onReload: () => void }>) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [busy, setBusy] = useState<"stop" | "reset" | "resume" | "decline" | "publish" | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirmDelete();

  const run = async (
    action: "stop" | "reset" | "resume" | "decline" | "publish",
    thunk:
      | ReturnType<typeof stopAllExtraction>
      | ReturnType<typeof resetPipeline>
      | ReturnType<typeof resumeJob>
      | ReturnType<typeof declineJob>
      | ReturnType<typeof promoteJob>,
    successMessage: string,
  ) => {
    setBusy(action);
    const result = await dispatch(thunk);
    setBusy(null);
    if ("error" in result && result.error) {
      toast.error("Action failed", { description: (result.error as { message?: string }).message ?? "Please try again." });
      return;
    }
    toast.success(successMessage);
  };

  const resetPipelineConfirmed = async () => {
    const ok = await confirm(
      "Reset Pipeline?",
      "This will delete all queued URLs and reset progress counters. Extracted courses, campuses, and other data will be kept. The job will return to pending status.",
      { confirmLabel: "Reset", variant: "default" },
    );
    if (ok) run("reset", resetPipeline(job.id), "Pipeline reset");
  };

  const name = job.institution_name || "Extraction Review";
  const publishable = PUBLISHABLE_STATUSES.includes(job.status);
  const canDecline = publishable && job.status !== "exported";
  const canReset = RESETTABLE_STATUSES.includes(job.status);
  const publishLabel = job.status === "exported" ? "Re-publish / Repair" : "Publish to Business";
  const totalCourses = coursesTotal ?? job.verification_total ?? 0;
  const coverUrl = overview?.cover_url || null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" className="cursor-pointer gap-1.5 px-2 text-muted-foreground" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" /> Back to extractions
            </Button>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {job.source_type !== "agentcis" && <StepModeToggle job={job} onReload={onReload} />}
          <RerunExtractionButton jobId={job.id} onReload={onReload} />
          {RESUMABLE_STATUSES.includes(job.status) && (
            <Button className="gap-1.5 cursor-pointer" disabled={busy !== null} onClick={() => run("resume", resumeJob(job.id), "Extraction resumed")}>
              {busy === "resume" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              {busy === "resume" ? "Resuming…" : "Resume"}
            </Button>
          )}
          {/* Deep Scrape hidden 2026-10-06: jobs are uncapped (migration 20261006_001), so it no
              longer buys page budget, and unlike Resume it does NOT re-dispatch pages already sitting
              in the queue — a job could be deep-scraped and still have hundreds untouched. The
              component, the API method and the backend route are all still there. */}
          {job.source_type === "agentcis" && job.status === "done" && <EnrichFromWebButton jobId={job.id} onReload={onReload} />}
          {ACTIVE_STATUSES.includes(job.status) && (
            <Button
              variant="destructive"
              className="gap-1.5 cursor-pointer"
              disabled={busy !== null}
              onClick={() => run("stop", stopAllExtraction(job.id), "All extraction stopped")}
            >
              {busy === "stop" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
              Stop All Extraction
            </Button>
          )}
          {publishable && (
            <Button className="gap-1.5 cursor-pointer" disabled={busy !== null} onClick={() => run("publish", promoteJob(job.id), "Published to Business")}>
              {busy === "publish" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {busy === "publish" ? "Publishing…" : publishLabel}
            </Button>
          )}
          {/* Rarely-used and destructive actions stay one click away, not next to Publish. */}
          {(canDecline || canReset) && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" size="icon" aria-label="More actions" className="cursor-pointer" disabled={busy !== null}>
                    <MoreHorizontal />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-48">
                {canReset && (
                  <DropdownMenuItem className="cursor-pointer gap-2" onClick={resetPipelineConfirmed}>
                    <RotateCcw className="h-3.5 w-3.5" /> Reset Pipeline
                  </DropdownMenuItem>
                )}
                {canDecline && (
                  <DropdownMenuItem
                    className="cursor-pointer gap-2 text-destructive focus:text-destructive"
                    onClick={() => run("decline", declineJob(job.id), "Extraction declined")}
                  >
                    <XCircle className="h-3.5 w-3.5" /> Decline
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm">
        <div className="relative h-28 bg-muted sm:h-32">
          {coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
        </div>

        <div className="flex min-w-0 items-end gap-4 px-5 pb-5">
          <Avatar className="-mt-10 size-20 shrink-0 animate-pop-in rounded-2xl border-4 border-card bg-white shadow-md">
            {overview?.logo_url && <AvatarImage src={overview.logo_url} alt="" className="rounded-xl object-contain p-1" />}
            <AvatarFallback className="rounded-xl bg-primary text-2xl font-semibold text-primary-foreground">
              {name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-1.5 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 wrap-break-word font-heading text-xl font-semibold leading-tight sm:text-2xl">{name}</h1>
              <JobStatusBadge status={job.status} />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {job.source_type && <Badge variant="secondary" className="capitalize">{job.source_type.replace(/_/g, " ")}</Badge>}
              {job.institution_url && (
                <a href={job.institution_url} target="_blank" rel="noopener noreferrer" className="break-all font-medium text-primary hover:underline">
                  {job.institution_url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                </a>
              )}
              <RowActors row={job} className="text-sm" />
              <span>Created {formatDate(job.created_at)}</span>
            </div>
          </div>
        </div>

        {/* LLM spend (tokens / $) is deliberately not shown here — admins asked for it off the cards.
            job.usage still arrives on the wire for the timeline and cost accounting. */}
        <dl className="stagger-in grid grid-cols-2 border-t sm:grid-cols-4">
          <Stat label="Pages found" value={job.total_pages_found || "—"} />
          <Stat
            label="Pages scraped"
            value={<>{job.pages_scraped || 0}{job.total_pages_found ? <span className="text-sm text-muted-foreground"> / {job.total_pages_found}</span> : null}</>}
          />
          <Stat label="Courses" value={totalCourses} />
          <Stat label="Last updated" value={<span className="text-base">{formatDate(job.updated_at)}</span>} />
        </dl>
      </section>
      {confirmDialog}
    </div>
  );
}

function Stat({ label, value }: Readonly<{ label: string; value: React.ReactNode }>) {
  return (
    <div className="border-l px-5 py-3.5 first:border-l-0 nth-3:max-sm:border-l-0 max-sm:nth-[n+3]:border-t">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-heading text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
