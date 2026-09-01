"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Landmark, RotateCcw, Square, Upload, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/hooks";
import { ACTIVE_STATUSES, PUBLISHABLE_STATUSES, STATUS_CONFIG } from "../const";
import { declineJob, promoteJob, resetPipeline, stopAllExtraction } from "../store/all-extractions-slice";
import { useConfirmDelete } from "./use-confirm-delete";
import { RerunExtractionButton } from "./rerun-extraction-button";
import { DeepScrapeButton } from "./deep-scrape-button";
import type { ExtractionJob } from "../apis/types";

const RESETTABLE_STATUSES = ["pending", "failed", "mapping", "scraping", "extracting", "verifying", "paused"];

export function JobHeader({ job, onReload }: Readonly<{ job: ExtractionJob; onReload: () => void }>) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [busy, setBusy] = useState<"stop" | "reset" | "decline" | "publish" | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirmDelete();

  const run = async (
    action: "stop" | "reset" | "decline" | "publish",
    thunk:
      | ReturnType<typeof stopAllExtraction>
      | ReturnType<typeof resetPipeline>
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
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-4 min-w-0">
        <Button
          variant="ghost"
          className="gap-1.5 shrink-0 cursor-pointer"
          onClick={() => router.push("/admin/data/all-extractions")}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Button>
        <div className={cn("flex h-16 w-16 shrink-0 items-center justify-center rounded-md", (STATUS_CONFIG[job.status] ?? STATUS_CONFIG.pending).className)}>
          <Landmark className="h-8 w-8" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-foreground truncate">{job.institution_name || "Extraction Review"}</h1>
          <p className="text-xs text-muted-foreground truncate">{job.institution_url}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
        <RerunExtractionButton jobId={job.id} status={job.status} onReload={onReload} />
        <DeepScrapeButton jobId={job.id} onReload={onReload} />

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
      </div>
      {confirmDialog}
    </div>
  );
}
