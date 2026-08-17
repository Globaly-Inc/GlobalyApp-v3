import { httpDelete, httpGet, httpPatch, httpPost, httpPut } from "@/lib/api/http";
import type {
  Accreditation, AccreditationInput, Category, CategoryInput, CityOption, CountryOption,
  FeeType, FeeTypeInput, IssuingOrganization, ListParams, Lookup, LookupInput, LookupKind,
  ModerationStatus, Paginated, SchemaField, SchemaFieldInput, SearchListParams,
} from "./types";

type CountryDto = { id: number; name: string; iso2: string; phone_code: string | null };
type CityDto = { id: number; name: string; state_name: string | null };

const BASE = "/admin/platform";

type CategoryEndpoint = "business" | "service" | "other-service";

const entityType = (kind: CategoryEndpoint) => kind === "other-service" ? "other_service_categories" as const : `${kind === "service" ? "service" : "business"}_categories` as const;

function toQuery(params: SearchListParams): string {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.limit) search.set("limit", String(params.limit));
  if (params.search) search.set("search", params.search);
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const categoriesRealApi = {
  getBusinessCategories: (params: SearchListParams = {}): Promise<Paginated<Category>> =>
    httpGet(`${BASE}/business-categories${toQuery({ limit: 10, ...params })}`),
  getServiceCategories: (params: SearchListParams = {}): Promise<Paginated<Category>> =>
    httpGet(`${BASE}/service-categories${toQuery(params)}`),
  getOtherServiceCategories: (params: SearchListParams = {}): Promise<Paginated<Category>> =>
    httpGet(`${BASE}/service-categories${toQuery({ limit: 10, ...params })}`),
  createCategory: (kind: "business" | "service" | "other-service", input: CategoryInput): Promise<Category> =>
    httpPost(`${BASE}/${kind}-categories`, input),
  updateCategory: (kind: CategoryEndpoint, id: number, input: Partial<CategoryInput>): Promise<Category> =>
    httpPatch(`${BASE}/${kind}-categories/${id}`, input),

  getDefaultServices: async (businessCategoryId: number): Promise<Category[]> =>
    (await httpGet<{ services: Category[] }>(`${BASE}/business-categories/${businessCategoryId}/default-services`)).services,
  setDefaultServices: async (businessCategoryId: number, serviceCategoryIds: number[]): Promise<void> => {
    await httpPut(`${BASE}/business-categories/${businessCategoryId}/default-services`, { service_category_ids: serviceCategoryIds });
  },

  getSchemaFields: async (kind: CategoryEndpoint, categoryId: number): Promise<SchemaField[]> =>
    (await httpGet<{ schema_fields: SchemaField[] }>(`${BASE}/${entityType(kind)}/${categoryId}/schema-fields`)).schema_fields,
  createSchemaField: (kind: CategoryEndpoint, categoryId: number, input: SchemaFieldInput): Promise<SchemaField> =>
    httpPost(`${BASE}/${entityType(kind)}/${categoryId}/schema-fields`, input),
  updateSchemaField: (id: number, input: Partial<SchemaFieldInput>): Promise<SchemaField> =>
    httpPatch(`${BASE}/schema-fields/${id}`, input),
  deleteSchemaField: (id: number): Promise<void> => httpDelete(`${BASE}/schema-fields/${id}`),

  getLookups: (kind: LookupKind, params: SearchListParams = {}): Promise<Paginated<Lookup>> =>
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

  getAccreditations: (params: SearchListParams = {}): Promise<Paginated<Accreditation>> =>
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
    (await httpGet<{ countries: CountryDto[] }>("/platform-users/countries")).countries.map((c) => ({
      id: c.id, name: c.name, iso2: c.iso2, phoneCode: c.phone_code,
    })),

  getCitiesByCountry: async (countryId: number): Promise<CityOption[]> =>
    (await httpGet<{ cities: CityDto[] }>(`${BASE}/countries/${countryId}/cities`)).cities.map((c) => ({
      id: c.id, name: c.name, stateName: c.state_name,
    })),
};
