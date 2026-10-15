// The portal's course editor, pointed at the superadmin endpoints: same method names and shapes as
// the portal API (see ServiceEditorApi), built on the mock-aware businessesApi so NEXT_PUBLIC_MOCK_DATA
// works here like on the rest of the admin pages. Lookups come from the admin catalog (categoriesApi).

import { categoriesApi } from "@/app/admin/platform/categories/apis";
import type { ServiceEditorApi } from "@/app/business/profile/components/services/service-editor-context";
import { businessesApi } from "./index";

type Kind = "business" | "institution";
type Api = ServiceEditorApi;
type B = typeof businessesApi;

export function adminServiceEditorApi(kind: Kind, orgId: number): ServiceEditorApi {
  const inst = kind === "institution";
  // Every business method has an institution twin named with "Institution" before "Service".
  const m = <K extends keyof B>(name: K) => {
    const key = (inst ? String(name).replace(/Service/, "InstitutionService") : name) as keyof B;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- twins share one signature
    return (...args: any[]) => (businessesApi[key] as (...a: any[]) => any)(orgId, ...args);
  };
  const child = (list: keyof B, create: keyof B, update: keyof B, remove: keyof B) => ({
    list: m(list), create: m(create), update: m(update), remove: m(remove),
  });

  return {
    getService: m("getService"),
    createService: m("createService"),
    updateService: m("updateService"),
    getServiceFieldValues: m("getServiceFieldValues"),
    updateServiceFieldValues: m("updateServiceFieldValues"),
    generateServiceDescription: (input) => businessesApi.generateServiceDescription(input),
    approveServices: (ids) => inst
      ? businessesApi.approveInstitutionServices(orgId, ids)
      : Promise.resolve({ approved: 0 }), // a business's own services have no approval step

    serviceFees: child("getServiceFees", "createServiceFee", "updateServiceFee", "deleteServiceFee") as Api["serviceFees"],
    serviceIntakes: child("getServiceIntakes", "createServiceIntake", "updateServiceIntake", "deleteServiceIntake") as Api["serviceIntakes"],
    serviceEligibility: child("getServiceEligibility", "createServiceEligibility", "updateServiceEligibility", "deleteServiceEligibility") as Api["serviceEligibility"],
    serviceStudyOptions: child("getServiceStudyOptions", "createServiceStudyOption", "updateServiceStudyOption", "deleteServiceStudyOption") as Api["serviceStudyOptions"],
    serviceStudyUnits: child("getServiceStudyUnits", "createServiceStudyUnit", "updateServiceStudyUnit", "deleteServiceStudyUnit") as Api["serviceStudyUnits"],

    getServiceAccreditations: m("getServiceAccreditations"),
    linkServiceAccreditation: (serviceId, accreditation_id) => m("createServiceAccreditation")(serviceId, { accreditation_id }),
    unlinkServiceAccreditation: m("deleteServiceAccreditation"),

    getServiceMedia: m("getServiceMedia"),
    uploadServiceMedia: m("uploadServiceMedia"),
    deleteServiceMedia: m("deleteServiceMedia"),

    // Active only, like the portal's own lookup (and the old admin editor's category options).
    getServiceCategories: (params) => categoriesApi.getServiceCategories({ active: true, ...params }),
    getLookups: (kindOfLookup, params) => categoriesApi.getLookups(kindOfLookup, params),
    getAccreditations: (params) => categoriesApi.getAccreditations(params),
    createAccreditation: (input) => categoriesApi.createAccreditation(input),
    getIssuingOrganizations: (params) => categoriesApi.getIssuingOrganizations(params),
    createIssuingOrganization: (name) => categoriesApi.createIssuingOrganization(name),
    getFeeTypes: (params) => categoriesApi.getFeeTypes(params),
  };
}
