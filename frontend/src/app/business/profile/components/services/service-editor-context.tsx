"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { businessProfileDetailApi } from "../../apis";
import { coursePublicHref } from "../../utils";
import { createService, updateService, updateServiceFieldValues } from "../../store/business-profile-detail-slice";
import type { BusinessService, SchemaFieldValue, ServiceInput, ServicePatch } from "../../apis/types";

/** The API calls the course editor (form views, tabs, summary cards) makes. */
type PortalApi = typeof businessProfileDetailApi;
export type ServiceEditorApi = Pick<PortalApi,
  | "getService" | "getServiceFieldValues" | "generateServiceDescription" | "approveServices"
  | "serviceFees" | "serviceIntakes" | "serviceEligibility" | "serviceStudyOptions" | "serviceStudyUnits"
  | "getServiceAccreditations" | "linkServiceAccreditation" | "unlinkServiceAccreditation"
  | "getServiceMedia" | "uploadServiceMedia" | "deleteServiceMedia"
  | "getServiceCategories" | "getLookups" | "getAccreditations" | "createAccreditation"
  | "getIssuingOrganizations" | "createIssuingOrganization" | "getFeeTypes"
> & {
  createService: (input: ServiceInput) => Promise<BusinessService>;
  updateService: (serviceId: string, patch: ServicePatch) => Promise<BusinessService>;
  updateServiceFieldValues: (serviceId: string, values: SchemaFieldValue[]) => Promise<SchemaFieldValue[]>;
};

/** The org the course belongs to, as the editor's hero shows it. */
export type ServiceEditorOrg = {
  business_name: string;
  logo_url?: string | null;
  cover_url?: string | null;
  linkedin_url?: string | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
  twitter_url?: string | null;
};

export type ServiceEditor = {
  api: ServiceEditorApi;
  org: ServiceEditorOrg | null;
  /** Where "Back to services" (and a finished create) goes. */
  servicesHref: string;
  /** Services already loaded for this org, so an edit can open without a fetch. */
  services: BusinessService[];
  /** Superadmin viewing a claimed org: every control disabled. */
  readOnly: boolean;
  /** The public /course page for Preview, with whatever token lets this viewer see a draft. */
  coursePreviewHref: (name: string, serviceId: string) => Promise<string>;
  /** In-page preview of a business service (it has no public page); absent → no Preview button. */
  renderPreview?: (serviceId: string) => ReactNode;
};

const Ctx = createContext<ServiceEditor | null>(null);

/** Superadmin (or any other host) renders the portal editor against its own endpoints. */
export function ServiceEditorProvider({ value, children }: Readonly<{ value: ServiceEditor; children: ReactNode }>) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The portal's own wiring: the auth-scoped portal API, with saves going through the Redux thunks
 *  so the Services list stays in sync. Used whenever no provider is mounted. */
function usePortalServiceEditor(businessId: number): ServiceEditor {
  const dispatch = useAppDispatch();
  const profile = useAppSelector((state) => state.businessOnboarding.profile);
  const services = useAppSelector((state) => state.businessProfileDetail.services.items);
  // Kept separate so `api` stays the same object when the list or profile changes.
  const api = useMemo<ServiceEditorApi>(() => ({
    ...businessProfileDetailApi,
    createService: (input) => dispatch(createService({ id: businessId, input })).unwrap(),
    updateService: (serviceId, patch) => dispatch(updateService({ id: businessId, serviceId, patch })).unwrap(),
    updateServiceFieldValues: (serviceId, values) =>
      dispatch(updateServiceFieldValues({ id: businessId, serviceId, values })).unwrap(),
  }), [dispatch, businessId]);
  return useMemo(() => ({
    api,
    org: profile ?? null,
    servicesHref: `/business/profile/${businessId}?tab=services`,
    services,
    readOnly: false,
    coursePreviewHref: coursePublicHref,
  }), [api, businessId, profile, services]);
}

/** `businessId` only matters for the portal fallback; a provider's value wins. */
export function useServiceEditor(businessId = 0): ServiceEditor {
  const provided = useContext(Ctx);
  const portal = usePortalServiceEditor(businessId);
  return provided ?? portal;
}
