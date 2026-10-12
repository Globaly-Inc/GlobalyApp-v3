"use client";

import Link from "next/link";
import { Building2, Eye, GraduationCap, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/ui/back-button";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { StickySaveBar } from "@/components/ui/sticky-save-bar";
import { SectionTabs } from "@/components/section-tabs";
import { ServiceBasicsSection } from "./service-basics-section";
import { ServiceHeroCard } from "./service-hero-card";
import { ServiceSocialLinks } from "./service-social-links";
import { InstitutionServiceTabPanel } from "./institution-service-tab-panel";
import { InstitutionServiceSidebar } from "./institution-service-sidebar";
import { useInstitutionServiceForm, type InstitutionServiceTab } from "./use-institution-service-form";

// Institution twin of admin's institution-service-form-view.tsx — same fields and
// auto-save behavior, rewired to the self-service auth-scoped API (createService/updateService
// etc. resolve institution vs business server-side from the caller's own session, see
// backend's services.routes.ts) instead of admin's explicit institutionId-in-URL thunks.
export function InstitutionServiceFormView({ businessId, serviceId }: Readonly<{ businessId: number; serviceId?: string }>) {
  const f = useInstitutionServiceForm(businessId, serviceId);
  const { isEdit, isCourse, form, profile, servicesHref, readOnly } = f;
  const socialLinks = [profile?.linkedin_url, profile?.facebook_url, profile?.instagram_url, profile?.twitter_url].filter(Boolean) as string[];

  const openPreview = () => {
    if (!serviceId) return;
    // Same pattern as the profile's own Preview button and the service list's
    // name link — a real, separate public page (/course/{slug}), not an embedded
    // mock of it. Opens synchronously (inside the click gesture) so popup blockers
    // don't catch it, then redirects once the preview token comes back.
    const tab = window.open("", "_blank");
    f.coursePreviewHref(form.name, serviceId).then((href) => { if (tab) tab.location.href = href; });
  };

  const createButton = (
    <Button className="gap-2" disabled={!f.canSave || f.saving} onClick={f.handleSubmit}>
      {f.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
      {f.saving ? "Creating…" : "Create service"}
    </Button>
  );

  return (
    <PageBody>
      <PageHeader
        leading={<BackButton href={servicesHref} label="Back to services" />}
        title={<><GraduationCap /> {isEdit ? form.name || "Untitled service" : "Add service"}</>}
        badges={isEdit && (
          <Badge key={String(f.isPublished)} variant={f.isPublished ? "success" : "secondary"} className="animate-pop-in">
            {f.isPublished ? "Published" : "Draft"}
          </Badge>
        )}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="size-4 shrink-0" /> {profile?.business_name ?? "Institution"} · Services
            </span>
            <ServiceSocialLinks urls={socialLinks} />
          </span>
        }
      >
        {isEdit && serviceId && (
          <Button variant="outline" className="gap-2" onClick={openPreview}>
            <Eye className="h-4 w-4" />
            Preview
          </Button>
        )}
        {readOnly && <Badge variant="secondary">View only</Badge>}
        {!isEdit && !readOnly && createButton}
      </PageHeader>

      <ServiceHeroCard coverUrl={profile?.cover_url} logoUrl={profile?.logo_url} orgName={profile?.business_name ?? "Institution"} />

      <fieldset disabled={readOnly} className="contents">
      <ServiceBasicsSection
        categories={f.serviceCategories}
        categoryId={form.service_category_id}
        onCategoryChange={f.handleCategoryChange}
        categoryDisabled={f.savingCategory}
        name={form.name}
        onNameChange={(v) => f.set("name", v)}
        onNameBlur={f.handleNameBlur}
        nameLabel="Course name"
      />
      </fieldset>

      {isEdit && (
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
          value={f.tab}
          onChange={(v) => f.setTab(v as InstitutionServiceTab)}
        />
      )}

      <fieldset disabled={readOnly} className="contents">
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <div key={f.tab} className="stagger-in flex flex-col gap-6 lg:col-span-2">
          <InstitutionServiceTabPanel f={f} serviceId={serviceId} />
        </div>
        <InstitutionServiceSidebar f={f} serviceId={serviceId} />
      </div>
      </fieldset>

      {/* Edit mode has no global save — every card saves itself — so the bar only appears while creating. */}
      {!isEdit && !readOnly && (
        <StickySaveBar>
          <Button variant="outline" render={<Link href={servicesHref} />}>Cancel</Button>
          {createButton}
        </StickySaveBar>
      )}
    </PageBody>
  );
}
