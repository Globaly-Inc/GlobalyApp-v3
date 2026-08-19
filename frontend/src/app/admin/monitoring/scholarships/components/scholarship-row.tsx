"use client";

import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import type { Scholarship } from "../apis/types";

export const ROW_GRID = "grid-cols-[28px_2fr_1.1fr_0.9fr_1fr_0.9fr_0.7fr_0.7fr_0.9fr]";

const BASIS_TONE: Record<string, string> = {
  merit: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
  need: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
  sports: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20",
  diversity: "bg-pink-500/10 text-pink-700 dark:text-pink-300 border-pink-500/20",
  government: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20",
  research: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20",
};

function formatCoverage(s: Scholarship) {
  if (s.coverage_amount != null) {
    const amount = Number(s.coverage_amount).toLocaleString(undefined, { maximumFractionDigits: 0 });
    return `${s.coverage_currency ?? ""} ${amount}`.trim();
  }
  return s.coverage_type.replace(/_/g, " ");
}

export function ScholarshipRow({
  scholarship,
  selected,
  onSelect,
  onToggle,
  onEdit,
  onDelete,
}: Readonly<{
  scholarship: Scholarship;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onToggle: (field: "is_published" | "is_featured", value: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}>) {
  return (
    <div className={`grid ${ROW_GRID} items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 transition-colors hover:bg-primary/5`}>
      <Checkbox checked={selected} onCheckedChange={(v) => onSelect(!!v)} aria-label={`Select ${scholarship.title}`} />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{scholarship.title}</p>
        <p className="truncate text-xs text-muted-foreground">{scholarship.provider_name ?? "Unknown provider"}</p>
      </div>
      <div className="text-sm text-foreground truncate">{scholarship.country ?? "—"}</div>
      <div>
        {scholarship.basis ? (
          <Badge variant="outline" className={`capitalize ${BASIS_TONE[scholarship.basis] ?? ""}`}>{scholarship.basis}</Badge>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </div>
      <div className="text-sm text-foreground capitalize font-medium tabular-nums">{formatCoverage(scholarship)}</div>
      <div className="text-sm text-muted-foreground tabular-nums">{scholarship.deadline ? new Date(scholarship.deadline).toLocaleDateString() : "—"}</div>
      <Switch checked={scholarship.is_published} onCheckedChange={(v) => onToggle("is_published", v)} />
      <Switch checked={scholarship.is_featured} onCheckedChange={(v) => onToggle("is_featured", v)} />
      <div className="flex items-center justify-end gap-1">
        {scholarship.is_published && (
          <Button
            variant="ghost" size="icon" className="h-8 w-8" nativeButton={false}
            render={<a href={`/scholarships/${scholarship.slug}`} target="_blank" rel="noreferrer" />}
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
