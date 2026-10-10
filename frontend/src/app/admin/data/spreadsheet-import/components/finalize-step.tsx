"use client";

import Link from "next/link";
import { CheckCircle2, ExternalLink, Loader2, XCircle } from "lucide-react";
import type { ImportPlanItem, ImportStatus, Issue } from "../types";

export function FinalizeStep({
  plan, issues, statuses,
}: Readonly<{
  plan: ImportPlanItem[];
  issues: Issue[];
  statuses: Record<string, ImportStatus>;
}>) {
  const included = plan.filter((p) => p.rows.length > 0).map((p) => p.group);
  const courses = plan.reduce((n, p) => n + p.rows.length, 0);
  const skipped = plan.reduce((n, p) => n + p.skippedRows, 0);
  const warnings = issues.filter((i) => !i.blocking).length;
  const started = Object.keys(statuses).length > 0;
  const done = included.filter((g) => statuses[g.id]?.state === "done").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Institutions", included.length],
          ["Courses", courses],
          ["Skipped (errors)", skipped],
          ["Warnings", warnings],
        ].map(([label, n]) => (
          <div key={label} className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-semibold">{n}</p>
          </div>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        Each institution becomes its own extraction. Its courses start as <strong>Awaiting approval</strong> — nothing is
        public until you approve them from the extraction&apos;s Courses tab.
      </p>

      <div className="flex flex-col divide-y rounded-lg border">
        {plan.map(({ group: g, rows, skippedRows, blockedReason }) => {
          const s = statuses[g.id];
          return (
            <div key={g.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              {s?.state === "done" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                : s?.state === "failed" ? <XCircle className="h-4 w-4 text-destructive" />
                : s?.state === "importing" ? <Loader2 className="h-4 w-4 animate-spin text-primary" />
                : <span className="h-4 w-4" />}
              <span className="min-w-0 flex-1 truncate font-medium">{g.name}</span>
              {blockedReason
                ? <span className="max-w-md truncate text-xs text-destructive" title={blockedReason}>Not imported — {blockedReason}</span>
                : <span className="text-xs text-muted-foreground">{rows.length} courses{skippedRows > 0 && <span className="text-destructive"> · {skippedRows} skipped (errors)</span>}</span>}
              {s?.state === "failed" && <span className="max-w-xs truncate text-xs text-destructive" title={s.error}>{s.error}</span>}
              {s?.jobId && (
                <Link href={`/admin/data/all-extractions/${s.jobId}?tab=courses`} className="flex items-center gap-1 text-xs text-primary">
                  Open <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {started && (
        <p className="text-sm text-muted-foreground">
          {done} of {included.length} imported. Anything already sent can&apos;t be edited here — to change it, open the
          extraction, or delete it and start over.
        </p>
      )}
    </div>
  );
}
