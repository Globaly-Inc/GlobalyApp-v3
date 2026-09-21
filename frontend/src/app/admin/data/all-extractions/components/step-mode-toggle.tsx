"use client";

import { useState } from "react";
import { Loader2, Hand, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { allExtractionsApi } from "../apis";
import type { ExtractionJob, StepMode } from "../apis/types";

/**
 * Auto | Manual. Auto chains the pipeline steps as they always ran; Manual stops after every step
 * and waits for Run on the next one (Site URLs / Snapshots tabs). Takes effect at the next hand-off.
 */
export function StepModeToggle({ job, onReload }: Readonly<{ job: ExtractionJob; onReload: () => void }>) {
  const [busy, setBusy] = useState(false);
  const mode: StepMode = job.step_mode ?? "auto";

  const set = async (next: StepMode) => {
    if (next === mode || busy) return;
    setBusy(true);
    try {
      await allExtractionsApi.updateContext(job.id, { step_mode: next });
      toast.success(next === "manual" ? "Manual step mode — the pipeline will wait after each step" : "Auto step mode — steps chain themselves");
      onReload();
    } catch (e) {
      toast.error("Could not change step mode", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="inline-flex items-center rounded-md border border-border p-0.5" title="Step mode: does the pipeline run the next step by itself, or wait for you?">
      {(["auto", "manual"] as StepMode[]).map((m) => (
        <Button
          key={m}
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => set(m)}
          className={cn("h-7 gap-1.5 px-2.5 text-xs cursor-pointer", mode === m && "bg-primary/10 text-primary hover:bg-primary/15")}
        >
          {busy && mode !== m ? <Loader2 className="h-3 w-3 animate-spin" /> : m === "auto" ? <Zap className="h-3 w-3" /> : <Hand className="h-3 w-3" />}
          {m === "auto" ? "Auto" : "Manual"}
        </Button>
      ))}
    </div>
  );
}
