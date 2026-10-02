"use client";

import { Badge } from "@/components/ui/badge";
import type { ServiceEligibility } from "../../apis/types";

type TestRow = { test_type_name: string; overall_score: number | null };

/** Extracted eligibility rows also carry the scraped text forms of degree/score. */
export type EligibilityExtras = { min_degree_level?: string | null; min_score_percent?: number | string | null; min_score_grade?: string | null };

const SCORE_TYPE_LABEL: Record<string, string> = { percentage: "%", gpa_4: " GPA (of 4)", gpa_10: " GPA (of 10)", cgpa: " CGPA" };

/** "60%", "3.2 GPA (of 4)", or the scraped grade text — whichever the row has. */
export function minScoreLabel(row: ServiceEligibility): string | null {
  const extra = row as ServiceEligibility & EligibilityExtras;
  if (row.min_score != null) return `${Number(row.min_score)}${SCORE_TYPE_LABEL[row.score_type ?? ""] ?? ""}`;
  if (extra.min_score_percent != null) return `${Number(extra.min_score_percent)}%`;
  return extra.min_score_grade || null;
}

/** One eligibility requirement on the service summary: what it is, who it applies to, then the
 *  academic minimums and tests it sets. */
export function EligibilityRequirementCard({ row, degreeLevels }: Readonly<{
  row: ServiceEligibility;
  degreeLevels: { id: number; name: string }[];
}>) {
  return (
    <div className="space-y-2.5 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-start justify-between gap-2">
        {/* Extracted rows carry their requirement as name/description — show them,
           not just who it applies to. */}
        <p className="text-sm font-medium">{row.name || "Requirement"}</p>
        <Badge variant="secondary" className="shrink-0 text-xs capitalize">{row.applicable_to}</Badge>
      </div>
      {row.description && <p className="line-clamp-3 text-xs text-muted-foreground">{row.description}</p>}
      {(() => {
        const degree = row.degree_level_id
          ? degreeLevels.find((d) => d.id === row.degree_level_id)?.name
          : (row as EligibilityExtras).min_degree_level;
        const score = minScoreLabel(row);
        if (!degree && !score) return null;
        return (
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Academic</p>
            {degree && <p className="text-xs">Min. degree: <span className="font-medium">{degree}</span></p>}
            {score && <p className="text-xs">Min. score: <span className="font-medium">{score}</span></p>}
          </div>
        );
      })()}
      {row.academic_tests.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Academic tests</p>
          <div className="flex flex-wrap gap-1.5">
            {(row.academic_tests as TestRow[]).map((t, i) => (
              <Badge key={`${t.test_type_name}-${i}`} variant="outline">{t.test_type_name}{t.overall_score != null ? ` ≥ ${t.overall_score}` : ""}</Badge>
            ))}
          </div>
        </div>
      )}
      {row.language_tests.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Language tests</p>
          <div className="flex flex-wrap gap-1.5">
            {(row.language_tests as TestRow[]).map((t, i) => (
              <Badge key={`${t.test_type_name}-${i}`} variant="outline">{t.test_type_name}{t.overall_score != null ? ` ≥ ${t.overall_score}` : ""}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
