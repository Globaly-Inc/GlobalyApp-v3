"use client";

import { CalendarDays, DollarSign } from "lucide-react";
import { SectionSummaryCard } from "./section-summary-card";
import { ServiceSetupChecklist, type SetupStep } from "./service-setup-checklist";
import { SummaryCardLink } from "./summary-card-link";
import { NextIntakePreview } from "./next-intake-preview";
import { VisibilityToggle, type SectionVisibility } from "./visibility-toggle";
import { useServiceSummaryData } from "./use-service-summary-data";

// The business apis/types.ts keeps installments as loose JSON
// (Record<string, unknown>[]) rather than fully typing their nested shape — narrowed locally
// here since this display code needs to read into them.
type FeeInstallment = { label?: string; lines: { amount: number }[] };
type SidebarTab = "fees" | "intakes" | "eligibility";

export function ServiceSummarySidebarExtras({
  serviceId, name, hasCategory, description, isCourse, tab, onNavigateTab, visibility,
}: Readonly<{
  serviceId: string; name: string; hasCategory: boolean; description: string; isCourse: boolean;
  tab: string;
  onNavigateTab: (tab: SidebarTab) => void;
  visibility: SectionVisibility;
}>) {
  // Unlike the body extras, this sidebar renders for every tab (it's not gated on
  // tab === "summary"), so it never unmounts while a fee/intake gets added elsewhere —
  // re-keying the fetch on `tab` picks those changes up whenever the tab changes, instead of only
  // on a full page reload.
  const { fees, intakes, eligibility, loading } = useServiceSummaryData(serviceId, tab);
  if (loading) return null;

  const checklist: SetupStep<SidebarTab>[] = [
    { label: "Name & Category", done: name.trim().length > 0 && hasCategory },
    { label: "Description", done: description.trim().length > 0 },
    { label: "Fees", done: fees.length > 0, tab: "fees" },
    ...(isCourse ? [
      { label: "Intakes", done: intakes.length > 0, tab: "intakes" as const },
      { label: "Eligibility", done: eligibility.length > 0, tab: "eligibility" as const },
    ] : []),
  ];
  const incomplete = checklist.some((s) => !s.done);

  return (
    <>
      {incomplete && <ServiceSetupChecklist steps={checklist} onNavigateTab={onNavigateTab} />}

      <SectionSummaryCard
        icon={DollarSign}
        title={isCourse ? "Course fees" : "Service fees"}
        count={fees.length}
        badge={<VisibilityToggle section="fees" visibility={visibility} />}
        emptyText="No fees configured yet."
        onAdd={() => onNavigateTab("fees")}
      >
        <div className="stagger-in flex flex-col gap-2">
          {fees.map((fee) => {
            const n = (fee.installments as FeeInstallment[]).length;
            return (
              <div key={fee.id} className="flex items-center gap-2.5 rounded-xl bg-muted/60 p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold capitalize">{fee.name || fee.student_type}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {n} installment{n === 1 ? "" : "s"} · {fee.period_type}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-[13px] font-semibold tabular-nums">
                  {fee.currency} {Number(fee.total_amount).toLocaleString()}
                </span>
              </div>
            );
          })}
          <SummaryCardLink onClick={() => onNavigateTab("fees")}>See payment schedule</SummaryCardLink>
        </div>
      </SectionSummaryCard>

      {isCourse && (
        <SectionSummaryCard
          icon={CalendarDays}
          title="Next intake"
          count={intakes.length}
          badge={<VisibilityToggle section="intakes" visibility={visibility} />}
          emptyText="No intakes configured yet."
          onAdd={() => onNavigateTab("intakes")}
        >
          <NextIntakePreview intakes={intakes} />
        </SectionSummaryCard>
      )}
    </>
  );
}
