"use client";

import { GraduationCap, Languages } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AcademicTest, LanguageTest } from "../apis/types";

/**
 * An eligibility requirement's English and academic tests, read-only, for the list view.
 *
 * The list used to show a bare count badge for English tests and nothing at all for academic
 * ones, so a reviewer had to open the edit form on every row to find out whether tests were
 * captured — which is also how "GRE is in the notes but not in Academic Tests" went unnoticed.
 *
 * Editing stays in the form (the pencil): these are array fields, not the single-column inline
 * edits the surrounding `Field` components handle.
 */

/** English sub-scores, in the order the edit form shows them. */
const BANDS = [
  ["reading_score", "R"],
  ["writing_score", "W"],
  ["listening_score", "L"],
  ["speaking_score", "S"],
] as const;

function TestRow({
  icon: Icon, label, children,
}: Readonly<{ icon: typeof Languages; label: string; children: React.ReactNode }>) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </span>
      {children}
    </div>
  );
}

export function EligibilityTestSummary({
  languageTests, academicTests,
}: Readonly<{
  languageTests: LanguageTest[] | null | undefined;
  academicTests: AcademicTest[] | null | undefined;
}>) {
  // Only rows with a name are shown — a nameless entry identifies no test and is what the
  // writers drop anyway.
  const english = (languageTests ?? []).filter((t) => t.test_type_name?.trim());
  const academic = (academicTests ?? []).filter((t) => t.test_name?.trim());
  if (english.length === 0 && academic.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-2.5">
      {english.length > 0 && (
        <TestRow icon={Languages} label="English">
          {english.map((test, i) => {
            const bands = BANDS.filter(([key]) => test[key]?.toString().trim());
            return (
              <Badge key={`${test.test_type_name}-${i}`} variant="outline" className="gap-1 text-xs font-normal">
                <span className="font-semibold">{test.test_type_name}</span>
                {test.overall_score && <span>{test.overall_score}</span>}
                {bands.length > 0 && (
                  <span className="text-muted-foreground">
                    ({bands.map(([key, short]) => `${short} ${test[key]}`).join(" · ")})
                  </span>
                )}
              </Badge>
            );
          })}
        </TestRow>
      )}

      {academic.length > 0 && (
        <TestRow icon={GraduationCap} label="Academic">
          {academic.map((test, i) => (
            <Badge key={`${test.test_name}-${i}`} variant="outline" className="gap-1 text-xs font-normal">
              <span className="font-semibold">{test.test_name}</span>
              {/*
                A required minimum and a cohort average read differently on purpose: "≥ 320" is a
                bar to clear, "avg 167" is what admitted students scored and gates nothing.
                Showing the second as the first is the bug this whole section exists to surface.
              */}
              {test.score?.toString().trim()
                ? <span>≥ {test.score}</span>
                : test.typical_score?.toString().trim()
                  ? <span className="text-muted-foreground">avg {test.typical_score}</span>
                  : <span className="text-muted-foreground">no score</span>}
              {test.is_optional && <span className="text-muted-foreground">· optional</span>}
            </Badge>
          ))}
        </TestRow>
      )}
    </div>
  );
}
