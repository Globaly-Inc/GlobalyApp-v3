"use client";

import { useState } from "react";
import { RotateCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { allExtractionsApi } from "../apis";
import { useConfirmDelete } from "./use-confirm-delete";

/** Shared confirm-and-call logic behind every "Re-run" entry point (header button, row menu item). */
export function useRerunJob(jobId: string, onReload: () => void) {
  const [running, setRunning] = useState(false);
  const { confirm, dialog } = useConfirmDelete();

  async function rerun() {
    const ok = await confirm(
      "Re-run Extraction?",
      "Restarts extraction from a clean slate — re-discovers and re-scrapes the whole site through the current pipeline. Brings existing courses in line first: duplicates are merged and misclassified study units are moved out, nothing is deleted otherwise. To pick up only the pages that were never scraped instead, use Resume.",
      { confirmLabel: "Re-run", variant: "default" },
    );
    if (!ok) return;
    setRunning(true);
    try {
      await allExtractionsApi.rerunJob(jobId);
      toast.success("Extraction restarted");
      onReload();
    } catch (e: unknown) {
      toast.error("Rerun failed", { description: (e as Error).message });
    } finally {
      setRunning(false);
    }
  }

  return { rerun, running, dialog };
}

export type RerunExtractionButtonProps = Readonly<{
  jobId: string;
  onReload: () => void;
}>;

// Re-run is unconditionally a clean-slate restart now (see queue.service.ts:rerunJob) — a
// per-status label like "Re-run Failed Extraction" implied a targeted retry it no longer does.
export function RerunExtractionButton({ jobId, onReload }: RerunExtractionButtonProps) {
  const { rerun, running, dialog } = useRerunJob(jobId, onReload);

  return (
    <>
      <Button variant="outline" className="gap-1.5 cursor-pointer" disabled={running} onClick={rerun}>
        {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
        {running ? "Restarting…" : "Re-run Extraction"}
      </Button>
      {dialog}
    </>
  );
}
