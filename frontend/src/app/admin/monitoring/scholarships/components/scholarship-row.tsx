"use client";

import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { TableCell, TableRow } from "@/components/ui/table";
import type { Scholarship } from "../apis/types";

/** Column headers for the rows below (after the select-all checkbox) — kept beside the row so the two can't drift apart. */
export const SCHOLARSHIP_COLUMNS = [
  { label: "Scholarship" },
  { label: "Country", className: "hidden md:table-cell" },
  { label: "Basis", className: "hidden lg:table-cell" },
  { label: "Coverage", className: "hidden lg:table-cell" },
  { label: "Deadline", className: "hidden md:table-cell" },
  { label: "Published" },
  { label: "Featured" },
  { label: "Actions", className: "w-px", srOnly: true },
] as const;

const BASIS_TONE: Record<string, string> = {
  merit: "bg-info/10 text-info border-info/20",
  need: "bg-chart-4/10 text-chart-4 border-chart-4/20",
  sports: "bg-warning/10 text-warning border-warning/20",
  diversity: "bg-chart-5/10 text-chart-5 border-chart-5/20",
  government: "bg-success/10 text-success border-success/20",
  research: "bg-primary/10 text-primary border-primary/20",
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
    <TableRow data-state={selected ? "selected" : undefined}>
      <TableCell className="w-px">
        <Checkbox checked={selected} onCheckedChange={(v) => onSelect(!!v)} aria-label={`Select ${scholarship.title}`} />
      </TableCell>
      <TableCell primary>
        <p className="truncate font-medium text-foreground">{scholarship.title}</p>
        <p className="truncate text-xs text-muted-foreground">{scholarship.provider_name ?? "Unknown provider"}</p>
        {/* Fallbacks for the columns hidden on narrow screens. */}
        <p className="truncate text-xs text-muted-foreground md:hidden">
          {scholarship.country ?? "—"} · Deadline {scholarship.deadline ? new Date(scholarship.deadline).toLocaleDateString() : "—"}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground lg:hidden">
          {scholarship.basis && (
            <Badge variant="outline" className={`capitalize ${BASIS_TONE[scholarship.basis] ?? ""}`}>{scholarship.basis}</Badge>
          )}
          <span className="capitalize">{formatCoverage(scholarship)}</span>
        </div>
      </TableCell>
      <TableCell className="hidden max-w-40 truncate md:table-cell">{scholarship.country ?? "—"}</TableCell>
      <TableCell className="hidden lg:table-cell">
        {scholarship.basis ? (
          <Badge variant="outline" className={`capitalize ${BASIS_TONE[scholarship.basis] ?? ""}`}>{scholarship.basis}</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="hidden font-medium capitalize lg:table-cell">{formatCoverage(scholarship)}</TableCell>
      <TableCell className="hidden text-muted-foreground md:table-cell">
        {scholarship.deadline ? new Date(scholarship.deadline).toLocaleDateString() : "—"}
      </TableCell>
      <TableCell>
        <Switch
          checked={scholarship.is_published}
          onCheckedChange={(v) => onToggle("is_published", v)}
          aria-label={`Published: ${scholarship.title}`}
        />
      </TableCell>
      <TableCell>
        <Switch
          checked={scholarship.is_featured}
          onCheckedChange={(v) => onToggle("is_featured", v)}
          aria-label={`Featured: ${scholarship.title}`}
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1">
          {scholarship.is_published && (
            <Button
              variant="ghost" size="icon-sm" nativeButton={false} aria-label={`View ${scholarship.title} on the site`}
              render={<a href={`/scholarships/${scholarship.slug}`} target="_blank" rel="noreferrer" />}
            >
              <ExternalLink />
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${scholarship.title}`} onClick={onEdit}>
            <Pencil />
          </Button>
          <Button
            variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive"
            aria-label={`Delete ${scholarship.title}`} onClick={onDelete}
          >
            <Trash2 />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
