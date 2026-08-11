import type {
  Accreditation, AccreditationInput, Category, CategoryInput, CountryOption,
  FeeType, FeeTypeInput, IssuingOrganization, Lookup, LookupInput, LookupKind,
  ModerationStatus,
} from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  { id: 1, slug: "education-agent", name: "Education Agent", description: "Recruitment and placement agencies.", icon: "Users", is_active: true, sort_order: 0 },
  { id: 2, slug: "institution", name: "Institution", description: "Universities, colleges and schools.", icon: "GraduationCap", is_active: true, sort_order: 1 },
  { id: 3, slug: "immigration-department", name: "Immigration Department", description: null, icon: "Landmark", is_active: false, sort_order: 2 },
];

const serviceCategories: Category[] = [
  { id: 1, slug: "courses", name: "Courses", description: "Academic programs offered by institutions.", icon: "BookOpen", is_active: true, sort_order: 0 },
  { id: 2, slug: "accommodation", name: "Accommodation", description: "Student housing and homestay.", icon: "Home", is_active: true, sort_order: 1 },
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

const lookupTable = (kind: LookupKind) => (kind === "degree-levels" ? degreeLevels : areasOfStudy);
const categoryTable = (kind: "business" | "service") => (kind === "business" ? businessCategories : serviceCategories);

export const categoriesMockApi = {
  getBusinessCategories: async (): Promise<Category[]> => {
    console.log("[mock] getBusinessCategories");
    await delay(300);
    return [...businessCategories];
  },
  getServiceCategories: async (): Promise<Category[]> => {
    console.log("[mock] getServiceCategories");
    await delay(300);
    return [...serviceCategories];
  },
  createCategory: async (kind: "business" | "service", input: CategoryInput): Promise<Category> => {
    console.log("[mock] createCategory", kind, input);
    await delay(300);
    const row = { ...input, id: newId() };
    categoryTable(kind).push(row);
    return row;
  },
  updateCategory: async (kind: "business" | "service", id: number, input: Partial<CategoryInput>): Promise<Category> => {
    console.log("[mock] updateCategory", kind, id, input);
    await delay(300);
    return patchRow(categoryTable(kind), id, input);
  },

  getLookups: async (kind: LookupKind): Promise<Lookup[]> => {
    console.log("[mock] getLookups", kind);
    await delay(300);
    return [...lookupTable(kind)];
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

  getFeeTypes: async (): Promise<FeeType[]> => {
    console.log("[mock] getFeeTypes");
    await delay(300);
    return [...feeTypes];
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

  getAccreditations: async (): Promise<Accreditation[]> => {
    console.log("[mock] getAccreditations");
    await delay(300);
    return [...accreditations];
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

  getIssuingOrganizations: async (): Promise<IssuingOrganization[]> => {
    console.log("[mock] getIssuingOrganizations");
    await delay(300);
    return [...issuingOrganizations];
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
