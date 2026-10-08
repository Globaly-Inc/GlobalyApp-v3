"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/hooks";
import type { ExtractionCounts, ExtractionStageState, ExtractionStages } from "../../apis/types";
import { EXTRACTION_TERMINAL_STATUSES as TERMINAL_STATUSES } from "../const";
import { startedAgo } from "../utils";

const FAILED_STATUSES = new Set(["failed", "declined"]);

/** Courses has its own line above the grid, so it isn't repeated in here. */
const COUNTS: { key: keyof ExtractionCounts; label: string }[] = [
  { key: "branches", label: "Branches" },
  { key: "fees", label: "Fees" },
  { key: "intakes", label: "Intakes" },
  { key: "eligibility", label: "Eligibility" },
  { key: "scholarships", label: "Scholarships" },
  { key: "units", label: "Study units" },
  { key: "study_options", label: "Study options" },
  { key: "accreditations", label: "Accreditations" },
  { key: "agents", label: "Agents" },
];

/** What the crawl is doing, in the order it does it. Which one is running comes from the server —
 *  it derives these three from the job's pipeline progress. */
const STAGES: { key: keyof ExtractionStages; label: string; detail: string }[] = [
  { key: "crawling", label: "Crawling", detail: "Every public page on your domain" },
  { key: "organising", label: "Organising", detail: "Starts as pages arrive" },
  { key: "flagging", label: "Flagging gaps", detail: "Last, once sorting is done" },
];

function StageMark({ state }: Readonly<{ state: ExtractionStageState }>) {
  if (state === "done") {
    return (
      <span aria-hidden className="mt-px flex size-[19px] shrink-0 items-center justify-center rounded-full bg-primary">
        <Check className="size-3 text-primary-foreground" strokeWidth={3} />
      </span>
    );
  }
  // An open ring missing its top quarter, spun: the running stage reads as moving without a
  // second icon set beside the waiting stages' plain rings.
  return (
    <span
      aria-hidden
      className={cn(
        "mt-px size-[19px] shrink-0 rounded-full border-2",
        state === "processing" ? "animate-spin border-primary border-t-transparent" : "border-muted-foreground/30",
      )}
    />
  );
}

/** Shown in place of StartExtractionCard once a real job is linked. BusinessShell polls the status
 * (it also gates the nav on it); this card only renders it. */
export function ExtractionProgressCard({ sharedFrom = null, website = null }: Readonly<{ sharedFrom?: string | null; website?: string | null }>) {
  const data = useAppSelector((state) => state.businessOnboarding.extractionStatus);

  if (!data) return null;

  const site = website?.replace(/^https?:\/\//, "").replace(/\/$/, "") || null;

  const failed = FAILED_STATUSES.has(data.status);
  const done = TERMINAL_STATUSES.has(data.status) && !failed;
  const running = !failed && !done;

  let title: string;
  let barClassName: string;
  if (failed) {
    title = "Extraction failed";
    barClassName = "bg-destructive";
  } else if (done) {
    title = site ? `We read ${data.counts.courses.toLocaleString()} courses from ${site}` : "Extraction complete";
    barClassName = "bg-emerald-500";
  } else {
    title = site ? `Reading ${site}` : "Reading your website";
    barClassName = "bg-[linear-gradient(90deg,var(--primary),#23DDF6)]";
  }

  return (
    <Card className="gap-0 py-0">
      <div className="h-[3px] bg-muted">
        <span aria-hidden className={cn("block h-full transition-[width] duration-500", barClassName)} style={{ width: `${data.progress_pct}%` }} />
      </div>

      <div className="flex flex-col gap-[18px] p-5 sm:px-[22px]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-heading text-[19px] leading-tight font-semibold tracking-tight">{title}</h2>
            {running && data.started_at && (
              <p className="mt-1 text-xs text-muted-foreground">Started {startedAgo(data.started_at)} · usually 10–20 minutes in total</p>
            )}
            {sharedFrom && (
              <p className="mt-1 text-xs text-muted-foreground">
                Same website as your head office — showing <strong>{sharedFrom}</strong>&apos;s extraction, so there&apos;s nothing to run here.
              </p>
            )}
          </div>
          <span className="flex shrink-0 items-baseline gap-1">
            <span className="text-[32px] leading-none font-bold tabular-nums">{data.progress_pct}</span>
            <span className="text-[15px] font-semibold text-muted-foreground">%</span>
          </span>
        </div>

        {running && (
          <ol className="flex flex-wrap gap-2.5">
            {STAGES.map(({ key, label, detail }) => {
              const state = data.stages[key];
              const lit = state !== "waiting";
              return (
                <li
                  key={key}
                  className={cn(
                    "flex min-w-0 flex-1 basis-[150px] gap-2.5 rounded-[10px] border px-3 py-2.5",
                    lit ? "border-primary/25 bg-primary/5" : "border-border bg-muted/40",
                  )}
                >
                  <StageMark state={state} />
                  <span className="min-w-0">
                    <span className={cn("block text-[12.5px] font-semibold", lit ? "text-primary" : "text-muted-foreground")}>{label}</span>
                    <span className="block text-[11.5px] leading-4 text-muted-foreground">
                      {key === "crawling" && data.pages_found > 0 ? `${data.pages_found.toLocaleString()} pages found so far` : detail}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {running && (
          <div className="flex flex-wrap items-center gap-3 rounded-[11px] border border-border bg-muted/40 px-4 py-3">
            <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[10px] bg-primary/10 text-primary">
              <BookOpen className="size-[19px]" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-[26px] leading-none font-bold tabular-nums">{data.counts.courses.toLocaleString()}</span>
              <span className="mt-1 block text-xs text-muted-foreground">courses found so far, and climbing</span>
            </span>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {COUNTS.map(({ key, label }) => (
            <div key={key} className="rounded-[9px] bg-muted/50 px-1.5 py-2.5 text-center">
              <div className="text-[15px] font-bold tabular-nums">{data.counts[key].toLocaleString()}</div>
              <div className="text-[10.5px] leading-[14px] text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>

        {done && (
          <div className="border-t border-border pt-3.5">
            <Link href="/business/profile?tab=services" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              Browse your courses
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        )}
      </div>
    </Card>
  );
}
