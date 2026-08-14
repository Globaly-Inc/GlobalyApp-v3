import type {
  Accreditation, AccreditationInput, Category, CategoryInput, CountryOption,
  FeeType, FeeTypeInput, IssuingOrganization, ListParams, Lookup, LookupInput, LookupKind,
  ModerationStatus, Paginated, SchemaField, SchemaFieldInput, ScopedListParams, SearchListParams,
} from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function paginate<T>(rows: T[], { page = 1, limit = 20 }: ListParams): Paginated<T> {
  const offset = (page - 1) * limit;
  return {
    data: rows.slice(offset, offset + limit),
    meta: { page, limit, total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / limit)) },
  };
}

function searchByName<T extends { name: string }>(rows: T[], search?: string): T[] {
  if (!search) return rows;
  const needle = search.toLowerCase();
  return rows.filter((r) => r.name.toLowerCase().includes(needle));
}

let nextId = 100;
const newId = () => ++nextId;

function patchRow<T extends { id: number }>(table: T[], id: number, changes: Partial<NoInfer<T>>): T {
  const index = table.findIndex((row) => row.id === id);
  const updated = { ...table[index]!, ...changes };
  table[index] = updated;
  return updated;
}

function removeRow<T extends { id: number }>(table: T[], id: number) {
  table.splice(table.findIndex((row) => row.id === id), 1);
}

const businessCategories: Category[] = [
  { id: 1, slug: "education-agent", name: "Education Agent", description: "Recruitment and placement agencies.", icon: "Users", is_active: true, sort_order: 0, schema_fields: [] },
  { id: 2, slug: "institution", name: "Institution", description: "Universities, colleges and schools.", icon: "GraduationCap", is_active: true, sort_order: 1, schema_fields: [] },
  { id: 3, slug: "immigration-department", name: "Immigration Department", description: null, icon: "Landmark", is_active: false, sort_order: 2, schema_fields: [] },
];

const serviceCategories: Category[] = [
  { id: 1, slug: "courses", name: "Courses", description: "Academic programs offered by institutions.", icon: "BookOpen", is_active: true, sort_order: 0, schema_fields: [] },
  { id: 2, slug: "accommodation", name: "Accommodation", description: "Student housing and homestay.", icon: "Home", is_active: true, sort_order: 1, schema_fields: [] },
  // Personal-scope rows — what a person may sell through Earn, listed under Other Service Categories.
  { id: 11, slug: "airport-pickup", name: "Airport Pickup", description: "Meeting arrivals and driving on.", icon: "Plane", is_active: true, sort_order: 1, schema_fields: [], scope: "personal" },
  { id: 12, slug: "assignment-help", name: "Assignment Help", description: "Tutoring and assignment review.", icon: "BookOpen", is_active: true, sort_order: 5, schema_fields: [], scope: "personal" },
];

const degreeLevels: Lookup[] = [
  { id: 1, name: "Foundation", slug: "foundation", sort_order: 0, is_active: true },
  { id: 2, name: "Bachelor", slug: "bachelor", sort_order: 1, is_active: true },
  { id: 3, name: "Master", slug: "master", sort_order: 2, is_active: true },
];

const areasOfStudy: Lookup[] = [
  { id: 1, name: "Business and Management", slug: "business_and_management", sort_order: 0, is_active: true },
  { id: 2, name: "Information Technology", slug: "information_technology", sort_order: 1, is_active: true },
];

const feeTypes: FeeType[] = [
  { id: 1, name: "Tuition Fee", slug: "tuition_fee", business_id: null, status: "approved", is_global: true, sort_order: 0 },
  { id: 2, name: "Application Fee", slug: "application_fee", business_id: null, status: "approved", is_global: true, sort_order: 1 },
  { id: 3, name: "Studio Access Levy", slug: "studio_access_levy", business_id: 42, status: "pending", is_global: false, sort_order: 2 },
];

const issuingOrganizations: IssuingOrganization[] = [
  { id: 1, name: "AACSB International", logo_url: null, website: "https://www.aacsb.edu" },
  { id: 2, name: "TEQSA", logo_url: null, website: null },
];

const accreditations: Accreditation[] = [
  { id: 1, name: "AACSB Accreditation", issuing_organization_id: 1, issuing_organization_name: "AACSB International", issuing_organization_logo_url: null, website: null, description: "Business school accreditation.", business_id: null, is_global: true, status: "approved", sort_order: 0, scope_country_ids: [] },
  { id: 2, name: "TEQSA Registration", issuing_organization_id: 2, issuing_organization_name: "TEQSA", issuing_organization_logo_url: null, website: null, description: null, business_id: 42, is_global: false, status: "pending", sort_order: 1, scope_country_ids: [1] },
];

const countries: CountryOption[] = [
  { id: 1, name: "Australia", iso2: "AU" },
  { id: 2, name: "United Kingdom", iso2: "GB" },
  { id: 3, name: "Canada", iso2: "CA" },
  { id: 4, name: "New Zealand", iso2: "NZ" },
];

const defaultServicesByBusinessCategory: Record<number, number[]> = {
  1: [1, 2],
};

const schemaFieldsByCategory: Record<string, SchemaField[]> = {};

const lookupTable = (kind: LookupKind) => (kind === "degree-levels" ? degreeLevels : areasOfStudy);
const categoryTable = (kind: "business" | "service") => (kind === "business" ? businessCategories : serviceCategories);
const schemaFieldsKey = (kind: "business" | "service", categoryId: number) => `${kind}:${categoryId}`;

export const categoriesMockApi = {
  getBusinessCategories: async ({ search, ...params }: SearchListParams = {}): Promise<Paginated<Category>> => {
    console.log("[mock] getBusinessCategories", search, params);
    await delay(300);
    return paginate(searchByName(businessCategories, search), params);
  },
  getServiceCategories: async ({ search, scope = "business", ...params }: ScopedListParams = {}): Promise<Paginated<Category>> => {
    console.log("[mock] getServiceCategories", scope, search, params);
    await delay(300);
    // Mirrors the server's default: a caller that doesn't say gets the business taxonomy.
    const rows = serviceCategories.filter((c) => (c.scope ?? "business") === scope);
    return paginate(searchByName(rows, search), params);
  },
  createCategory: async (kind: "business" | "service", input: CategoryInput): Promise<Category> => {
    console.log("[mock] createCategory", kind, input);
    await delay(300);
    const row: Category = { ...input, id: newId(), schema_fields: [] };
    categoryTable(kind).push(row);
    return row;
  },
  updateCategory: async (kind: "business" | "service", id: number, input: Partial<CategoryInput>): Promise<Category> => {
    console.log("[mock] updateCategory", kind, id, input);
    await delay(300);
    return patchRow(categoryTable(kind), id, input);
  },

  getSchemaFields: async (kind: "business" | "service", categoryId: number): Promise<SchemaField[]> => {
    console.log("[mock] getSchemaFields", kind, categoryId);
    await delay(300);
    return schemaFieldsByCategory[schemaFieldsKey(kind, categoryId)] ?? [];
  },
  createSchemaField: async (kind: "business" | "service", categoryId: number, input: SchemaFieldInput): Promise<SchemaField> => {
    console.log("[mock] createSchemaField", kind, categoryId, input);
    await delay(300);
    const row: SchemaField = { ...input, id: newId() };
    const key = schemaFieldsKey(kind, categoryId);
    schemaFieldsByCategory[key] = [...(schemaFieldsByCategory[key] ?? []), row];
    return row;
  },
  updateSchemaField: async (id: number, input: Partial<SchemaFieldInput>): Promise<SchemaField> => {
    console.log("[mock] updateSchemaField", id, input);
    await delay(300);
    for (const key of Object.keys(schemaFieldsByCategory)) {
      const rows = schemaFieldsByCategory[key]!;
      const index = rows.findIndex((row) => row.id === id);
      if (index === -1) continue;
      const updated = { ...rows[index]!, ...input };
      rows[index] = updated;
      return updated;
    }
    throw new Error(`Schema field ${id} not found`);
  },
  deleteSchemaField: async (id: number): Promise<void> => {
    console.log("[mock] deleteSchemaField", id);
    await delay(300);
    for (const key of Object.keys(schemaFieldsByCategory)) {
      schemaFieldsByCategory[key] = schemaFieldsByCategory[key]!.filter((row) => row.id !== id);
    }
  },

  getDefaultServices: async (businessCategoryId: number): Promise<Category[]> => {
    console.log("[mock] getDefaultServices", businessCategoryId);
    await delay(300);
    const ids = defaultServicesByBusinessCategory[businessCategoryId] ?? [];
    return serviceCategories.filter((c) => ids.includes(c.id));
  },
  setDefaultServices: async (businessCategoryId: number, serviceCategoryIds: number[]): Promise<void> => {
    console.log("[mock] setDefaultServices", businessCategoryId, serviceCategoryIds);
    await delay(300);
    defaultServicesByBusinessCategory[businessCategoryId] = serviceCategoryIds;
  },

  getLookups: async (kind: LookupKind, params: ListParams = {}): Promise<Paginated<Lookup>> => {
    console.log("[mock] getLookups", kind, params);
    await delay(300);
    return paginate(lookupTable(kind), params);
  },
  createLookup: async (kind: LookupKind, input: LookupInput): Promise<Lookup> => {
    console.log("[mock] createLookup", kind, input);
    await delay(300);
    const row = { ...input, id: newId() };
    lookupTable(kind).push(row);
    return row;
  },
  updateLookup: async (kind: LookupKind, id: number, input: Partial<LookupInput>): Promise<Lookup> => {
    console.log("[mock] updateLookup", kind, id, input);
    await delay(300);
    return patchRow(lookupTable(kind), id, input);
  },

  getFeeTypes: async (params: ListParams = {}): Promise<Paginated<FeeType>> => {
    console.log("[mock] getFeeTypes", params);
    await delay(300);
    return paginate(feeTypes, params);
  },
  createFeeType: async (input: FeeTypeInput): Promise<FeeType> => {
    console.log("[mock] createFeeType", input);
    await delay(300);
    const row: FeeType = { ...input, id: newId(), business_id: null, status: "approved" };
    feeTypes.push(row);
    return row;
  },
  updateFeeType: async (id: number, input: Partial<FeeTypeInput>): Promise<FeeType> => {
    console.log("[mock] updateFeeType", id, input);
    await delay(300);
    return patchRow(feeTypes, id, input);
  },
  reviewFeeType: async (id: number, decision: ModerationStatus): Promise<FeeType> => {
    console.log("[mock] reviewFeeType", id, decision);
    await delay(300);
    return patchRow(feeTypes, id, { status: decision, is_global: decision === "approved" });
  },
  deleteFeeType: async (id: number): Promise<void> => {
    console.log("[mock] deleteFeeType", id);
    await delay(300);
    removeRow(feeTypes, id);
  },

  getAccreditations: async (params: ListParams = {}): Promise<Paginated<Accreditation>> => {
    console.log("[mock] getAccreditations", params);
    await delay(300);
    return paginate(accreditations, params);
  },
  createAccreditation: async (input: AccreditationInput): Promise<Accreditation> => {
    console.log("[mock] createAccreditation", input);
    await delay(300);
    const org = issuingOrganizations.find((o) => o.id === input.issuing_organization_id);
    const row: Accreditation = {
      ...input, id: newId(), business_id: null, status: "approved",
      is_global: input.scope_country_ids.length === 0,
      issuing_organization_name: org?.name ?? null,
      issuing_organization_logo_url: org?.logo_url ?? null,
    };
    accreditations.push(row);
    return row;
  },
  updateAccreditation: async (id: number, input: Partial<AccreditationInput>): Promise<Accreditation> => {
    console.log("[mock] updateAccreditation", id, input);
    await delay(300);
    const org = issuingOrganizations.find((o) => o.id === input.issuing_organization_id);
    return patchRow(accreditations, id, {
      ...input,
      ...(input.scope_country_ids ? { is_global: input.scope_country_ids.length === 0 } : {}),
      ...(org ? { issuing_organization_name: org.name } : {}),
    });
  },
  reviewAccreditation: async (id: number, decision: ModerationStatus): Promise<Accreditation> => {
    console.log("[mock] reviewAccreditation", id, decision);
    await delay(300);
    return patchRow(accreditations, id, { status: decision, is_global: decision === "approved" });
  },
  deleteAccreditation: async (id: number): Promise<void> => {
    console.log("[mock] deleteAccreditation", id);
    await delay(300);
    removeRow(accreditations, id);
  },

  getIssuingOrganizations: async ({ search, ...params }: SearchListParams = {}): Promise<Paginated<IssuingOrganization>> => {
    console.log("[mock] getIssuingOrganizations", search, params);
    await delay(300);
    return paginate(searchByName(issuingOrganizations, search), params);
  },
  createIssuingOrganization: async (name: string): Promise<IssuingOrganization> => {
    console.log("[mock] createIssuingOrganization", name);
    await delay(300);
    const row = { id: newId(), name, logo_url: null, website: null };
    issuingOrganizations.push(row);
    return row;
  },

  getCountries: async (): Promise<CountryOption[]> => {
    console.log("[mock] getCountries");
    await delay(300);
    return [...countries];
  },
};
