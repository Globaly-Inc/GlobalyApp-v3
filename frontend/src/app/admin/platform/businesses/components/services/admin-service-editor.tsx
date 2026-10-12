"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ServiceEditorProvider, type ServiceEditor, type ServiceEditorOrg,
} from "@/app/business/profile/components/services/service-editor-context";
import { InstitutionServiceFormView } from "@/app/business/profile/components/services/institution-service-form-view";
import { ServiceFormView } from "@/app/business/profile/components/services/service-form-view";
import { coursePublicSlug } from "@/app/business/profile/utils";
import { businessesApi } from "../../apis";
import { adminServiceEditorApi } from "../../apis/service-editor-api";

type Kind = "business" | "institution";

/** Superadmin's course add/edit page: the portal's own editor (same design, same tabs), pointed at
 *  the admin endpoints for this org. `readOnly` (?view=1, a claimed org) disables every control. */
export function AdminServiceEditor({
  kind, orgId, serviceId, readOnly = false,
}: Readonly<{ kind: Kind; orgId: number; serviceId?: string; readOnly?: boolean }>) {
  const [org, setOrg] = useState<ServiceEditorOrg | null>(null);

  useEffect(() => {
    const load = kind === "institution" ? businessesApi.getInstitutionDetail(orgId) : businessesApi.getBusinessDetail(orgId);
    load.then(setOrg).catch(() => setOrg(null));
  }, [kind, orgId]);

  const api = useMemo(() => adminServiceEditorApi(kind, orgId), [kind, orgId]);

  const value = useMemo<ServiceEditor>(() => ({
    api,
    org,
    services: [], // the editor fetches the course itself
    readOnly,
    servicesHref: `/admin/platform/businesses/${orgId}?${kind === "institution" ? "kind=institution&" : ""}tab=services`,
    // An unpublished org's course needs a preview token; only institutions can mint one here.
    coursePreviewHref: async (name, id) => {
      const path = `/course/${coursePublicSlug(name, id)}`;
      if (kind !== "institution") return path;
      try {
        const { preview_token } = await businessesApi.mintInstitutionPreviewToken(orgId);
        return `${path}?preview_token=${encodeURIComponent(preview_token)}`;
      } catch {
        return path;
      }
    },
  }), [api, org, readOnly, orgId, kind]);

  return (
    <ServiceEditorProvider value={value}>
      {kind === "institution"
        ? <InstitutionServiceFormView businessId={orgId} serviceId={serviceId} />
        : <ServiceFormView businessId={orgId} serviceId={serviceId} />}
    </ServiceEditorProvider>
  );
}
