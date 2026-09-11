"use client";

import { useState } from "react";
import { Globe, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { allExtractionsApi } from "../apis";
import { useConfirmDelete } from "./use-confirm-delete";

export type EnrichFromWebButtonProps = Readonly<{
  jobId: string;
  onReload: () => void;
}>;

// AgentCIS jobs never crawl the institution's own site, so they can never get study units through
// that path. Re-runs the normal discovery/crawl pipeline against the real site to fill gaps —
// never touches data AgentCIS already gave a course (writeCourse's guard in staging-writer.ts).
export function EnrichFromWebButton({ jobId, onReload }: EnrichFromWebButtonProps) {
  const [running, setRunning] = useState(false);
  const { confirm, dialog } = useConfirmDelete();

  async function enrichFromWeb() {
    const ok = await confirm(
      "Enrich from Website?",
      "AgentCIS doesn't provide course curriculum (study units) or some institution details. This crawls the institution's own website to fill in what's missing — it never changes or duplicates the fees, intakes, or entry requirements AgentCIS already gave a course.",
      { confirmLabel: "Enrich from Website", variant: "default" },
    );
    if (!ok) return;
    setRunning(true);
    try {
      await allExtractionsApi.enrichFromWebJob(jobId);
      toast.success("Enrichment started", { description: "Crawling the institution's website — this can take a while." });
      onReload();
    } catch (e: unknown) {
      toast.error("Enrichment failed", { description: (e as Error).message });
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <Button variant="outline" className="gap-1.5 cursor-pointer" disabled={running} onClick={enrichFromWeb}>
        {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
        {running ? "Starting…" : "Enrich from Website"}
      </Button>
      {dialog}
    </>
  );
}
