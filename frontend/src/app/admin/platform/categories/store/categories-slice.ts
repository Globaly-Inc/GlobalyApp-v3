import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { categoriesApi } from "../apis";
import type {
  Accreditation, AccreditationInput, Category, CategoryInput, CountryOption,
  FeeType, FeeTypeInput, IssuingOrganization, ListParams, Lookup, LookupInput, LookupKind,
  ModerationStatus, PaginationMeta, Test, TestInput,
} from "../apis/types";

type ListState<T> = { data: T[] } & PaginationMeta;

/** Which category list a mutation belongs to. "other_service" is the personal-portal taxonomy. */
export type CategoryKind = "business" | "service" | "other_service";

const PAGE_LIMIT = 10;
const ORG_DROPDOWN_LIMIT = 10;

const emptyList = <T,>(): ListState<T> => ({ data: [], page: 1, limit: PAGE_LIMIT, total: 0, totalPages: 1 });

export const fetchBusinessCategories = createAsyncThunk(
  "platformCategories/fetchBusinessCategories",
  (params: ListParams = {}) => categoriesApi.getBusinessCategories({ limit: PAGE_LIMIT, ...params }),
);
/**
 * Active business categories for dropdowns in OTHER screens (businesses list filter,
 * add-business picker, extraction jobs). Own slot so catalog-page paging/searching never
 * changes what those dropdowns show, and unpaginated so options aren't truncated at PAGE_LIMIT.
 */
export const fetchBusinessCategoryOptions = createAsyncThunk(
  "platformCategories/fetchBusinessCategoryOptions",
  // ponytail: one page of 100; revisit if the category catalog ever outgrows it
  async () => (await categoriesApi.getBusinessCategories({ limit: 100, active: true })).data,
);

export const fetchServiceCategories = createAsyncThunk(
  "platformCategories/fetchServiceCategories",
  (params: ListParams = {}) => categoriesApi.getServiceCategories({ limit: PAGE_LIMIT, ...params }),
);

/** Same as businessCategoryOptions but for service categories (service form picker,
 * add-business allowed-services card, business-category editor's default-services picker). */
export const fetchServiceCategoryOptions = createAsyncThunk(
  "platformCategories/fetchServiceCategoryOptions",
  async () => (await categoriesApi.getServiceCategories({ limit: 100, active: true })).data,
);

/**
 * The personal-portal list, in its own state slot rather than sharing serviceCategories.
 *
 * The business category editor reads serviceCategories to offer default services; if the two shared a slot,
 * whichever screen loaded last would decide what that picker showed.
 */
export const fetchOtherServiceCategories = createAsyncThunk(
  "platformCategories/fetchOtherServiceCategories",
  (params: ListParams = {}) => categoriesApi.getOtherServiceCategories({ limit: PAGE_LIMIT, ...params }),
);
export const fetchLookup = createAsyncThunk(
  "platformCategories/fetchLookup",
  ({ kind, ...params }: { kind: LookupKind } & ListParams) =>
    categoriesApi.getLookups(kind, { limit: PAGE_LIMIT, ...params }),
);
/**
 * Tests sit outside fetchCatalog for the same reason other-service categories do — that thunk maps its
 * results by index, and the tab is rarely the first an admin lands on. Fetched when the tab opens.
 */
export const fetchTests = createAsyncThunk(
  "platformCategories/fetchTests",
  (params: ListParams = {}) => categoriesApi.getTests({ limit: PAGE_LIMIT, ...params }),
);
export const fetchFeeTypes = createAsyncThunk(
  "platformCategories/fetchFeeTypes",
  (params: ListParams = {}) => categoriesApi.getFeeTypes({ limit: PAGE_LIMIT, ...params }),
);
export const fetchAccreditations = createAsyncThunk(
  "platformCategories/fetchAccreditations",
  (params: ListParams = {}) => categoriesApi.getAccreditations({ limit: PAGE_LIMIT, ...params }),
);

export const fetchIssuingOrganizations = createAsyncThunk("platformCategories/fetchIssuingOrganizations", async () =>
  (await categoriesApi.getIssuingOrganizations({ limit: ORG_DROPDOWN_LIMIT })).data,
);

export const fetchCountries = createAsyncThunk("platformCategories/fetchCountries", () => categoriesApi.getCountries());

export const fetchCatalog = createAsyncThunk("platformCategories/fetch", async () => {
  const results = await Promise.allSettled([
    categoriesApi.getBusinessCategories({ limit: PAGE_LIMIT }),
    categoriesApi.getServiceCategories({ limit: PAGE_LIMIT }),
    categoriesApi.getLookups("degree-levels", { limit: PAGE_LIMIT }),
    categoriesApi.getLookups("areas-of-study", { limit: PAGE_LIMIT }),
    categoriesApi.getFeeTypes({ limit: PAGE_LIMIT }),
    categoriesApi.getAccreditations({ limit: PAGE_LIMIT }),
    categoriesApi.getIssuingOrganizations({ limit: ORG_DROPDOWN_LIMIT }),
    categoriesApi.getCountries(),
  ]);
  const [
    businessCategories, serviceCategories, degreeLevels, areasOfStudy,
    feeTypes, accreditations, issuingOrganizationsResult, countries,
  ] = results.map((r, i) => {
    if (r.status === "rejected") {
      console.warn("Catalog slice failed to load", r.reason);
      return i >= 6 ? [] : emptyList();
    }
    if (i >= 6) return r.value;
    const { data, meta } = r.value as { data: unknown[]; meta: PaginationMeta };
    return { data, ...meta };
  });
  const issuingOrganizations = Array.isArray(issuingOrganizationsResult)
    ? issuingOrganizationsResult
    : issuingOrganizationsResult?.data;
  return {
    businessCategories, serviceCategories, degreeLevels, areasOfStudy,
    feeTypes, accreditations,
    issuingOrganizations: issuingOrganizations as IssuingOrganization[],
    countries: countries as CountryOption[],
  } as {
    businessCategories: ListState<Category>; serviceCategories: ListState<Category>;
    degreeLevels: ListState<Lookup>; areasOfStudy: ListState<Lookup>;
    feeTypes: ListState<FeeType>; accreditations: ListState<Accreditation>;
    issuingOrganizations: IssuingOrganization[]; countries: CountryOption[];
  };
});

function mutation<Arg>(
  name: string,
  run: (arg: Arg) => Promise<unknown>,
  refetch: (arg: Arg, state: CategoriesState) => unknown,
) {
  return createAsyncThunk(`platformCategories/${name}`, async (arg: Arg, { dispatch, getState }) => {
    await run(arg);
    const state = (getState() as { platformCategories: CategoriesState }).platformCategories;
    const actions = refetch(arg, state);
    await Promise.all((Array.isArray(actions) ? actions : [actions]).map((a) => dispatch(a as never)));
  });
}

const apiKind = (kind: CategoryKind) => kind === "business" ? "business" as const : kind === "other_service" ? "other-service" as const : "service" as const;

// Also refreshes the options slot so dropdowns elsewhere pick up activate/deactivate immediately.
const refetchFor = (kind: CategoryKind, state: CategoriesState) => {
  if (kind === "business") return [fetchBusinessCategories({ page: state.businessCategories.page }), fetchBusinessCategoryOptions()];
  if (kind === "other_service") return fetchOtherServiceCategories({ page: state.otherServiceCategories.page });
  return [fetchServiceCategories({ page: state.serviceCategories.page }), fetchServiceCategoryOptions()];
};

export const toggleCategory = mutation<{ kind: CategoryKind; id: number; is_active: boolean }>(
  "toggleCategory",
  ({ kind, id, is_active }) => categoriesApi.updateCategory(apiKind(kind), id, { is_active }),
  ({ kind }, state) => refetchFor(kind, state),
);

export const saveCategory = mutation<{ kind: CategoryKind; id: number | null; input: CategoryInput }>(
  "saveCategory",
  ({ kind, id, input }) =>
    id
      ? categoriesApi.updateCategory(apiKind(kind), id, input)
      : categoriesApi.createCategory(apiKind(kind), input),
  ({ kind }, state) => refetchFor(kind, state),
);

export const saveLookup = mutation<{ kind: LookupKind; id: number | null; input: LookupInput }>(
  "saveLookup",
  ({ kind, id, input }) => (id ? categoriesApi.updateLookup(kind, id, input) : categoriesApi.createLookup(kind, input)),
  ({ kind }, state) => {
    const page = kind === "degree-levels" ? state.degreeLevels.page : state.areasOfStudy.page;
    return fetchLookup({ kind, page });
  },
);

export const toggleLookup = mutation<{ kind: LookupKind; id: number; is_active: boolean }>(
  "toggleLookup",
  ({ kind, id, is_active }) => categoriesApi.updateLookup(kind, id, { is_active }),
  ({ kind }, state) => {
    const page = kind === "degree-levels" ? state.degreeLevels.page : state.areasOfStudy.page;
    return fetchLookup({ kind, page });
  },
);

export const saveTest = mutation<{ id: number | null; input: TestInput }>(
  "saveTest",
  ({ id, input }) => (id ? categoriesApi.updateTest(id, input) : categoriesApi.createTest(input)),
  (_arg, state) => fetchTests({ page: state.tests.page }),
);

export const toggleTest = mutation<{ id: number; is_active: boolean }>(
  "toggleTest",
  ({ id, is_active }) => categoriesApi.updateTest(id, { is_active }),
  (_arg, state) => fetchTests({ page: state.tests.page }),
);

export const saveFeeType = mutation<{ id: number | null; input: FeeTypeInput }>(
  "saveFeeType",
  ({ id, input }) => (id ? categoriesApi.updateFeeType(id, input) : categoriesApi.createFeeType(input)),
  (_arg, state) => fetchFeeTypes({ page: state.feeTypes.page }),
);

export const reviewFeeType = mutation<{ id: number; decision: ModerationStatus }>(
  "reviewFeeType",
  ({ id, decision }) => categoriesApi.reviewFeeType(id, decision),
  (_arg, state) => fetchFeeTypes({ page: state.feeTypes.page }),
);

export const removeFeeType = mutation<number>(
  "removeFeeType",
  (id) => categoriesApi.deleteFeeType(id),
  (_arg, state) => fetchFeeTypes({ page: state.feeTypes.page }),
);

export const saveAccreditation = mutation<{ id: number | null; input: AccreditationInput }>(
  "saveAccreditation",
  ({ id, input }) => (id ? categoriesApi.updateAccreditation(id, input) : categoriesApi.createAccreditation(input)),
  (_arg, state) => fetchAccreditations({ page: state.accreditations.page }),
);

export const reviewAccreditation = mutation<{ id: number; decision: ModerationStatus }>(
  "reviewAccreditation",
  ({ id, decision }) => categoriesApi.reviewAccreditation(id, decision),
  (_arg, state) => fetchAccreditations({ page: state.accreditations.page }),
);

export const removeAccreditation = mutation<number>(
  "removeAccreditation",
  (id) => categoriesApi.deleteAccreditation(id),
  (_arg, state) => fetchAccreditations({ page: state.accreditations.page }),
);

export type CategoriesState = {
  businessCategories: ListState<Category>;
  businessCategoryOptions: Category[];
  serviceCategories: ListState<Category>;
  serviceCategoryOptions: Category[];
  otherServiceCategories: ListState<Category>;
  degreeLevels: ListState<Lookup>;
  areasOfStudy: ListState<Lookup>;
  tests: ListState<Test>;
  feeTypes: ListState<FeeType>;
  accreditations: ListState<Accreditation>;
  issuingOrganizations: IssuingOrganization[];
  countries: CountryOption[];
  status: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: CategoriesState = {
  businessCategories: emptyList(), businessCategoryOptions: [],
  serviceCategories: emptyList(), serviceCategoryOptions: [], otherServiceCategories: emptyList(),
  degreeLevels: emptyList(), areasOfStudy: emptyList(), tests: emptyList(),
  feeTypes: emptyList(), accreditations: emptyList(),
  issuingOrganizations: [], countries: [],
  status: "idle", error: null,
};

const categoriesSlice = createSlice({
  name: "platformCategories",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchCatalog.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchCatalog.fulfilled, (state, action) => {
        state.status = "idle";
        Object.assign(state, action.payload);
      })
      .addCase(fetchCatalog.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load categories.";
      })
      .addCase(fetchBusinessCategories.fulfilled, (state, action) => {
        state.businessCategories = { data: action.payload.data, ...action.payload.meta };
      })
      .addCase(fetchBusinessCategoryOptions.fulfilled, (state, action) => {
        state.businessCategoryOptions = action.payload;
      })
      .addCase(fetchServiceCategories.fulfilled, (state, action) => {
        state.serviceCategories = { data: action.payload.data, ...action.payload.meta };
      })
      .addCase(fetchServiceCategoryOptions.fulfilled, (state, action) => {
        state.serviceCategoryOptions = action.payload;
      })
      .addCase(fetchOtherServiceCategories.fulfilled, (state, action) => {
        state.otherServiceCategories = { data: action.payload.data, ...action.payload.meta };
      })
      .addCase(fetchCountries.fulfilled, (state, action) => {
        state.countries = action.payload;
      })
      .addCase(fetchLookup.fulfilled, (state, action) => {
        const list = { data: action.payload.data, ...action.payload.meta };
        if (action.meta.arg.kind === "degree-levels") state.degreeLevels = list;
        else state.areasOfStudy = list;
      })
      .addCase(fetchTests.fulfilled, (state, action) => {
        state.tests = { data: action.payload.data, ...action.payload.meta };
      })
      .addCase(fetchFeeTypes.fulfilled, (state, action) => {
        state.feeTypes = { data: action.payload.data, ...action.payload.meta };
      })
      .addCase(fetchAccreditations.fulfilled, (state, action) => {
        state.accreditations = { data: action.payload.data, ...action.payload.meta };
      })
      .addCase(fetchIssuingOrganizations.fulfilled, (state, action) => {
        state.issuingOrganizations = action.payload;
      });
  },
});

export const categoriesReducer = categoriesSlice.reducer;
