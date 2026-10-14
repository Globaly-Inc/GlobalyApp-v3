"use client";

import { AlertTriangle, CheckCircle2, Settings2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FIELD_BY_KEY } from "../const";
import type { Issue } from "../types";

/** Problems grouped by kind ("No currency" × 3771), so a file-wide gap reads as one fix, not thousands. */
export function IssueSummary({ issues, onEditMapping }: Readonly<{ issues: Issue[]; onEditMapping: () => void }>) {
  const kinds = new Map<string, { message: string; field: string; blocking: boolean; count: number }>();
  for (const i of issues) {
    // Row numbers inside a message ("Same name as row 12") would split one kind into many.
    const k = `${i.blocking}:${i.field}:${i.message.replace(/\d+/g, "#").replace(/, different .* — /, "")}`;
    const entry = kinds.get(k) ?? { message: i.message.replace(/row \d+/, "an earlier row").replace(/, different .* — /, " but different details — "), field: i.field, blocking: i.blocking, count: 0 };
    entry.count++;
    kinds.set(k, entry);
  }
  const sorted = [...kinds.values()].sort((a, b) => Number(b.blocking) - Number(a.blocking) || b.count - a.count);
  const blocking = issues.filter((i) => i.blocking).length;

  if (issues.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm font-medium text-success">
        <CheckCircle2 className="h-4 w-4" /> No problems found — ready to import
      </p>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2 rounded-lg border p-3", blocking ? "border-destructive/30 bg-destructive/10" : "border-warning/30 bg-warning/10")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={cn("flex items-center gap-2 text-sm font-semibold", blocking ? "text-destructive" : "text-warning")}>
          {blocking ? <XCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {blocking
            ? `${blocking} error${blocking === 1 ? "" : "s"} — those rows are skipped and the rest imported. Fix them to include them.`
            : "Only warnings — you can import"}
        </p>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={onEditMapping}>
          <Settings2 className="h-3.5 w-3.5" /> Edit mapping &amp; defaults
        </Button>
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        {sorted.map((k) => (
          <li key={`${k.blocking}${k.field}${k.message}`} className="flex items-start gap-2">
            <span className={cn("mt-0.5 rounded px-1.5 text-xs font-semibold", k.blocking ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning")}>
              {k.blocking ? "Error" : "Warning"}
            </span>
            <span>
              {/* Template-tab warnings name their own tab in the message, so they carry no field label. */}
              <strong>{k.count}</strong> × {k.field === "template" ? "" : `${FIELD_BY_KEY.get(k.field)?.label ?? k.field}: `}{k.message}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
