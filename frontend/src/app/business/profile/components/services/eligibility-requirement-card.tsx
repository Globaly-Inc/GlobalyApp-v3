"use client";

import { ShieldCheck } from "lucide-react";
import type { ServiceEligibility } from "../../apis/types";

type LanguageTestRow = { test_type_name?: string; overall_score?: number | string | null };

/** Academic tests are stored as `{test_name, score, typical_score?, is_optional?}` (what the form
 *  and the extraction write); `test_type_name`/`overall_score` is the legacy shape, kept as a fallback. */
type AcademicTestRow = {
  test_name?: string;
  test_type_name?: string;
  score?: number | string | null;
  overall_score?: number | string | null;
  typical_score?: number | string | null;
  is_optional?: boolean;
};

const present = (v: number | string | null | undefined) => (v == null || v === "" ? null : String(v));

/** Normalises one stored academic test row to name / minimum / typical / optional. */
export function readAcademicTest(raw: Record<string, unknown>) {
  const t = raw as AcademicTestRow;
  return {
    name: t.test_name || t.test_type_name || "Test",
    min: present(t.score) ?? present(t.overall_score),
    typical: present(t.typical_score),
    optional: Boolean(t.is_optional),
  };
}

/** "≥ 1200", or "typical 1350" when the row only states what admitted students scored. */
export function academicTestValue(t: ReturnType<typeof readAcademicTest>): string | null {
  if (t.min) return `≥ ${t.min}`;
  return t.typical ? `typical ${t.typical}` : null;
}

/** Who a requirement applies to, as a tinted chip. */
export const APPLICABLE_TO_CHIP: Record<ServiceEligibility["applicable_to"], { label: string; className: string }> = {
  both: { label: "All students", className: "bg-primary/10 text-primary" },
  domestic: { label: "Domestic", className: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300" },
  international: { label: "International", className: "bg-violet-500/10 text-violet-700 dark:bg-violet-400/10 dark:text-violet-300" },
};

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

const SECTION_LABEL = "text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground";

function KeyValue({ k, v }: Readonly<{ k: React.ReactNode; v: string }>) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-mono font-semibold">{v}</span>
    </div>
  );
}

/** One eligibility requirement on the service summary: what it is, who it applies to, then the
 *  academic minimums and tests it sets. */
export function EligibilityRequirementCard({ row, degreeLevels }: Readonly<{
  row: ServiceEligibility;
  degreeLevels: { id: number; name: string }[];
}>) {
  const chip = APPLICABLE_TO_CHIP[row.applicable_to] ?? APPLICABLE_TO_CHIP.both;
  const degree = row.degree_level_id
    ? degreeLevels.find((d) => d.id === row.degree_level_id)?.name
    : (row as EligibilityExtras).min_degree_level;
  const score = minScoreLabel(row);
  const academicTests = (row.academic_tests ?? []).map(readAcademicTest);
  const languageTests = (row.language_tests ?? []) as LanguageTestRow[];

  return (
    <div className="space-y-2.5 rounded-xl border bg-card p-3 transition-shadow hover:shadow-sm">
      <div className="flex items-start gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ShieldCheck className="size-3.5" />
        </span>
        {/* Extracted rows carry their requirement as name/description — show them,
           not just who it applies to. */}
        <p className="min-w-0 flex-1 text-sm font-semibold">{row.name || "Requirement"}</p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${chip.className}`}>{chip.label}</span>
      </div>
      {row.description && <p className="line-clamp-3 text-xs text-muted-foreground">{row.description}</p>}
      {(degree || score) && (
        <div className="space-y-1">
          <p className={SECTION_LABEL}>Academic</p>
          {degree && <KeyValue k="Min. degree" v={degree} />}
          {score && <KeyValue k="Min. score" v={score} />}
        </div>
      )}
      {academicTests.length > 0 && (
        <div className="space-y-1">
          <p className={SECTION_LABEL}>Admission tests</p>
          {academicTests.map((t, i) => (
            <KeyValue
              key={`${t.name}-${i}`}
              k={<>{t.name}{t.optional && <span className="ml-1.5 rounded bg-muted px-1 text-[10px]">optional</span>}</>}
              v={academicTestValue(t) ?? "—"}
            />
          ))}
        </div>
      )}
      {languageTests.length > 0 && (
        <div className="space-y-1">
          <p className={SECTION_LABEL}>English tests</p>
          {languageTests.map((t, i) => (
            <KeyValue key={`${t.test_type_name}-${i}`} k={t.test_type_name ?? "Test"} v={present(t.overall_score) ? `≥ ${t.overall_score}` : "—"} />
          ))}
        </div>
      )}
    </div>
  );
}
