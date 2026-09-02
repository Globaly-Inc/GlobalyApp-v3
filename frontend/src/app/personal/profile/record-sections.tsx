"use client";

import { useState } from "react";
import { GraduationCap, Briefcase, Award, Languages } from "lucide-react";
import { PrivacyBadge } from "@/components/privacy-badge";
import { Badge } from "@/components/ui/badge";
import { OneToManySection } from "./section-card";
import { ItemRow } from "./item-row";
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";
import { useTests } from "./use-tests";
import { testImage } from "@/lib/tests-catalog";
import type { AcademicTest, LanguageTest, Qualification, WorkExperience } from "../apis/types";

function subScoreLabel(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatMonthYear(value: string | null): string | null {
  if (!value) return null;
  const iso = /^(\d{4})-(\d{2})-\d{2}$/.exec(value);
  if (!iso) return value; // already a display-ready string, e.g. "MM/YYYY"
  return new Date(Number(iso[1]), Number(iso[2]) - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function formatRange(start: string | null, end: string | null, isCurrent: boolean) {
  if (!start && !end) return null;
  return `${formatMonthYear(start) ?? "—"} – ${isCurrent ? "Present" : (formatMonthYear(end) ?? "—")}`;
}

export function RecordSections({
  qualifications,
  workExperiences,
  academicTests,
  languageTests,
  isSectionPublic,
  toggleVisibility,
  readOnly = false,
  onAddQualification,
  onEditQualification,
  onDeleteQualification,
  onAddWorkExperience,
  onEditWorkExperience,
  onDeleteWorkExperience,
  onAddAcademicTest,
  onEditAcademicTest,
  onDeleteAcademicTest,
  onAddLanguageTest,
  onEditLanguageTest,
  onDeleteLanguageTest,
}: Readonly<{
  qualifications: Qualification[];
  workExperiences: WorkExperience[];
  academicTests: AcademicTest[];
  languageTests: LanguageTest[];
  isSectionPublic: (key: string) => boolean;
  toggleVisibility: (key: string) => void;
  /** Preview mode: no add/edit/delete or privacy-toggle controls anywhere in this section. */
  readOnly?: boolean;
  onAddQualification: () => void;
  onEditQualification: (item: Qualification) => void;
  onDeleteQualification: (id: string) => void;
  onAddWorkExperience: () => void;
  onEditWorkExperience: (item: WorkExperience) => void;
  onDeleteWorkExperience: (id: string) => void;
  onAddAcademicTest: () => void;
  onEditAcademicTest: (item: AcademicTest) => void;
  onDeleteAcademicTest: (id: string) => void;
  onAddLanguageTest: () => void;
  onEditLanguageTest: (item: LanguageTest) => void;
  onDeleteLanguageTest: (id: string) => void;
}>) {
  const [pendingDelete, setPendingDelete] = useState<{ label: string; onConfirm: () => void } | null>(null);
  // The logo an admin uploaded for this test, matched on the name the person picked.
  const tests = useTests();

  return (
    <>
      <OneToManySection
        icon={GraduationCap}
        title="Education Background"
        count={qualifications.length}
        onAdd={readOnly ? undefined : onAddQualification}
        emptyText="No education history added yet."
        badge={<PrivacyBadge isPublic={isSectionPublic("education")} onToggle={readOnly ? undefined : () => toggleVisibility("education")} />}
      >
        <div className="space-y-3">
          {qualifications.map((q) => (
            <ItemRow
              key={q.id}
              icon={GraduationCap}
              title={q.degree_title || "Qualification"}
              titleBadge={q.qualification_type && <Badge variant="secondary">{q.qualification_type}</Badge>}
              subtitle={q.institution_name}
              meta={
                <>
                  {q.subject_area && <span>{q.subject_area}</span>}
                  {formatRange(q.start_date, q.end_date, q.is_current) && (
                    <span>{formatRange(q.start_date, q.end_date, q.is_current)}</span>
                  )}
                  {q.grade_value && <span>{q.grading_system ?? "GPA"}: {q.grade_value}</span>}
                </>
              }
              onEdit={readOnly ? undefined : () => onEditQualification(q)}
              onDelete={readOnly ? undefined : () => setPendingDelete({ label: "qualification", onConfirm: () => onDeleteQualification(q.id) })}
            />
          ))}
        </div>
      </OneToManySection>

      <OneToManySection
        icon={Briefcase}
        title="Work Experience"
        count={workExperiences.length}
        onAdd={readOnly ? undefined : onAddWorkExperience}
        emptyText="No work experiences added yet."
        badge={<PrivacyBadge isPublic={isSectionPublic("work_experience")} onToggle={readOnly ? undefined : () => toggleVisibility("work_experience")} />}
      >
        <div className="space-y-3">
          {workExperiences.map((w) => (
            <ItemRow
              key={w.id}
              icon={Briefcase}
              title={w.job_title}
              subtitle={w.organization_name}
              meta={formatRange(w.start_date, w.end_date, w.is_current) && (
                <span>{formatRange(w.start_date, w.end_date, w.is_current)}</span>
              )}
              onEdit={readOnly ? undefined : () => onEditWorkExperience(w)}
              onDelete={readOnly ? undefined : () => setPendingDelete({ label: "work experience", onConfirm: () => onDeleteWorkExperience(w.id) })}
            />
          ))}
        </div>
      </OneToManySection>

      <OneToManySection
        icon={Award}
        title="Academic Tests"
        count={academicTests.length}
        onAdd={readOnly ? undefined : onAddAcademicTest}
        emptyText="No academic test scores added yet."
        badge={<PrivacyBadge isPublic={isSectionPublic("academic_tests")} onToggle={readOnly ? undefined : () => toggleVisibility("academic_tests")} />}
      >
        <div className="space-y-3">
          {academicTests.map((t) => (
            <ItemRow
              key={t.id}
              icon={Award}
              imageUrl={testImage(t.test_type, tests)}
              title={t.test_type ?? "Test"}
              titleBadge={
                t.test_status === "completed" ? (
                  <Badge variant="secondary">Score: {t.overall_score ?? "—"}</Badge>
                ) : (
                  <Badge variant="secondary">Awaiting results</Badge>
                )
              }
              meta={
                t.sub_scores &&
                Object.entries(t.sub_scores).map(([key, value]) => (
                  <span key={key} className="capitalize">
                    {subScoreLabel(key)}: {value}
                  </span>
                ))
              }
              onEdit={readOnly ? undefined : () => onEditAcademicTest(t)}
              onDelete={readOnly ? undefined : () => setPendingDelete({ label: "academic test", onConfirm: () => onDeleteAcademicTest(t.id) })}
            />
          ))}
        </div>
      </OneToManySection>

      <OneToManySection
        icon={Languages}
        title="Language Tests"
        count={languageTests.length}
        onAdd={readOnly ? undefined : onAddLanguageTest}
        emptyText="No language test scores added yet."
        badge={<PrivacyBadge isPublic={isSectionPublic("language_tests")} onToggle={readOnly ? undefined : () => toggleVisibility("language_tests")} />}
      >
        <div className="space-y-3">
          {languageTests.map((t) => (
            <ItemRow
              key={t.id}
              icon={Languages}
              imageUrl={testImage(t.test_type, tests)}
              title={t.test_type ?? "Test"}
              titleBadge={
                t.test_status === "completed" ? (
                  <Badge variant="secondary">Score: {t.overall_score ?? "—"}</Badge>
                ) : (
                  <Badge variant="secondary">Awaiting results</Badge>
                )
              }
              meta={
                t.sub_scores &&
                Object.entries(t.sub_scores).map(([key, value]) => (
                  <span key={key} className="capitalize">
                    {subScoreLabel(key)}: {value}
                  </span>
                ))
              }
              onEdit={readOnly ? undefined : () => onEditLanguageTest(t)}
              onDelete={readOnly ? undefined : () => setPendingDelete({ label: "language test", onConfirm: () => onDeleteLanguageTest(t.id) })}
            />
          ))}
        </div>
      </OneToManySection>

      <ConfirmDeleteDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        label={pendingDelete?.label ?? ""}
        onConfirm={() => pendingDelete?.onConfirm()}
      />
    </>
  );
}
