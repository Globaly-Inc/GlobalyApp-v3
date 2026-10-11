"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Landmark, Play, RotateCcw, Square, Upload, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { BackButton } from "@/components/ui/back-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { useAppDispatch } from "@/lib/hooks";
import { ACTIVE_STATUSES, PUBLISHABLE_STATUSES } from "../const";
import { declineJob, promoteJob, resetPipeline, resumeJob, stopAllExtraction } from "../store/all-extractions-slice";
import { useConfirmDelete } from "./use-confirm-delete";
import { RerunExtractionButton } from "./rerun-extraction-button";
import { EnrichFromWebButton } from "./enrich-from-web-button";
import { StepModeToggle } from "./step-mode-toggle";
import { JobStatusBadge } from "./job-status-badge";
import type { ExtractionJob } from "../apis/types";

const RESETTABLE_STATUSES = ["pending", "failed", "mapping", "scraping", "extracting", "verifying", "paused"];
// Matches extraction-job-row.tsx's isResumable — a stopped job is "paused", a worker that died
// mid-crawl without ever flipping the job's own status leaves it "stalled".
const RESUMABLE_STATUSES = ["paused", "stalled"];

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

export function JobHeader({ job, onReload }: Readonly<{ job: ExtractionJob; onReload: () => void }>) {
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

  const publishLabel = job.status === "exported" ? "Re-publish / Repair" : "Publish to Business";

  return (
    <PageHeader
      leading={<BackButton onClick={() => router.back()} label="Back to extractions" />}
      title={<><Landmark /> <span className="min-w-0 break-words">{job.institution_name || "Extraction Review"}</span></>}
      badges={
        <>
          <JobStatusBadge status={job.status} />
          {job.source_type && <Badge variant="outline" className="capitalize">{job.source_type.replace(/_/g, " ")}</Badge>}
        </>
      }
      subtitle={
        <>
          <span className="break-all">{job.institution_url}</span>
          {" · "}Created {formatDate(job.created_at)}
          {" · "}Updated {formatDate(job.updated_at)}
        </>
      }
    >
      {job.source_type !== "agentcis" && <StepModeToggle job={job} onReload={onReload} />}
      <RerunExtractionButton jobId={job.id} onReload={onReload} />
      {RESUMABLE_STATUSES.includes(job.status) && (
        <Button
          className="gap-1.5 cursor-pointer"
          disabled={busy !== null}
          onClick={() => run("resume", resumeJob(job.id), "Extraction resumed")}
        >
          {busy === "resume" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          {busy === "resume" ? "Resuming…" : "Resume"}
        </Button>
      )}
      {/* Deep Scrape hidden 2026-10-06: jobs are uncapped (migration 20261006_001), so it no
          longer buys page budget, and unlike Resume it does NOT re-dispatch pages already sitting
          in the queue — a job could be deep-scraped and still have hundreds untouched. The
          component, the API method and the backend route are all still there. */}
      {job.source_type === "agentcis" && job.status === "done" && (
        <EnrichFromWebButton jobId={job.id} onReload={onReload} />
      )}

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

      {RESETTABLE_STATUSES.includes(job.status) && (
        <Button
          variant="outline"
          className="gap-1.5 cursor-pointer"
          disabled={busy !== null}
          onClick={async () => {
            const ok = await confirm(
              "Reset Pipeline?",
              "This will delete all queued URLs and reset progress counters. Extracted courses, campuses, and other data will be kept. The job will return to pending status.",
              { confirmLabel: "Reset", variant: "default" },
            );
            if (!ok) return;
            run("reset", resetPipeline(job.id), "Pipeline reset");
          }}
        >
          {busy === "reset" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
          {busy === "reset" ? "Resetting…" : "Reset Pipeline"}
        </Button>
      )}

      {PUBLISHABLE_STATUSES.includes(job.status) && (
        <>
          {job.status !== "exported" && (
            <Button
              variant="outline"
              className="gap-1.5 text-destructive border-destructive/30 cursor-pointer"
              disabled={busy !== null}
              onClick={() => run("decline", declineJob(job.id), "Extraction declined")}
            >
              <XCircle className="h-3.5 w-3.5" />
              Decline
            </Button>
          )}
          <Button
            className="gap-1.5 cursor-pointer"
            disabled={busy !== null}
            onClick={() => run("publish", promoteJob(job.id), "Published to Business")}
          >
            {busy === "publish" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {busy === "publish" ? "Publishing…" : publishLabel}
          </Button>
        </>
      )}
      {confirmDialog}
    </PageHeader>
  );
}
