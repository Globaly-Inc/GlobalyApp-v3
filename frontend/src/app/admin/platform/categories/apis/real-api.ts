import { httpDelete, httpGet, httpPatch, httpPost, httpPut } from "@/lib/api/http";
import type {
  Accreditation, AccreditationInput, Category, CategoryInput, CountryOption,
  FeeType, FeeTypeInput, IssuingOrganization, ListParams, Lookup, LookupInput, LookupKind,
  ModerationStatus, Paginated, SchemaField, SchemaFieldInput, ScopedListParams, SearchListParams,
} from "./types";

const BASE = "/admin/platform";

const entityType = (kind: "business" | "service") => `${kind}_categories` as const;

function toQuery(params: ScopedListParams): string {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.limit) search.set("limit", String(params.limit));
  if (params.search) search.set("search", params.search);
  if (params.scope) search.set("scope", params.scope);
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const categoriesRealApi = {
  getBusinessCategories: (params: SearchListParams = {}): Promise<Paginated<Category>> =>
    httpGet(`${BASE}/business-categories${toQuery(params)}`),
  /** Defaults to business scope server-side, so a caller that wants the personal list must say so. */
  getServiceCategories: (params: ScopedListParams = {}): Promise<Paginated<Category>> =>
    httpGet(`${BASE}/service-categories${toQuery(params)}`),
  createCategory: (kind: "business" | "service", input: CategoryInput): Promise<Category> =>
    httpPost(`${BASE}/${kind}-categories`, input),
  updateCategory: (kind: "business" | "service", id: number, input: Partial<CategoryInput>): Promise<Category> =>
    httpPatch(`${BASE}/${kind}-categories/${id}`, input),

  getDefaultServices: async (businessCategoryId: number): Promise<Category[]> =>
    (await httpGet<{ services: Category[] }>(`${BASE}/business-categories/${businessCategoryId}/default-services`)).services,
  setDefaultServices: async (businessCategoryId: number, serviceCategoryIds: number[]): Promise<void> => {
    await httpPut(`${BASE}/business-categories/${businessCategoryId}/default-services`, { service_category_ids: serviceCategoryIds });
  },

  getSchemaFields: async (kind: "business" | "service", categoryId: number): Promise<SchemaField[]> =>
    (await httpGet<{ schema_fields: SchemaField[] }>(`${BASE}/${entityType(kind)}/${categoryId}/schema-fields`)).schema_fields,
  createSchemaField: (kind: "business" | "service", categoryId: number, input: SchemaFieldInput): Promise<SchemaField> =>
    httpPost(`${BASE}/${entityType(kind)}/${categoryId}/schema-fields`, input),
  updateSchemaField: (id: number, input: Partial<SchemaFieldInput>): Promise<SchemaField> =>
    httpPatch(`${BASE}/schema-fields/${id}`, input),
  deleteSchemaField: (id: number): Promise<void> => httpDelete(`${BASE}/schema-fields/${id}`),

  getLookups: (kind: LookupKind, params: ListParams = {}): Promise<Paginated<Lookup>> =>
    httpGet(`${BASE}/${kind}${toQuery(params)}`),
  createLookup: (kind: LookupKind, input: LookupInput): Promise<Lookup> =>
    httpPost(`${BASE}/${kind}`, input),
  updateLookup: (kind: LookupKind, id: number, input: Partial<LookupInput>): Promise<Lookup> =>
    httpPatch(`${BASE}/${kind}/${id}`, input),

  getFeeTypes: (params: ListParams = {}): Promise<Paginated<FeeType>> =>
    httpGet(`${BASE}/fee-types${toQuery(params)}`),
  createFeeType: (input: FeeTypeInput): Promise<FeeType> => httpPost(`${BASE}/fee-types`, input),
  updateFeeType: (id: number, input: Partial<FeeTypeInput>): Promise<FeeType> =>
    httpPatch(`${BASE}/fee-types/${id}`, input),
  reviewFeeType: (id: number, decision: ModerationStatus): Promise<FeeType> =>
    httpPost(`${BASE}/fee-types/${id}/review`, { decision }),
  deleteFeeType: (id: number): Promise<void> => httpDelete(`${BASE}/fee-types/${id}`),

  getAccreditations: (params: ListParams = {}): Promise<Paginated<Accreditation>> =>
    httpGet(`${BASE}/accreditations${toQuery(params)}`),
  createAccreditation: (input: AccreditationInput): Promise<Accreditation> =>
    httpPost(`${BASE}/accreditations`, input),
  updateAccreditation: (id: number, input: Partial<AccreditationInput>): Promise<Accreditation> =>
    httpPatch(`${BASE}/accreditations/${id}`, input),
  reviewAccreditation: (id: number, decision: ModerationStatus): Promise<Accreditation> =>
    httpPost(`${BASE}/accreditations/${id}/review`, { decision }),
  deleteAccreditation: (id: number): Promise<void> => httpDelete(`${BASE}/accreditations/${id}`),

  getIssuingOrganizations: (params: SearchListParams = {}): Promise<Paginated<IssuingOrganization>> =>
    httpGet(`${BASE}/issuing-organizations${toQuery(params)}`),
  createIssuingOrganization: (name: string): Promise<IssuingOrganization> =>
    httpPost(`${BASE}/issuing-organizations`, { name }),

  getCountries: async (): Promise<CountryOption[]> =>
    (await httpGet<{ countries: CountryOption[] }>(`${BASE}/countries`)).countries,
};
