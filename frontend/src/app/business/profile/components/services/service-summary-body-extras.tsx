"use client";

import { Award, BookOpen, ShieldCheck } from "lucide-react";
import type { Lookup } from "@/app/admin/platform/categories/apis/types";
import { ServiceMediaCard } from "./service-media-card";
import { EligibilityRequirementCard } from "./eligibility-requirement-card";
import { SectionSummaryCard } from "./section-summary-card";
import { SummaryCardLink } from "./summary-card-link";
import { UnitCodeChip } from "./unit-code-chip";
import { UnitCredits } from "./unit-credits";
import { VisibilityToggle, type SectionVisibility } from "./visibility-toggle";
import { useServiceSummaryData } from "./use-service-summary-data";

const UNIT_PREVIEW = 4;

export function ServiceSummaryBodyExtras({
  serviceId, isCourse, degreeLevels, onNavigateTab, visibility,
}: Readonly<{
  serviceId: string; isCourse: boolean; degreeLevels: Lookup[];
  onNavigateTab: (tab: "study-units" | "accreditations" | "eligibility") => void;
  visibility: SectionVisibility;
}>) {
  // This card only exists while tab === "summary" (its parent unmounts it otherwise), so a plain
  // mount-once fetch is enough — it's naturally refreshed every time the caller returns here.
  const { eligibility, studyUnits, accreditations, loading } = useServiceSummaryData(serviceId, "summary");
  if (loading) return null;

  return (
    <>
      {isCourse && (
        <SectionSummaryCard
          icon={BookOpen}
          title="Study units"
          count={studyUnits.length}
          badge={<VisibilityToggle section="study_units" visibility={visibility} />}
          emptyText="No study units assigned yet."
          addLabel="Add unit"
          onAdd={() => onNavigateTab("study-units")}
        >
          <div className="stagger-in flex flex-col gap-2">
            {studyUnits.slice(0, UNIT_PREVIEW).map((u) => (
              <div key={u.id} className="flex items-center gap-2.5 rounded-xl bg-muted/60 p-2.5">
                {u.unit_code && <UnitCodeChip elective={u.unit_type === "elective"} className="min-w-[76px]">{u.unit_code}</UnitCodeChip>}
                <p className="min-w-0 flex-1 truncate text-[13px] font-semibold">{u.unit_name}</p>
                <UnitCredits value={u.credit_points} />
              </div>
            ))}
            <SummaryCardLink onClick={() => onNavigateTab("study-units")}>View all {studyUnits.length} units</SummaryCardLink>
          </div>
        </SectionSummaryCard>
      )}

      {isCourse && (
        <SectionSummaryCard
          icon={Award}
          title="Accreditations"
          count={accreditations.length}
          emptyText="No accreditations linked yet."
          onAdd={() => onNavigateTab("accreditations")}
        >
          <div className="stagger-in grid grid-cols-1 gap-2 sm:grid-cols-2">
            {accreditations.map((a) => (
              <div key={a.id} className="flex items-center gap-2.5 rounded-xl bg-muted/60 p-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Award className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold">{a.name}</p>
                  {a.issuing_organization_name && <p className="truncate text-xs text-muted-foreground">{a.issuing_organization_name}</p>}
                </div>
              </div>
            ))}
          </div>
        </SectionSummaryCard>
      )}

      {isCourse && (
        <SectionSummaryCard
          icon={ShieldCheck}
          title="Eligibility"
          count={eligibility.length}
          badge={<VisibilityToggle section="eligibility" visibility={visibility} />}
          emptyText="No eligibility requirements configured yet."
          onAdd={() => onNavigateTab("eligibility")}
        >
          <div className="stagger-in grid grid-cols-1 gap-3 sm:grid-cols-2">
            {eligibility.map((row) => (
              <EligibilityRequirementCard key={row.id} row={row} degreeLevels={degreeLevels} />
            ))}
          </div>
        </SectionSummaryCard>
      )}

      <ServiceMediaCard serviceId={serviceId} badge={<VisibilityToggle section="media" visibility={visibility} />} />
    </>
  );
}
