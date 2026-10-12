"use client";

import { useState } from "react";
import Link from "next/link";
import { Briefcase, Loader2, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BackButton } from "@/components/ui/back-button";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { StickySaveBar } from "@/components/ui/sticky-save-bar";
import { SectionTabs } from "@/components/section-tabs";
import { SummaryTab } from "./tabs/summary-tab";
import { ServiceHeaderActions } from "./service-header-actions";
import { ServiceExtraFields } from "./service-extra-fields";
import { CourseFeesTab } from "./tabs/course-fees-tab";
import { IntakesTab } from "./tabs/intakes-tab";
import { EligibilityTab } from "./tabs/eligibility-tab";
import { StudyOptionsTab } from "./tabs/study-options-tab";
import { StudyUnitsTab } from "./tabs/study-units-tab";
import { AccreditationsTab } from "./tabs/accreditations-tab";
import { ServiceBasicsSection } from "./service-basics-section";
import { ServiceHeroCard } from "./service-hero-card";
import { useServiceForm } from "./use-service-form";

const DETAIL_TABS = [
  { value: "summary", label: "Summary" },
  { value: "fees", label: "Course Fees" },
  { value: "intakes", label: "Intakes" },
  { value: "eligibility", label: "Eligibility" },
  { value: "study-options", label: "Study Options" },
  { value: "study-units", label: "Study Units" },
  { value: "accreditations", label: "Accreditations" },
] as const;
export type DetailTab = (typeof DETAIL_TABS)[number]["value"];

export function ServiceFormView({ businessId, serviceId }: Readonly<{ businessId: number; serviceId?: string }>) {
  const f = useServiceForm(businessId, serviceId);
  const { isEdit, form, set, servicesHref, readOnly } = f;
  const [detailTab, setDetailTab] = useState<DetailTab>("summary");

  const summaryProps = {
    description: form.description,
    onDescriptionChange: (v: string) => set("description", v),
    schemaFieldIdByKey: f.schemaFieldIdByKey,
    fieldValues: f.fieldValues,
    setFieldValues: f.setFieldValues,
    courseFieldOptions: f.courseFieldOptions,
    debouncedSearchCourseField: f.debouncedSearchCourseField,
    courseSearchLoading: f.courseSearchLoading,
    onWriteWithAi: f.handleWriteWithAi,
    generatingDescription: f.generatingDescription,
    extraFields: <ServiceExtraFields serviceId={serviceId} category={f.selectedCategory} values={f.fieldValues} setValues={f.setFieldValues} />,
  };

  const saveButton = readOnly ? <Badge variant="secondary">View only</Badge> : (
    <Button className="gap-2" disabled={!f.canSave || f.saving} onClick={f.handleSubmit}>
      {f.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
      {f.saving ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save changes" : "Create service"}
    </Button>
  );

  return (
    <PageBody>
      <PageHeader
        leading={<BackButton href={servicesHref} label="Back to services" />}
        title={<><Briefcase /> {isEdit ? form.name || "Untitled service" : "Add service"}</>}
        subtitle={`${f.profile?.business_name ?? "Business"} · Services`}
      >
        {isEdit && serviceId && <ServiceHeaderActions serviceId={serviceId} isPublished={f.isPublished} onPublishedChange={f.setIsPublished} />}
        {saveButton}
      </PageHeader>

      <ServiceHeroCard coverUrl={f.profile?.cover_url} logoUrl={f.profile?.logo_url} orgName={f.profile?.business_name ?? "Business"} />

      <fieldset disabled={readOnly} className="contents">
      <ServiceBasicsSection
        categories={f.serviceCategories}
        categoryId={form.service_category_id}
        onCategoryChange={(v) => set("service_category_id", v)}
        name={form.name}
        onNameChange={(v) => set("name", v)}
        nameLabel="Service name"
      />
      </fieldset>

      {isEdit && serviceId ? (
        <>
          <SectionTabs className="mb-0" options={DETAIL_TABS} value={detailTab} onChange={setDetailTab} />
          <fieldset disabled={readOnly} className="contents">
          {detailTab === "summary" ? (
            <div key={detailTab} className="animate-step-forward">
              <SummaryTab serviceId={serviceId} onNavigateTab={setDetailTab} {...summaryProps} />
            </div>
          ) : (
            <Card>
              <CardContent key={detailTab} className="animate-step-forward">
                {detailTab === "fees" && <CourseFeesTab serviceId={serviceId} />}
                {detailTab === "intakes" && <IntakesTab serviceId={serviceId} />}
                {detailTab === "eligibility" && <EligibilityTab serviceId={serviceId} />}
                {detailTab === "study-options" && <StudyOptionsTab serviceId={serviceId} />}
                {detailTab === "study-units" && <StudyUnitsTab serviceId={serviceId} />}
                {detailTab === "accreditations" && <AccreditationsTab serviceId={serviceId} />}
              </CardContent>
            </Card>
          )}
          </fieldset>
        </>
      ) : (
        <fieldset disabled={readOnly} className="contents">
          <SummaryTab serviceId={null} onNavigateTab={() => {}} {...summaryProps} />
        </fieldset>
      )}

      {!readOnly && <StickySaveBar status={isEdit ? "Fees, intakes and the other tabs save on their own." : undefined}>
        <Button variant="outline" render={<Link href={servicesHref} />}>Cancel</Button>
        {saveButton}
      </StickySaveBar>}
    </PageBody>
  );
}
