"use client";

import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { COVERAGE_TYPE_OPTIONS } from "@/app/admin/data/all-extractions/components/scholarship-form";
import { OriginChip, type Origin } from "../origin-chip";
import { ACTIONS, STICKY_TD, STICKY_TH, TABLE, TABLE_WRAP, TD, TH, TR, rowDelay } from "../portal-ui/portal-ui";
import type { ExtractedScholarship } from "../../apis/types";
import { CoverageTag } from "./coverage-tag";
import { FirstPlusMore } from "./first-plus-more";
import { APPLIES, CHIP, CHIP_OUTLINE, CHIP_WARN, fmtDeadline } from "./scholarship-chips";

/** The list also carries the head office's scholarships for this branch's shared courses, and
 * each row's linked courses (none = institution-wide). */
export type Row = ExtractedScholarship & { shared?: boolean; courses?: { id: string; name: string }[]; origin?: Origin };

// The kit's TD hover tint is translucent; the pinned cell needs an opaque one or scrolled cells show through.
const STICKY_HOVER = "group-hover/row:bg-[color-mix(in_srgb,var(--color-muted)_40%,var(--color-card))]";
const coverageLabel = (v: string | null) => COVERAGE_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? (v ? v.replaceAll("_", " ") : null);
const dash = <span className="text-muted-foreground">—</span>;
const ICON = "size-7.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground";

export function InstitutionScholarshipsTable({
  rows,
  onEdit,
  onRemove,
}: Readonly<{ rows: ExtractedScholarship[]; onEdit: (s: ExtractedScholarship) => void; onRemove: (s: ExtractedScholarship) => void }>) {
  return (
    <div className={TABLE_WRAP}>
      <table className={cn(TABLE, "min-w-260")}>
        <thead>
          <tr>
            <th className={TH}>Name</th>
            <th className={TH}>Courses</th>
            <th className={TH}>Applies to</th>
            <th className={TH}>Coverage</th>
            <th className={TH}>Amount</th>
            <th className={TH}>Deadline</th>
            <th className={cn(TH, STICKY_TH, "w-px")}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s, i) => {
            const r = s as Row;
            // Shared rows belong to the head office — edited there, so every branch sees the change.
            const editable = r.shared !== true;
            const applies = s.applicable_to ? APPLIES[s.applicable_to] : undefined;
            const coverage = coverageLabel(s.coverage_type);
            return (
              <tr key={s.id} className={TR} style={rowDelay(i)}>
                <td className={TD}>
                  <div className="flex min-w-60 max-w-100 items-center gap-2.5">
                    <CoverageTag type={s.coverage_type} />
                    <div className="min-w-0">
                      <b className="block truncate font-semibold" title={s.name}>{s.name}</b>
                      {(r.origin === "extracted" || !editable) && (
                        <small className="mt-0.75 flex items-center gap-1.5 whitespace-nowrap">
                          {r.origin === "extracted" && <OriginChip origin="extracted" />}
                          {!editable && <span className={cn(CHIP, CHIP_OUTLINE, "text-[10px]")}>From head office</span>}
                        </small>
                      )}
                    </div>
                  </div>
                </td>
                <td className={TD}><FirstPlusMore items={(r.courses ?? []).map((c) => c.name)} empty="All courses" /></td>
                <td className={TD}>{applies ? <span className={cn(CHIP, applies[1])}>{applies[0]}</span> : dash}</td>
                <td className={TD}>{coverage ? <span className={cn(CHIP, CHIP_OUTLINE)}>{coverage}</span> : dash}</td>
                <td className={cn(TD, "whitespace-nowrap tabular-nums")}>
                  {s.amount != null ? `${s.currency ?? ""} ${s.amount.toLocaleString()}`.trim()
                    : dash}
                </td>
                <td className={TD}>
                  {s.deadline ? <span className={cn(CHIP, CHIP_WARN)}>Closes {fmtDeadline(s.deadline)}</span>
                    : dash}
                </td>
                <td className={cn(TD, STICKY_TD, STICKY_HOVER)}>
                  {editable ? (
                    <div className={ACTIONS}>
                      <Button size="icon-sm" variant="ghost" className={ICON} onClick={() => onEdit(s)} aria-label="Edit scholarship" title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon-sm" variant="ghost" className={cn(ICON, "hover:bg-destructive/10 hover:text-destructive")} onClick={() => onRemove(s)} aria-label="Remove scholarship" title="Remove">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : <div className={cn(ACTIONS, "text-xs")}>{dash}</div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
