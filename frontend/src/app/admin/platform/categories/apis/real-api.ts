import { httpDelete, httpGet, httpPatch, httpPost } from "@/lib/api/http";
import type {
  Accreditation, AccreditationInput, Category, CategoryInput, CountryOption,
  FeeType, FeeTypeInput, IssuingOrganization, Lookup, LookupInput, LookupKind,
  ModerationStatus,
} from "./types";

const BASE = "/admin/platform";

export const categoriesRealApi = {
  getBusinessCategories: async (): Promise<Category[]> =>
    (await httpGet<{ categories: Category[] }>(`${BASE}/business-categories`)).categories,
  getServiceCategories: async (): Promise<Category[]> =>
    (await httpGet<{ categories: Category[] }>(`${BASE}/service-categories`)).categories,
  createCategory: (kind: "business" | "service", input: CategoryInput): Promise<Category> =>
    httpPost(`${BASE}/${kind}-categories`, input),
  updateCategory: (kind: "business" | "service", id: number, input: Partial<CategoryInput>): Promise<Category> =>
    httpPatch(`${BASE}/${kind}-categories/${id}`, input),

  getLookups: async (kind: LookupKind): Promise<Lookup[]> =>
    (await httpGet<{ items: Lookup[] }>(`${BASE}/${kind}`)).items,
  createLookup: (kind: LookupKind, input: LookupInput): Promise<Lookup> =>
    httpPost(`${BASE}/${kind}`, input),
  updateLookup: (kind: LookupKind, id: number, input: Partial<LookupInput>): Promise<Lookup> =>
    httpPatch(`${BASE}/${kind}/${id}`, input),

  getFeeTypes: async (): Promise<FeeType[]> =>
    (await httpGet<{ items: FeeType[] }>(`${BASE}/fee-types`)).items,
  createFeeType: (input: FeeTypeInput): Promise<FeeType> => httpPost(`${BASE}/fee-types`, input),
  updateFeeType: (id: number, input: Partial<FeeTypeInput>): Promise<FeeType> =>
    httpPatch(`${BASE}/fee-types/${id}`, input),
  reviewFeeType: (id: number, decision: ModerationStatus): Promise<FeeType> =>
    httpPost(`${BASE}/fee-types/${id}/review`, { decision }),
  deleteFeeType: (id: number): Promise<void> => httpDelete(`${BASE}/fee-types/${id}`),

  getAccreditations: async (): Promise<Accreditation[]> =>
    (await httpGet<{ items: Accreditation[] }>(`${BASE}/accreditations`)).items,
  createAccreditation: (input: AccreditationInput): Promise<Accreditation> =>
    httpPost(`${BASE}/accreditations`, input),
  updateAccreditation: (id: number, input: Partial<AccreditationInput>): Promise<Accreditation> =>
    httpPatch(`${BASE}/accreditations/${id}`, input),
  reviewAccreditation: (id: number, decision: ModerationStatus): Promise<Accreditation> =>
    httpPost(`${BASE}/accreditations/${id}/review`, { decision }),
  deleteAccreditation: (id: number): Promise<void> => httpDelete(`${BASE}/accreditations/${id}`),

  getIssuingOrganizations: async (): Promise<IssuingOrganization[]> =>
    (await httpGet<{ items: IssuingOrganization[] }>(`${BASE}/issuing-organizations`)).items,
  createIssuingOrganization: (name: string): Promise<IssuingOrganization> =>
    httpPost(`${BASE}/issuing-organizations`, { name }),

  getCountries: async (): Promise<CountryOption[]> =>
    (await httpGet<{ countries: CountryOption[] }>(`${BASE}/countries`)).countries,
};
