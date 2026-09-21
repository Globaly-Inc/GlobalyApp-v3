"use client";

import { useState } from "react";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { allExtractionsApi } from "../apis";
import { BADGES, NOT_RUN, readStatus, type StepBadge } from "./step-action-bar";
import type { ExtractionJob } from "../apis/types";

/** The chain, in order. Labels are the admin's words; keys are pipeline_progress keys and run-step names. */
export const CHAIN_STEPS: { key: string; label: string; hint: string }[] = [
  { key: "site_map", label: "Map site", hint: "Discover every URL on the site (no page scraping)" },
  { key: "site_snapshot", label: "Snapshot", hint: "Fetch every listed page once and store it — the only step that scrapes" },
  { key: "site_analysis", label: "Analyse", hint: "Read the homepage snapshot → institution overview" },
  { key: "url_classify", label: "Classify", hint: "Decide which listed URLs are course pages" },
  { key: "queue_pages", label: "Queue", hint: "Send every course URL to the page workers" },
];

/**
 * One chip per chain step with its status and a Run button. Rendered once at the top of the Site
 * tab; `highlight` marks the steps the tab is about. Preconditions are enforced by the
 * backend and surface here as the toast on a refused Run ("run site_map first").
 */
export function StepChainBar({ job, highlight = [], onChanged }: Readonly<{ job: ExtractionJob; highlight?: string[]; onChanged: () => void }>) {
  const [busy, setBusy] = useState<string | null>(null);
  const progress = (job.pipeline_progress ?? {}) as Record<string, unknown>;

  // Re-running a finished Snapshot means "fetch every page again" — otherwise every page is a
  // cache hit and the run changes nothing. Every other step is idempotent on its own.
  const run = async (step: string, label: string, fresh = false) => {
    setBusy(step);
    try {
      await allExtractionsApi.runStep(job.id, step, fresh ? { fresh: true } : undefined);
      toast.success(`${label} started`, { description: "Running in the background — refresh to see progress." });
      onChanged();
    } catch (e) {
      toast.error(`${label} refused`, { description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mb-3 flex flex-wrap items-stretch gap-2 rounded-md border border-primary/15 bg-primary/5 p-2">
      {CHAIN_STEPS.map((s, i) => {
        const status = readStatus(progress[s.key]);
        const badge: StepBadge = (status ? BADGES[status] : undefined) ?? NOT_RUN;
        const running = status === "running" || status === "processing";
        const emphasised = highlight.includes(s.key);
        return (
          <div
            key={s.key}
            title={s.hint}
            className={cn(
              "flex min-w-40 flex-1 items-center justify-between gap-2 rounded-md border px-2.5 py-1.5",
              emphasised ? "border-primary/40 bg-background" : "border-border/60 bg-background/60",
            )}
          >
            <div className="flex min-w-0 flex-col">
              <span className="text-xs font-medium text-foreground">{i + 1}. {s.label}</span>
              <span className={cn("mt-0.5 inline-flex w-fit items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium", badge.className)}>
                <badge.icon className={cn("h-2.5 w-2.5", badge.spin && "animate-spin")} />
                {badge.label}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 shrink-0 p-0 cursor-pointer"
              disabled={busy !== null || running}
              title={running ? "Running" : status === "done" ? (s.key === "site_snapshot" ? "Re-fetch every page" : `Re-run ${s.label}`) : `Run ${s.label}`}
              onClick={() => run(s.key, s.label, s.key === "site_snapshot" && status === "done")}
            >
              {busy === s.key || running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            </Button>
          </div>
        );
      })}
      {job.step_mode === "manual" && (
        <p className="basis-full text-[11px] text-muted-foreground">
          Manual step mode: the pipeline stops after each step. Press ▶ on the next step when you are happy with the previous one.
        </p>
      )}
    </div>
  );
}
