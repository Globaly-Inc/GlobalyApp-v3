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

/** Raises the job's 500-page scrape budget by another 500 and re-runs discovery. */
export function DeepScrapeButton({ jobId, onReload }: DeepScrapeButtonProps) {
  const [running, setRunning] = useState(false);
  const { confirm, dialog } = useConfirmDelete();

  async function deepScrape() {
    const ok = await confirm(
      "Deep Scrape?",
      "Extraction stops after 500 pages per site — enough for the course catalogue on most sites. Deep scrape raises that budget by another 500 pages and re-runs discovery to find and extract them. Already-extracted pages are never re-scraped or re-billed.",
      { confirmLabel: "Deep Scrape", variant: "default" },
    );
    if (!ok) return;
    setRunning(true);
    try {
      await allExtractionsApi.deepScrapeJob(jobId);
      toast.success("Deep scrape started", { description: "Page budget raised by 500 — discovery is re-running." });
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
