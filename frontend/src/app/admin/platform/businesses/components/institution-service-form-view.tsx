"use client";

import { Link2 } from "lucide-react";
import { ServiceFormPage } from "./service-form/service-form-page";
import { useInstitutionServiceForm } from "./service-form/use-institution-service-form";

// Institution twin of service-form-view.tsx — same business_services tenant table and form
// shape, only the owning entity (institution vs business) and its thunks/routes differ.
export function InstitutionServiceFormView({ institutionId, serviceId }: Readonly<{ institutionId: number; serviceId?: string }>) {
  const { institution, savingCategory, handleOpenPublicPreview, ...model } = useInstitutionServiceForm(institutionId, serviceId);
  const socialUrls = institution
    ? [institution.linkedin_url, institution.facebook_url, institution.instagram_url, institution.twitter_url].filter(Boolean)
    : [];

  return (
    <ServiceFormPage
      kind="institution"
      orgId={institutionId}
      serviceId={serviceId}
      model={model}
      backHref={`/admin/platform/businesses/${institutionId}?kind=institution&tab=services`}
      org={institution}
      orgName={institution?.business_name ?? "Institution"}
      orgExtras={socialUrls.length > 0 && (
        <span className="ml-1 flex items-center gap-1.5">
          {socialUrls.map((url) => (
            <a
              key={url}
              href={url!}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-7 w-7 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:text-foreground"
            >
              <Link2 className="h-3.5 w-3.5" />
            </a>
          ))}
        </span>
      )}
      onPreview={() => (model.isCourse ? handleOpenPublicPreview() : model.setPreviewMode((v) => !v))}
      categoryDisabled={savingCategory}
      // Unlike the business twin, extraction_courses (this admin's storage — see
      // institution-courses.repository.ts) has no generic field-value table, only the fixed
      // columns wired up above (degree_level/area_of_study/awarded_by). A non-course
      // category's own schema_fields (e.g. Short Courses' course_type/certification) have
      // nowhere to persist yet, so this card is hidden here rather than shown and silently
      // dropped on save.
      showCategoryExtraFields={model.isCourse}
    />
  );
}
