"use client";

import { useState } from "react";
import { GraduationCap, Briefcase, Award, Languages } from "lucide-react";
import { PrivacyBadge } from "@/components/privacy-badge";
import { OneToManySection } from "./section-card";
import { ItemRow } from "./item-row";
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";
import type { AcademicTest, LanguageTest, Qualification, WorkExperience } from "../apis/types";

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

function formatDate(value: string | null) {
  return value ? value.split("T")[0] : null;
}

export function RecordSections({
  qualifications,
  workExperiences,
  academicTests,
  languageTests,
  isSectionPublic,
  toggleVisibility,
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

  return (
    <>
      <OneToManySection
        icon={GraduationCap}
        title="Education Background"
        count={qualifications.length}
        onAdd={onAddQualification}
        emptyText="No education history added yet."
        badge={<PrivacyBadge isPublic={isSectionPublic("education")} onToggle={() => toggleVisibility("education")} />}
      >
        <div className="space-y-2">
          {qualifications.map((q) => (
            <ItemRow
              key={q.id}
              title={q.degree_title || q.qualification_type || "Qualification"}
              subtitle={[q.institution_name, q.subject_area].filter(Boolean).join(" · ")}
              meta={formatRange(q.start_date, q.end_date, q.is_current)}
              onEdit={() => onEditQualification(q)}
              onDelete={() => setPendingDelete({ label: "qualification", onConfirm: () => onDeleteQualification(q.id) })}
            />
          ))}
        </div>
      </OneToManySection>

      <OneToManySection
        icon={Briefcase}
        title="Work Experience"
        count={workExperiences.length}
        onAdd={onAddWorkExperience}
        emptyText="No work experience added yet."
        badge={<PrivacyBadge isPublic={isSectionPublic("work_experience")} onToggle={() => toggleVisibility("work_experience")} />}
      >
        <div className="space-y-2">
          {workExperiences.map((w) => (
            <ItemRow
              key={w.id}
              title={w.job_title}
              subtitle={w.organization_name}
              meta={formatRange(w.start_date, w.end_date, w.is_current)}
              onEdit={() => onEditWorkExperience(w)}
              onDelete={() => setPendingDelete({ label: "work experience", onConfirm: () => onDeleteWorkExperience(w.id) })}
            />
          ))}
        </div>
      </OneToManySection>

      <OneToManySection
        icon={Award}
        title="Academic Test"
        count={academicTests.length}
        onAdd={onAddAcademicTest}
        emptyText="No academic test scores added yet."
        badge={<PrivacyBadge isPublic={isSectionPublic("academic_tests")} onToggle={() => toggleVisibility("academic_tests")} />}
      >
        <div className="space-y-2">
          {academicTests.map((t) => (
            <ItemRow
              key={t.id}
              title={t.test_type ?? "Test"}
              subtitle={t.test_status === "completed" ? `Score: ${t.overall_score ?? "—"}` : "Awaiting results"}
              meta={formatDate(t.test_date)}
              onEdit={() => onEditAcademicTest(t)}
              onDelete={() => setPendingDelete({ label: "academic test", onConfirm: () => onDeleteAcademicTest(t.id) })}
            />
          ))}
        </div>
      </OneToManySection>

      <OneToManySection
        icon={Languages}
        title="Language Test"
        count={languageTests.length}
        onAdd={onAddLanguageTest}
        emptyText="No language test scores added yet."
        badge={<PrivacyBadge isPublic={isSectionPublic("language_tests")} onToggle={() => toggleVisibility("language_tests")} />}
      >
        <div className="space-y-2">
          {languageTests.map((t) => (
            <ItemRow
              key={t.id}
              title={t.test_type ?? "Test"}
              subtitle={t.test_status === "completed" ? `Score: ${t.overall_score ?? "—"}` : "Awaiting results"}
              meta={formatDate(t.test_date)}
              onEdit={() => onEditLanguageTest(t)}
              onDelete={() => setPendingDelete({ label: "language test", onConfirm: () => onDeleteLanguageTest(t.id) })}
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
