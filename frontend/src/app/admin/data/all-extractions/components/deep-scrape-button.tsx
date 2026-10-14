"use client";

import { useState } from "react";
import { ScanSearch, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { allExtractionsApi } from "../apis";
import { useConfirmDelete } from "./use-confirm-delete";

export type DeepScrapeButtonProps = Readonly<{
  jobId: string;
  onReload: () => void;
}>;

/** Re-runs discovery over the site, and raises the page budget by 500 on a job that still has one
 *  (jobs are uncapped by default — see migration 20261006_001). */
export function DeepScrapeButton({ jobId, onReload }: DeepScrapeButtonProps) {
  const [running, setRunning] = useState(false);
  const { confirm, dialog } = useConfirmDelete();

  async function deepScrape() {
    const ok = await confirm(
      "Deep Scrape?",
      "Re-runs discovery over the whole site to find pages that weren't there last time, and queues them for extraction. Already-extracted pages are never re-scraped or re-billed.",
      { confirmLabel: "Deep Scrape", variant: "default" },
    );
    if (!ok) return;
    setRunning(true);
    try {
      await allExtractionsApi.deepScrapeJob(jobId);
      toast.success("Deep scrape started", { description: "Discovery is re-running over the site." });
      onReload();
    } catch (e: unknown) {
      toast.error("Deep scrape failed", { description: (e as Error).message });
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <Button variant="outline" className="gap-1.5 cursor-pointer" disabled={running} onClick={deepScrape}>
        {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="h-3.5 w-3.5" />}
        {running ? "Starting…" : "Deep Scrape"}
      </Button>
      {dialog}
    </>
  );
}
