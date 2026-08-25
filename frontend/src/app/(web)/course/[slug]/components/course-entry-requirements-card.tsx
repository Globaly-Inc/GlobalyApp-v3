import { GraduationCap, Info, ShieldCheck, Trophy } from "lucide-react";
import { ProfileSection } from "../../../components/profile/profile-section";
import { DEGREE_LABEL, type CourseDetail } from "../../../search/types";

/* ── Test provider logos (ported from V1's testProviderLogos.ts) ── */
const ACADEMIC_TEST_LOGOS: Record<string, string> = {
  SAT: "/logos/SAT.png", GMAT: "/logos/GMAT.png", ACT: "/logos/ACT.png",
  GRE: "/logos/GRE.webp", LSAT: "/logos/LSAT.png",
};

const LANGUAGE_TEST_LOGOS: Record<string, string> = {
  IELTS: "/logos/IELTS.svg", TOEFL: "/logos/TOEFL.svg", Duolingo: "/logos/Duolingo.svg",
  PTE: "/logos/PTE.jpg", OET: "/logos/OET.png",
};

/** Scraped test names carry suffixes ("IELTS Academic"), so match on a contained key. */
function testLogo(name: string, logos: Record<string, string>): string | null {
  const normalized = name.toLowerCase();
  for (const [key, url] of Object.entries(logos)) {
    if (normalized.includes(key.toLowerCase())) return url;
  }
  return null;
}

function SectionLabel({ children }: Readonly<{ children: React.ReactNode }>) {
  return <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{children}</p>;
}

function TestTile({
  name, score, logos,
}: Readonly<{ name: string; score: string | null | undefined; logos: Record<string, string> }>) {
  const logo = testLogo(name, logos);
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

function LanguageRequirement({ tests }: Readonly<{ tests: CourseDetail["englishRequirements"] }>) {
  if (tests.length === 0) return null;

  return (
    <div className="space-y-2">
      <SectionLabel>Language Requirement</SectionLabel>
      <div className="grid grid-cols-2 gap-1.5">
        {tests.map((test) => (
          <TestTile key={test.id} name={test.test_type_name ?? "Test"} score={test.overall_score} logos={LANGUAGE_TEST_LOGOS} />
        ))}
      </div>
      {/* Per-band minimums, when extraction captured them. */}
      {tests.map((test) => {
        const bands = BANDS.filter((b) => test[b.key]);
        if (bands.length === 0) return null;
        return (
          <div key={`${test.id}-bands`} className="grid grid-cols-2 gap-1.5">
            {bands.map((band) => (
              <div key={band.key} className="flex items-center justify-between rounded-lg border border-border px-2.5 py-1.5">
                <span className="text-[11px] text-muted-foreground">{band.label}</span>
                <span className="text-xs font-semibold text-foreground">{test[band.key]}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function AcademicRequirement({
  requirement,
}: Readonly<{ requirement: CourseDetail["eligibility"][number] }>) {
  const minScore = requirement.min_score_percent ? `${requirement.min_score_percent}%` : requirement.min_score_grade;
  const tests = (requirement.academic_tests ?? []).filter((t) => t.test_name);
  if (!requirement.min_degree_level && !minScore && tests.length === 0 && !requirement.description) return null;

  return (
    <div className="space-y-3">
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

      {tests.length > 0 && (
        <div className="space-y-2">
          <SectionLabel>Academic Test Score</SectionLabel>
          <div className="grid grid-cols-2 gap-1.5">
            {tests.map((test) => (
              <TestTile key={test.test_name} name={test.test_name} score={test.score} logos={ACADEMIC_TEST_LOGOS} />
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
 */
export function CourseEntryRequirementsCard({
  eligibility, englishRequirements,
}: Readonly<{ eligibility: CourseDetail["eligibility"]; englishRequirements: CourseDetail["englishRequirements"] }>) {
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
            <AcademicRequirement requirement={requirement} />
          </div>
        ))}
        {englishRequirements.length > 0 && (
          <div className="py-4 first:pt-0">
            <LanguageRequirement tests={englishRequirements} />
          </div>
        )}
      </div>
    </ProfileSection>
  );
}
