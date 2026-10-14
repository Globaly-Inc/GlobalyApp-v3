"use client";

import { CourseFeesTab } from "./tabs/course-fees-tab";
import { IntakesTab } from "./tabs/intakes-tab";
import { EligibilityTab } from "./tabs/eligibility-tab";
import { StudyOptionsTab } from "./tabs/study-options-tab";
import { StudyUnitsTab } from "./tabs/study-units-tab";
import { AccreditationsTab } from "./tabs/accreditations-tab";
import { ServiceSummaryBodyExtras } from "./service-summary-extras";
import { InstitutionDescriptionSection } from "./institution-description-section";
import type { InstitutionServiceForm } from "./use-institution-service-form";

/** Main column of the institution form: whichever tab is selected (only Summary exists before the first save). */
export function InstitutionServiceTabPanel({ f, serviceId }: Readonly<{ f: InstitutionServiceForm; serviceId?: string }>) {
  const { isEdit, isCourse, tab } = f;
  if (tab === "summary") {
    return (
      <>
        <InstitutionDescriptionSection f={f} />
        {isEdit && serviceId && (
          <ServiceSummaryBodyExtras serviceId={serviceId} isCourse={isCourse} degreeLevels={f.degreeLevels} onNavigateTab={f.setTab} visibility={f.sectionVisibility} />
        )}
      </>
    );
  }
  if (!isEdit || !serviceId) return null;
  if (tab === "fees") return <CourseFeesTab serviceId={serviceId} isCourse={isCourse} />;
  if (tab === "intakes") return <IntakesTab serviceId={serviceId} allowMonth />;
  if (tab === "eligibility") return <EligibilityTab serviceId={serviceId} />;
  if (tab === "study-options") return <StudyOptionsTab serviceId={serviceId} />;
  if (tab === "study-units") return <StudyUnitsTab serviceId={serviceId} />;
  return <AccreditationsTab serviceId={serviceId} />;
}
