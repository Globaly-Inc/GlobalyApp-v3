import { Award, Briefcase, GraduationCap, Languages, User } from "lucide-react";
import { DescriptionItem, DescriptionList } from "@/components/ui/description-list";
import type { UnlockedStudentProfile } from "../apis";
import { formatDate, formatMonthYear, formatRange, gradeLabel, subScoreLabel, titleise } from "../utils/student-profile-format";
import { BadgeValues, Row, Section } from "./student-profile-section";

type CountryName = (id?: number | null) => string | null;

/** The main column: Personal Details, the four record sections and Study Preferences. */
export function StudentProfileMain({
  profile,
  name,
  nationalityName,
  countryName,
}: Readonly<{
  profile: UnlockedStudentProfile;
  name: string;
  nationalityName?: string | null;
  countryName: CountryName;
}>) {
  const p = profile.profile ?? null;
  return (
    <>
      <Section icon={User} title="Personal Details">
        <DescriptionList>
          <DescriptionItem label="Full Name">{name || "—"}</DescriptionItem>
          {/* Hidden for now, may come back — see the note on Personal Address in the contact card. */}
          {/* <DescriptionItem label="Date of Birth">{formatDate(p?.date_of_birth) || "—"}</DescriptionItem> */}
          <DescriptionItem label="Gender">{titleise(p?.gender) || "—"}</DescriptionItem>
          <DescriptionItem label="Nationality">{nationalityName || "—"}</DescriptionItem>
          <DescriptionItem label="City of Residence">{p?.city_of_residence || "—"}</DescriptionItem>
        </DescriptionList>
      </Section>

      <Section icon={GraduationCap} title="Education Background" count={profile.qualifications.length}>
        <div className="flex flex-col gap-2">
          {profile.qualifications.map((q) => (
            <Row
              key={q.id}
              icon={GraduationCap}
              title={q.degree_title || q.qualification_type || "Qualification"}
              badge={titleise(q.qualification_type)}
              subtitle={[q.institution_name, q.subject_area].filter(Boolean).join(" · ")}
              meta={[formatRange(q.start_date, q.end_date, q.is_current), gradeLabel(q.grade_value, q.grading_system)]
                .filter(Boolean)
                .join(" · ")}
            />
          ))}
        </div>
      </Section>

      <Section icon={Briefcase} title="Work Experience" count={profile.work_experiences.length}>
        <div className="flex flex-col gap-2">
          {profile.work_experiences.map((w) => (
            <Row
              key={w.id}
              icon={Briefcase}
              title={w.job_title}
              subtitle={w.organization_name}
              meta={formatRange(w.start_date, w.end_date, w.is_current)}
            />
          ))}
        </div>
      </Section>

      <Section icon={Award} title="Academic Test" count={profile.academic_tests.length}>
        <div className="flex flex-col gap-2">
          {profile.academic_tests.map((t) => (
            <Row
              key={t.id}
              icon={Award}
              title={t.test_type ?? "Test"}
              subtitle={t.test_status === "completed" ? `Score: ${t.overall_score ?? "—"}` : "Awaiting results"}
              meta={[formatDate(t.test_date), subScoreLabel(t.sub_scores)].filter(Boolean).join(" · ")}
            />
          ))}
        </div>
      </Section>

      <Section icon={Languages} title="Language Test" count={profile.language_tests.length}>
        <div className="flex flex-col gap-2">
          {profile.language_tests.map((t) => (
            <Row
              key={t.id}
              icon={Languages}
              title={t.test_type ?? "Test"}
              subtitle={t.test_status === "completed" ? `Score: ${t.overall_score ?? "—"}` : "Awaiting results"}
              meta={[formatDate(t.test_date), subScoreLabel(t.sub_scores)].filter(Boolean).join(" · ")}
            />
          ))}
        </div>
      </Section>

      <Section icon={GraduationCap} title="Study Preferences">
        <DescriptionList>
          <DescriptionItem label="Study Destinations" wide>
            <BadgeValues values={p?.preferred_destinations?.map((id) => countryName(id) ?? String(id))} />
          </DescriptionItem>
          <DescriptionItem label="Subject Areas" wide>
            <BadgeValues values={p?.preferred_fields ?? undefined} />
          </DescriptionItem>
          <DescriptionItem label="Degree Level">
            {p?.preferred_degree_levels?.map((d) => titleise(d)).join(", ") || "—"}
          </DescriptionItem>
          <DescriptionItem label="Expected Start">{formatMonthYear(p?.expected_start_date) || "—"}</DescriptionItem>
          <DescriptionItem label="Budget" wide>
            {p?.budget_min || p?.budget_max
              ? `${p?.budget_currency ?? ""} ${p?.budget_min ?? "?"} – ${p?.budget_max ?? "?"} / year`
              : "—"}
          </DescriptionItem>
        </DescriptionList>
      </Section>
    </>
  );
}
