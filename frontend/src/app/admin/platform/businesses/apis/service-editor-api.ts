// The portal's course editor, pointed at the superadmin endpoints: same method names and shapes as
// the portal API (see ServiceEditorApi), but every path is under /admin/platform/{kind}s/:id
// instead of the caller's own org. The lookups come from the admin catalog (categoriesApi).

import { httpDelete, httpGet, httpPatch, httpPost, httpPostForm, httpPut } from "@/lib/api/http";
import { categoriesApi } from "@/app/admin/platform/categories/apis";
import type { ServiceEditorApi } from "@/app/business/profile/components/services/service-editor-context";

type Kind = "business" | "institution";

function child<TRow, TInput, TPatch>(base: string, path: string) {
  return {
    list: (serviceId: string): Promise<TRow[]> => httpGet(`${base}/services/${serviceId}/${path}`),
    create: (serviceId: string, input: TInput): Promise<TRow> => httpPost(`${base}/services/${serviceId}/${path}`, input),
    // Institution child ids are uuids, business ones serial ints — the path takes either as-is.
    update: (serviceId: string, id: number, patch: TPatch): Promise<TRow> =>
      httpPatch(`${base}/services/${serviceId}/${path}/${id}`, patch),
    remove: (serviceId: string, id: number): Promise<void> => httpDelete(`${base}/services/${serviceId}/${path}/${id}`),
  };
}

export function adminServiceEditorApi(kind: Kind, orgId: number): ServiceEditorApi {
  const base = `/admin/platform/${kind === "institution" ? "institutions" : "businesses"}/${orgId}`;
  type Api = ServiceEditorApi;
  return {
    getService: (serviceId) => httpGet(`${base}/services/${serviceId}`),
    createService: (input) => httpPost(`${base}/services`, input),
    updateService: (serviceId, patch) => httpPatch(`${base}/services/${serviceId}`, patch),
    getServiceFieldValues: (serviceId) => httpGet(`${base}/services/${serviceId}/field-values`),
    updateServiceFieldValues: (serviceId, values) => httpPut(`${base}/services/${serviceId}/field-values`, { values }),
    generateServiceDescription: (input) => httpPost("/admin/platform/services/ai-assist", input),
    approveServices: (ids) => kind === "institution"
      ? httpPost(`${base}/services/approve`, { ids })
      : Promise.resolve({ approved: 0 }), // a business's own services have no approval step

    serviceFees: child(base, "fees") as Api["serviceFees"],
    serviceIntakes: child(base, "intakes") as Api["serviceIntakes"],
    serviceEligibility: child(base, "eligibility") as Api["serviceEligibility"],
    serviceStudyOptions: child(base, "study-options") as Api["serviceStudyOptions"],
    serviceStudyUnits: child(base, "study-units") as Api["serviceStudyUnits"],

    getServiceAccreditations: (serviceId) => httpGet(`${base}/services/${serviceId}/accreditations`),
    linkServiceAccreditation: (serviceId, accreditation_id) =>
      httpPost(`${base}/services/${serviceId}/accreditations`, { accreditation_id }),
    unlinkServiceAccreditation: (serviceId, id) => httpDelete(`${base}/services/${serviceId}/accreditations/${id}`),

    getServiceMedia: (serviceId) => httpGet(`${base}/services/${serviceId}/media`),
    uploadServiceMedia: (serviceId, file) => {
      const form = new FormData();
      form.append("file", file);
      return httpPostForm(`${base}/services/${serviceId}/media`, form);
    },
    deleteServiceMedia: (serviceId, fileId) => httpDelete(`${base}/services/${serviceId}/media/${fileId}`),

    getServiceCategories: (params) => categoriesApi.getServiceCategories(params),
    getLookups: (kindOfLookup, params) => categoriesApi.getLookups(kindOfLookup, params),
    getAccreditations: (params) => categoriesApi.getAccreditations(params),
    createAccreditation: (input) => categoriesApi.createAccreditation(input),
    getIssuingOrganizations: (params) => categoriesApi.getIssuingOrganizations(params),
    createIssuingOrganization: (name) => categoriesApi.createIssuingOrganization(name),
    getFeeTypes: (params) => categoriesApi.getFeeTypes(params),
  };
}
