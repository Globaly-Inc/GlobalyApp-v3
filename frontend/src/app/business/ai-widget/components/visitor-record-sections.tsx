"use client";

import { Award, Briefcase, GraduationCap, Languages } from "lucide-react";
import { Badge } from "@/components/ui/badge";
// The profile's own section shell and row, so these read as the same records in both places.
// Not `RecordSections` itself: it renders a PrivacyBadge with a live public/private toggle,
// which is meaningless on a visitor — nobody is publishing this — and a switch that does
// nothing is worse than no switch.
import { OneToManySection } from "@/app/personal/profile/section-card";
import { ItemRow } from "@/app/personal/profile/item-row";
import { useTests } from "@/app/personal/profile/use-tests";
import { testImage } from "@/lib/tests-catalog";
import { toAcademicTest, toLanguageTest, toQualification, toWorkExperience } from "../utils/visitor-records";
import type { VisitorProfileEntry, VisitorRecordSection, WidgetVisitor } from "../apis/types";

/** Same rendering as the profile's records — "2021-12-01" reads as "Dec 2021", not as an ISO date. */
function formatMonthYear(value: string | null): string | null {
  if (!value) return null;
  const iso = /^(\d{4})-(\d{2})-\d{2}$/.exec(value);
  if (!iso) return value;
  return new Date(Number(iso[1]), Number(iso[2]) - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function formatRange(start: string | null, end: string | null, isCurrent: boolean) {
  if (!start && !end) return null;
  return `${formatMonthYear(start) ?? "—"} – ${isCurrent ? "Present" : (formatMonthYear(end) ?? "—")}`;
}

/** Everything on this page is a model's reading of a chat, and every section says so. */
function SelfReported() {
  return <Badge variant="secondary" className="font-normal">Self-reported</Badge>;
}

export type RecordAction = {
  onAdd: (section: VisitorRecordSection) => void;
  onEdit: (section: VisitorRecordSection, index: number) => void;
  onDelete: (section: VisitorRecordSection, index: number) => void;
};

function entriesOf(visitor: WidgetVisitor, section: VisitorRecordSection): VisitorProfileEntry[] {
  return visitor[section] ?? [];
}

export function VisitorRecordSections({
  visitor,
  actions,
}: Readonly<{ visitor: WidgetVisitor; actions: RecordAction }>) {
  // The logo an admin uploaded for each test, matched on name — same source the profile uses.
  const tests = useTests();

  const qualifications = entriesOf(visitor, "qualifications").map(toQualification);
  const workExperiences = entriesOf(visitor, "work_experiences").map(toWorkExperience);
  const languageTests = entriesOf(visitor, "language_tests").map(toLanguageTest);
  const academicTests = entriesOf(visitor, "academic_tests").map(toAcademicTest);

  const testRow = (section: VisitorRecordSection, t: ReturnType<typeof toLanguageTest>, icon: typeof Languages) => (
    <ItemRow
      key={t.id}
      icon={icon}
      imageUrl={testImage(t.test_type, tests)}
      title={t.test_type ?? "Test"}
      titleBadge={
        t.test_status === "completed"
          ? <Badge variant="secondary">Score: {t.overall_score ?? "—"}</Badge>
          : <Badge variant="secondary">Awaiting results</Badge>
      }
      meta={t.sub_scores && Object.entries(t.sub_scores).map(([key, value]) => (
        <span key={key}>{key}: {value}</span>
      ))}
      onEdit={() => actions.onEdit(section, Number(t.id))}
      onDelete={() => actions.onDelete(section, Number(t.id))}
    />
  );

  return (
    <>
      <OneToManySection
        icon={GraduationCap}
        title="Education Background"
        count={qualifications.length}
        onAdd={() => actions.onAdd("qualifications")}
        emptyText="No qualifications came up in the chat."
        badge={<SelfReported />}
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
              onEdit={() => actions.onEdit("qualifications", Number(q.id))}
              onDelete={() => actions.onDelete("qualifications", Number(q.id))}
            />
          ))}
        </div>
      </OneToManySection>

      <OneToManySection
        icon={Briefcase}
        title="Work Experience"
        count={workExperiences.length}
        onAdd={() => actions.onAdd("work_experiences")}
        emptyText="No work history came up in the chat."
        badge={<SelfReported />}
      >
        <div className="space-y-3">
          {workExperiences.map((w) => (
            <ItemRow
              key={w.id}
              icon={Briefcase}
              title={w.job_title || "Role"}
              subtitle={w.organization_name}
              meta={formatRange(w.start_date, w.end_date, w.is_current) && (
                <span>{formatRange(w.start_date, w.end_date, w.is_current)}</span>
              )}
              onEdit={() => actions.onEdit("work_experiences", Number(w.id))}
              onDelete={() => actions.onDelete("work_experiences", Number(w.id))}
            />
          ))}
        </div>
      </OneToManySection>

      <OneToManySection
        icon={Award}
        title="Academic Tests"
        count={academicTests.length}
        onAdd={() => actions.onAdd("academic_tests")}
        emptyText="No academic test came up in the chat."
        badge={<SelfReported />}
      >
        <div className="space-y-3">{academicTests.map((t) => testRow("academic_tests", t, Award))}</div>
      </OneToManySection>

      <OneToManySection
        icon={Languages}
        title="Language Tests"
        count={languageTests.length}
        onAdd={() => actions.onAdd("language_tests")}
        emptyText="No language test came up in the chat."
        badge={<SelfReported />}
      >
        <div className="space-y-3">{languageTests.map((t) => testRow("language_tests", t, Languages))}</div>
      </OneToManySection>
    </>
  );
}
