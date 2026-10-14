"use client";

import { ServiceFormPage } from "./service-form/service-form-page";
import { useServiceForm } from "./service-form/use-service-form";

export function ServiceFormView({ businessId, serviceId }: Readonly<{ businessId: number; serviceId?: string }>) {
  const { business, ...model } = useServiceForm(businessId, serviceId);
  return (
    <ServiceFormPage
      kind="business"
      orgId={businessId}
      serviceId={serviceId}
      model={model}
      backHref={`/admin/platform/businesses/${businessId}?tab=services`}
      org={business}
      orgName={business?.business_name ?? "Business"}
      onPreview={() => model.setPreviewMode((v) => !v)}
      showCategoryExtraFields
    />
  );
}
