import { GraduationCap, Mail, PhoneOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DescriptionItem, DescriptionList } from "@/components/ui/description-list";
import type { DistributionListItem, EligibilityCriterion, UnlockedStudentProfile } from "../apis";
import { Section } from "./student-profile-section";

/**
 * The side column. It swaps the two cards that only mean something to the profile's owner —
 * Profile Completion and the public link — for Course Requirements, which is the reason an agent
 * opened this at all.
 */
export function StudentProfileSidebar({
  profile,
  item,
  addressCountry,
}: Readonly<{
  profile: UnlockedStudentProfile;
  item: DistributionListItem | null;
  addressCountry: string | null;
}>) {
  const criteria = item?.eligibility_criteria ?? null;
  return (
    <>
      <Section icon={Mail} title="Contact Details">
        <DescriptionList columns={1}>
          <DescriptionItem label="Email">{profile.email || "—"}</DescriptionItem>
          <DescriptionItem label="Phone">
            {profile.phone_withheld ? (
              // Stated, not blank — the agent paid for this profile and should know the gap is
              // the student's choice, not a field we failed to collect.
              <span className="inline-flex items-center gap-1.5 font-normal text-muted-foreground">
                <PhoneOff className="size-3.5 shrink-0" aria-hidden />
                Not shared by the student
              </span>
            ) : (
              profile.phone || "—"
            )}
          </DescriptionItem>
          {/* Date of Birth and Personal Address are hidden for now and may be restored.
              Presentation only — the API still returns both fields, so uncommenting these
              two is the whole change. If the intent is that an agent must NOT have them at
              all, the API response has to drop them too; hiding them here still ships the
              values to the browser. */}
          {/* <DescriptionItem label="Personal Address">
            {[p?.personal_address_street, p?.personal_address_city, p?.personal_address_state, p?.personal_address_postcode]
              .filter(Boolean)
              .join(", ") || "—"}
          </DescriptionItem> */}
          <DescriptionItem label="Country">{addressCountry || "—"}</DescriptionItem>
        </DescriptionList>
      </Section>

      {criteria && criteria.length > 0 && (
        <Section icon={GraduationCap} title="Course Requirements" count={criteria.length}>
          <div className="flex flex-col gap-3">
            {criteria.map((c) => (
              <div key={c.key} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{c.label}</p>
                  <p className="text-xs text-muted-foreground">
                    Needs {c.required ?? "—"} · has {c.actual ?? "not provided"}
                    {c.converted && " (converted)"}
                  </p>
                </div>
                <CriterionBadge status={c.status} />
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

/** Same meaning as eligibility-badge.tsx — pass reads as success, fail as warning. */
function CriterionBadge({ status }: Readonly<{ status: EligibilityCriterion["status"] }>) {
  const variant = status === "pass" ? "success" : status === "fail" ? "warning" : "secondary";
  return (
    <Badge variant={variant} className="shrink-0">
      {status === "pass" ? "Meets" : status === "fail" ? "Below" : "Unknown"}
    </Badge>
  );
}
