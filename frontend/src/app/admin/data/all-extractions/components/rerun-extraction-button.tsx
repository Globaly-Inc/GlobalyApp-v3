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
      "This will reset the pipeline and re-crawl the site from scratch. Extracted courses, campuses, and other data will be kept.",
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
  status: string;
  onReload: () => void;
}>;

export function RerunExtractionButton({ jobId, status, onReload }: RerunExtractionButtonProps) {
  const { rerun, running, dialog } = useRerunJob(jobId, onReload);

  if (status !== "failed") return null;

  return (
    <>
      <Button variant="outline" className="gap-1.5 cursor-pointer" disabled={running} onClick={rerun}>
        {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
        {running ? "Restarting…" : "Re-run Failed Extraction"}
      </Button>
      {dialog}
    </>
  );
}
