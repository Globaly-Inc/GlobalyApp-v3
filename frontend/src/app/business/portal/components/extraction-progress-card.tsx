"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { businessApi } from "../../apis";
import type { ExtractionCounts, ExtractionStatus } from "../../apis/types";
import { EXTRACTION_POLL_INTERVAL_MS as POLL_INTERVAL_MS, EXTRACTION_MAX_POLLS as MAX_POLLS } from "../const";

const TERMINAL_STATUSES = new Set(["done", "exported", "approved", "verified", "review", "failed", "declined"]);
const FAILED_STATUSES = new Set(["failed", "declined"]);

const SECONDARY_COUNTS: { key: keyof ExtractionCounts; label: string }[] = [
  { key: "branches", label: "Branches" },
  { key: "fees", label: "Fees" },
  { key: "intakes", label: "Intakes" },
  { key: "eligibility", label: "Eligibility" },
  { key: "units", label: "Study units" },
  { key: "study_options", label: "Study options" },
  { key: "accreditations", label: "Accreditations" },
  { key: "agents", label: "Agents" },
];

/** Shown in place of StartExtractionCard once a real job is linked — polls until the job finishes. */
export function ExtractionProgressCard() {
  const [data, setData] = useState<ExtractionStatus>(null);
  const fetchedRef = useRef(false);
  const pollCountRef = useRef(0);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    businessApi.getExtractionStatus().then(setData).catch(() => setData(null));
  }, []);

  useEffect(() => {
    if (!data || TERMINAL_STATUSES.has(data.status) || pollCountRef.current >= MAX_POLLS) return undefined;
    const timer = setTimeout(() => {
      pollCountRef.current += 1;
      businessApi.getExtractionStatus().then(setData).catch(() => {});
    }, POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [data]);

  if (!data) return null;

  const failed = FAILED_STATUSES.has(data.status);
  const done = TERMINAL_STATUSES.has(data.status) && !failed;
  const processing = data.status === "processing";

  let statusIcon: React.ReactNode;
  let statusTitle: string;
  let badgeVariant: "destructive" | "secondary" | "outline";
  let progressBarClassName: string | undefined;
  if (failed) {
    statusIcon = <XCircle className="h-4 w-4 text-destructive" />;
    statusTitle = "Extraction failed";
    badgeVariant = "destructive";
    progressBarClassName = "[&_[data-slot=progress-track]]:bg-destructive/15 [&_[data-slot=progress-indicator]]:bg-destructive";
  } else if (done) {
    statusIcon = <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    statusTitle = "Extraction complete";
    badgeVariant = "secondary";
    progressBarClassName = "[&_[data-slot=progress-indicator]]:bg-emerald-500";
  } else {
    statusIcon = <Loader2 className={cn("h-4 w-4 text-primary", processing && "animate-spin")} />;
    statusTitle = "Extracting your profile";
    badgeVariant = "outline";
    progressBarClassName = undefined;
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            {statusIcon}
            {statusTitle}
          </CardTitle>
          <Badge variant={badgeVariant} className="capitalize">
            {data.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-medium text-muted-foreground">Progress</span>
            <span className="text-2xl font-semibold tabular-nums">{data.progress_pct}%</span>
          </div>
          <Progress
            value={data.progress_pct}
            className={cn("gap-0", "[&_[data-slot=progress-track]]:h-2", progressBarClassName)}
          />
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BookOpen className="h-4.5 w-4.5" />
          </span>
          <div>
            <div className="text-2xl font-semibold leading-none tabular-nums">{data.counts.courses}</div>
            <div className="text-xs text-muted-foreground">Courses found</div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {SECONDARY_COUNTS.map(({ key, label }) => (
            <div key={key} className="rounded-lg bg-muted/40 px-2 py-2 text-center">
              <div className="text-base font-semibold tabular-nums">{data.counts[key]}</div>
              <div className="text-[11px] leading-tight text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
