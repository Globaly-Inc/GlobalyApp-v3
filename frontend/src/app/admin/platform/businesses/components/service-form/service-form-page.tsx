"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Briefcase, Eye, EyeOff, GraduationCap, Info, Save } from "lucide-react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { BackButton } from "@/components/ui/back-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { StickySaveBar } from "@/components/ui/sticky-save-bar";
import { Switch } from "@/components/ui/switch";
import { CategoryExtraFields } from "../services/category-extra-fields";
import { ServicePreviewView } from "../services/service-preview-view";
import { ServiceSummaryBodyExtras, ServiceSummarySidebarExtras } from "../services/service-summary-extras";
import { ServiceBasicsSection } from "./service-basics-section";
import { ServiceCourseDetails } from "./service-course-details";
import { ServiceDescriptionSection } from "./service-description-section";
import { ServiceOrgBanner } from "./service-org-banner";
import { ServicePublishSection } from "./service-publish-section";
import { ServiceSectionTabs, ServiceTabPanel } from "./service-tab-panels";
import type { useServiceForm } from "./use-service-form";

export type ServiceFormModel = Omit<ReturnType<typeof useServiceForm>, "business">;

/**
 * The page both service forms render (business and institution). Layout follows the W2 form pattern:
 * header → org banner → basics → tabs → main column + side column (visibility, course details, summary extras).
 */
export function ServiceFormPage({
  kind, orgId, serviceId, model: m, backHref, org, orgName, orgExtras, onPreview, categoryDisabled, showCategoryExtraFields,
}: Readonly<{
  kind: "business" | "institution";
  orgId: number;
  serviceId?: string;
  model: ServiceFormModel;
  backHref: string;
  org?: { cover_url: string | null; logo_url: string | null } | null;
  orgName: string;
  /** After the org name in the banner, e.g. the institution's social links. */
  orgExtras?: ReactNode;
  onPreview: () => void;
  categoryDisabled?: boolean;
  showCategoryExtraFields: boolean;
}>) {
  const TitleIcon = kind === "institution" ? GraduationCap : Briefcase;
  const createButton = (
    <Button className="cursor-pointer gap-1.5" disabled={!m.canSave || m.saving} onClick={m.handleSubmit}>
      <Save className="h-3.5 w-3.5" />
      {m.saving ? "Creating…" : "Create service"}
    </Button>
  );

  return (
    <PageBody>
      <PageHeader
        leading={<BackButton href={backHref} label="Back to services" />}
        title={<><TitleIcon /> {m.isEdit ? m.form.name || "Untitled service" : "Add service"}</>}
        badges={m.isEdit
          ? <Badge variant={m.isPublished ? "success" : "secondary"}>{m.isPublished ? "Published" : "Unpublished"}</Badge>
          : <Badge variant="outline">Draft</Badge>}
        subtitle={`${orgName} · Services`}
      >
        {/* The Visibility card lives in the side column, which preview replaces, so the switch moves up here. */}
        {m.previewMode && m.isEdit && serviceId && (
          <div className="flex items-center gap-2">
            <Label htmlFor="service-published-preview" className="text-sm">{m.isPublished ? "Published" : "Unpublished"}</Label>
            <Switch id="service-published-preview" checked={m.isPublished} disabled={m.publishing} onCheckedChange={m.handleTogglePublish} />
          </div>
        )}
        {m.isEdit && serviceId && (
          <Button variant="outline" size="sm" onClick={onPreview}>
            {m.previewMode ? <EyeOff className="mr-1 h-4 w-4" /> : <Eye className="mr-1 h-4 w-4" />}
            {m.previewMode ? "Exit preview" : "Preview"}
          </Button>
        )}
        {!m.isEdit && createButton}
      </PageHeader>

      {m.previewMode && (
        <Alert variant="info" className="flex items-center justify-between gap-3">
          <Info />
          <AlertTitle className="flex-1">You are previewing the public page</AlertTitle>
          <Button variant="outline" size="sm" onClick={() => m.setPreviewMode(false)}>
            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to service profile
          </Button>
        </Alert>
      )}

      {m.previewMode && serviceId ? (
        <ServicePreviewView kind={kind} orgId={orgId} serviceId={serviceId} embedded />
      ) : (
        <>
          <ServiceOrgBanner coverUrl={org?.cover_url} logoUrl={org?.logo_url} name={orgName} extras={orgExtras} />

          <ServiceBasicsSection
            categories={m.serviceCategories}
            categoryId={m.form.service_category_id}
            onCategoryChange={m.handleCategoryChange}
            categoryDisabled={categoryDisabled}
            name={m.form.name}
            onNameChange={(v) => m.set("name", v)}
            onNameBlur={m.handleNameBlur}
          />

          {m.isEdit && <ServiceSectionTabs isCourse={m.isCourse} tab={m.tab} onChange={m.setTab} />}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="flex flex-col gap-6 lg:col-span-2">
              <ServiceTabPanel
                tab={m.tab} kind={kind} orgId={orgId} serviceId={serviceId} isEdit={m.isEdit} isCourse={m.isCourse}
                summary={
                  <>
                    <ServiceDescriptionSection
                      isEdit={m.isEdit}
                      description={m.form.description}
                      onChange={(v) => m.set("description", v)}
                      editing={m.editingDescription}
                      onEditingChange={m.setEditingDescription}
                      generating={m.generatingDescription}
                      onWriteWithAi={m.handleWriteWithAi}
                      saving={m.savingDescription}
                      onSave={m.handleSaveDescription}
                    />
                    {m.isEdit && serviceId && (
                      <ServiceSummaryBodyExtras kind={kind} orgId={orgId} serviceId={serviceId} isCourse={m.isCourse} onNavigateTab={m.setTab} />
                    )}
                  </>
                }
              />
            </div>

            <div className="flex flex-col gap-6">
              {m.isEdit && serviceId && (
                <ServicePublishSection isPublished={m.isPublished} publishing={m.publishing} onToggle={m.handleTogglePublish} />
              )}
              {m.isCourse && (
                <ServiceCourseDetails
                  fieldValues={m.fieldValues} setFieldValues={m.setFieldValues} schemaFieldIdByKey={m.schemaFieldIdByKey}
                  degreeLevels={m.degreeLevels} areasOfStudy={m.areasOfStudy} accreditations={m.accreditations}
                  search={m.courseSearch} onSave={m.handleSaveCourseDetails}
                />
              )}
              {showCategoryExtraFields && (
                <CategoryExtraFields
                  fields={(m.selectedCategory?.schema_fields ?? []).filter((f) => !["degree_level", "area_of_study", "awarded_by"].includes(f.key))}
                  values={m.fieldValues}
                  onChangeField={(id, v) => m.setFieldValues((f) => ({ ...f, [id]: v }))}
                  onSave={m.handleSaveCourseDetails}
                />
              )}
              {m.isEdit && serviceId && (
                <ServiceSummarySidebarExtras
                  kind={kind} orgId={orgId} serviceId={serviceId}
                  name={m.form.name} hasCategory={!!m.form.service_category_id} description={m.form.description}
                  isCourse={m.isCourse} tab={m.tab} onNavigateTab={m.setTab}
                />
              )}
            </div>
          </div>
        </>
      )}

      {!m.isEdit && (
        <StickySaveBar>
          <Button variant="outline" render={<Link href={backHref} />}>Cancel</Button>
          {createButton}
        </StickySaveBar>
      )}
    </PageBody>
  );
}
