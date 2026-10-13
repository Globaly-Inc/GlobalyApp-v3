"use client";

import type { ReactNode } from "react";
import { SectionTabs } from "@/components/section-tabs";
import { ServiceFeesTab } from "../services/service-fees-tab";
import { ServiceIntakesTab } from "../services/service-intakes-tab";
import { ServiceEligibilityTab } from "../services/service-eligibility-tab";
import { ServiceStudyOptionsTab } from "../services/service-study-options-tab";
import { ServiceStudyUnitsTab } from "../services/service-study-units-tab";
import { ServiceAccreditationsTab } from "../services/service-accreditations-tab";

export type ServiceTab = "summary" | "fees" | "intakes" | "eligibility" | "study-options" | "study-units" | "accreditations";
type Kind = "business" | "institution";

export function ServiceSectionTabs({ isCourse, tab, onChange }: Readonly<{ isCourse: boolean; tab: ServiceTab; onChange: (tab: ServiceTab) => void }>) {
  return (
    <SectionTabs
      className="mb-0"
      options={[
        { value: "summary", label: "Summary" },
        { value: "fees", label: isCourse ? "Course Fees" : "Fees" },
        ...(isCourse ? [
          { value: "intakes", label: "Intakes" },
          { value: "eligibility", label: "Eligibility" },
          { value: "study-options", label: "Study Options" },
          { value: "study-units", label: "Study Units" },
          { value: "accreditations", label: "Accreditations" },
        ] as const : []),
      ]}
      value={tab}
      onChange={onChange}
    />
  );
}

/** The main column for the active tab; `summary` is the Summary tab's content. */
export function ServiceTabPanel({
  tab, kind, orgId, serviceId, isEdit, isCourse, summary,
}: Readonly<{ tab: ServiceTab; kind: Kind; orgId: number; serviceId?: string; isEdit: boolean; isCourse: boolean; summary: ReactNode }>) {
  if (tab === "summary") return summary;
  if (!isEdit || !serviceId) return null;
  switch (tab) {
    case "fees": return <ServiceFeesTab kind={kind} orgId={orgId} serviceId={serviceId} isCourse={isCourse} />;
    case "intakes": return <ServiceIntakesTab kind={kind} orgId={orgId} serviceId={serviceId} />;
    case "eligibility": return <ServiceEligibilityTab kind={kind} orgId={orgId} serviceId={serviceId} />;
    case "study-options": return <ServiceStudyOptionsTab kind={kind} orgId={orgId} serviceId={serviceId} />;
    case "study-units": return <ServiceStudyUnitsTab kind={kind} orgId={orgId} serviceId={serviceId} />;
    default: return <ServiceAccreditationsTab kind={kind} orgId={orgId} serviceId={serviceId} />;
  }
}
