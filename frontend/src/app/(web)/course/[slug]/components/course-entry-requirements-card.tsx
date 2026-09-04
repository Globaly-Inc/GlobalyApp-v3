import { GraduationCap, Info, ShieldCheck, Trophy } from "lucide-react";
import { testImage, type PlatformTest } from "@/lib/tests-catalog";
import { ProfileSection } from "../../../components/profile/profile-section";
import { DEGREE_LABEL, SCORE_TYPE_LABEL, type CourseDetail } from "../../../search/types";

/** The requirement's minimum, whichever of the three ways extraction stored it. */
function minimumScore(requirement: CourseDetail["eligibility"][number]): string | null {
  if (requirement.min_score_percent) return `${requirement.min_score_percent}%`;
  if (requirement.min_score) {
    const scale = requirement.score_type ? SCORE_TYPE_LABEL[requirement.score_type] ?? requirement.score_type : null;
    return scale ? `${requirement.min_score} ${scale}` : String(requirement.min_score);
  }
  return requirement.min_score_grade;
}

const AUDIENCE_LABEL: Record<string, string> = {
  domestic: "Domestic students",
  international: "International students",
  both: "All students",
};

function SectionLabel({ children }: Readonly<{ children: React.ReactNode }>) {
  return <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{children}</p>;
}

function TestTile({
  name, score, tests,
}: Readonly<{ name: string; score: string | null | undefined; tests: PlatformTest[] }>) {
  const logo = testImage(name, tests);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-2">
      {logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="h-6 w-6 rounded object-contain" />
      )}
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold leading-tight">{name}</p>
        {score && <p className="text-[10px] text-muted-foreground">≥ {score}</p>}
      </div>
    </div>
  );
}

const BANDS = [
  { key: "speaking_score", label: "Speaking" },
  { key: "listening_score", label: "Listening" },
  { key: "writing_score", label: "Writing" },
  { key: "reading_score", label: "Reading" },
] as const;

function LanguageRequirement({
  requirements, tests,
}: Readonly<{ requirements: CourseDetail["englishRequirements"]; tests: PlatformTest[] }>) {
  if (requirements.length === 0) return null;

  return (
    <div className="space-y-2">
      <SectionLabel>Language Requirement</SectionLabel>
      <div className="grid grid-cols-2 gap-1.5">
        {requirements.map((requirement) => (
          <TestTile
            key={requirement.id}
            name={requirement.test_type_name ?? "Test"}
            score={requirement.overall_score}
            tests={tests}
          />
        ))}
      </div>
      {/* Per-band minimums, when extraction captured them. */}
      {requirements.map((requirement) => {
        const bands = BANDS.filter((b) => requirement[b.key]);
        if (bands.length === 0) return null;
        return (
          <div key={`${requirement.id}-bands`} className="grid grid-cols-2 gap-1.5">
            {bands.map((band) => (
              <div key={band.key} className="flex items-center justify-between rounded-lg border border-border px-2.5 py-1.5">
                <span className="text-[11px] text-muted-foreground">{band.label}</span>
                <span className="text-xs font-semibold text-foreground">{requirement[band.key]}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function AcademicRequirement({
  requirement, tests,
}: Readonly<{ requirement: CourseDetail["eligibility"][number]; tests: PlatformTest[] }>) {
  const minScore = minimumScore(requirement);
  const scores = (requirement.academic_tests ?? []).filter((t) => t.test_name);
  if (!requirement.min_degree_level && !minScore && scores.length === 0 && !requirement.description) return null;
  const audience = requirement.applicable_to ? AUDIENCE_LABEL[requirement.applicable_to] : null;

  return (
    <div className="space-y-3">
      {(requirement.name || audience) && (
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-xs font-semibold text-foreground">{requirement.name}</p>
          {audience && <span className="shrink-0 text-[10px] text-muted-foreground">{audience}</span>}
        </div>
      )}
      {(requirement.min_degree_level || minScore) && (
        <div className="space-y-2">
          <SectionLabel>Academic Requirement</SectionLabel>
          {requirement.min_degree_level && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-2">
              <GraduationCap className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground">Minimum degree</p>
                <p className="truncate text-xs font-semibold">
                  {DEGREE_LABEL[requirement.min_degree_level] ?? requirement.min_degree_level}
                </p>
              </div>
            </div>
          )}
          {minScore && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-2">
              <Trophy className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground">Minimum score</p>
                <p className="text-xs font-semibold">{minScore}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {scores.length > 0 && (
        <div className="space-y-2">
          <SectionLabel>Academic Test Score</SectionLabel>
          <div className="grid grid-cols-2 gap-1.5">
            {scores.map((score) => (
              <TestTile key={score.test_name} name={score.test_name} score={score.score} tests={tests} />
            ))}
          </div>
        </div>
      )}

      {requirement.description && (
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{requirement.description}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Every audience's entry requirements in one list, each labelled by who it applies to. The
 * language bar sits on the course rather than the requirement, so it's stated once at the end.
 *
 * `tests` is the platform test catalogue — the page fetches it once and every tile resolves its
 * logo from it, so the artwork an admin uploads is what shows here.
 */
export function CourseEntryRequirementsCard({
  eligibility, englishRequirements, tests,
}: Readonly<{
  eligibility: CourseDetail["eligibility"];
  englishRequirements: CourseDetail["englishRequirements"];
  tests: PlatformTest[];
}>) {
  if (eligibility.length === 0 && englishRequirements.length === 0) {
    return (
      <ProfileSection icon={ShieldCheck} title="Eligibility">
        <p className="text-sm italic text-muted-foreground">No entry requirements listed yet.</p>
      </ProfileSection>
    );
  }

  return (
    <ProfileSection icon={ShieldCheck} title="Eligibility">
      <div className="divide-y divide-border">
        {eligibility.map((requirement) => (
          <div key={requirement.id} className="py-4 first:pt-0">
            <AcademicRequirement requirement={requirement} tests={tests} />
          </div>
        ))}
        {englishRequirements.length > 0 && (
          <div className="py-4 first:pt-0">
            <LanguageRequirement requirements={englishRequirements} tests={tests} />
          </div>
        )}
      </div>
    </ProfileSection>
  );
}
