"use client";

import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ACTIONS, STICKY_TD, STICKY_TH, TABLE, TABLE_WRAP, TD, TH, TR, rowDelay } from "../portal-ui/portal-ui";
import type { Scholarship } from "../../apis/types";
import { CoverageTag } from "./coverage-tag";
import { CHIP, CHIP_OK, CHIP_OUTLINE, CHIP_WARN, fmtDeadline } from "./scholarship-chips";

// The kit's TD hover tint is translucent; the pinned cell needs an opaque one or scrolled cells show through.
const STICKY_HOVER = "group-hover/row:bg-[color-mix(in_srgb,var(--color-muted)_40%,var(--color-card))]";
const words = (v: string | null) => (v ? v.replaceAll("_", " ") : null);
const dash = <span className="text-muted-foreground">—</span>;
const ICON = "size-7.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground";

/** A business's own scholarships (Title · Country · Basis · Coverage · Amount · Deadline · Status · Actions). */
export function BusinessScholarshipsTable({
  rows,
  onEdit,
  onDelete,
  onTogglePublished,
}: Readonly<{
  rows: Scholarship[];
  onEdit: (s: Scholarship) => void;
  onDelete: (s: Scholarship) => void;
  onTogglePublished: (s: Scholarship, next: boolean) => void;
}>) {
  return (
    <div className={TABLE_WRAP}>
      <table className={cn(TABLE, "min-w-260")}>
        <thead>
          <tr>
            <th className={TH}>Title</th>
            <th className={TH}>Country</th>
            <th className={TH}>Basis</th>
            <th className={TH}>Coverage</th>
            <th className={TH}>Amount</th>
            <th className={TH}>Deadline</th>
            <th className={TH}>Status</th>
            <th className={cn(TH, STICKY_TH, "w-px")}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s, i) => (
            <tr key={s.id} className={TR} style={rowDelay(i)}>
              <td className={TD}>
                <div className="flex min-w-60 max-w-100 items-center gap-2.5">
                  <CoverageTag type={s.coverage_type} />
                  <div className="min-w-0">
                    <b className="block truncate font-semibold" title={s.title}>{s.title}</b>
                    {s.provider_name && (
                      <small className="mt-0.75 block truncate text-[11.5px] text-muted-foreground">{s.provider_name}</small>
                    )}
                  </div>
                </div>
              </td>
              <td className={TD}>
                <span className="block max-w-48 truncate text-muted-foreground" title={s.country ?? undefined}>{s.country ?? "—"}</span>
              </td>
              <td className={cn(TD, "capitalize text-muted-foreground")}>{words(s.basis) ?? "—"}</td>
              <td className={TD}>{words(s.coverage_type) ? <span className={cn(CHIP, CHIP_OUTLINE, "capitalize")}>{words(s.coverage_type)}</span> : dash}</td>
              <td className={cn(TD, "whitespace-nowrap tabular-nums")}>
                {s.coverage_amount != null
                  ? `${s.coverage_currency ?? ""} ${s.coverage_amount.toLocaleString()}`.trim()
                  : dash}
              </td>
              <td className={TD}>
                {s.deadline ? <span className={cn(CHIP, CHIP_WARN)}>Closes {fmtDeadline(s.deadline)}</span>
                  : dash}
              </td>
              <td className={TD}>
                <span className={cn(CHIP, "gap-1.5", s.is_published ? CHIP_OK : "bg-muted text-muted-foreground")}>
                  <i className="size-1.5 rounded-full bg-current" />
                  {s.is_published ? "Published" : "Draft"}
                </span>
              </td>
              <td className={cn(TD, STICKY_TD, STICKY_HOVER)}>
                <div className={ACTIONS}>
                  <Button variant="ghost" size="sm" className="h-7.5 rounded-lg text-xs font-semibold" onClick={() => onTogglePublished(s, !s.is_published)}>
                    {s.is_published ? "Unpublish" : "Publish"}
                  </Button>
                  <Button size="icon-sm" variant="ghost" className={ICON} onClick={() => onEdit(s)} aria-label="Edit scholarship" title="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className={ICON}
                    title="Preview"
                    render={<a href={`/scholarships/${s.slug}`} target="_blank" rel="noopener noreferrer" aria-label="Preview scholarship" />}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon-sm" variant="ghost" className={cn(ICON, "hover:bg-destructive/10 hover:text-destructive")} onClick={() => onDelete(s)} aria-label="Remove scholarship" title="Remove">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
