"use client";

import { useState } from "react";
import { RotateCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { allExtractionsApi } from "../apis";
import { useConfirmDelete } from "./use-confirm-delete";

export type RerunExtractionButtonProps = Readonly<{
  jobId: string;
  status: string;
  onReload: () => void;
}>;

export function RerunExtractionButton({ jobId, status, onReload }: RerunExtractionButtonProps) {
  const [running, setRunning] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirmDelete();

  if (status !== "failed") return null;

  async function handleRerun() {
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

  return (
    <>
      <Button variant="outline" className="gap-1.5 cursor-pointer" disabled={running} onClick={handleRerun}>
        {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
        {running ? "Restarting…" : "Re-run Failed Extraction"}
      </Button>
      {confirmDialog}
    </>
  );
}
