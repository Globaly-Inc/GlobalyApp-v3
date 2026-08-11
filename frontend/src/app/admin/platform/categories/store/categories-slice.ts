import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { categoriesApi } from "../apis";
import type {
  Accreditation, AccreditationInput, Category, CategoryInput, CountryOption,
  FeeType, FeeTypeInput, IssuingOrganization, Lookup, LookupInput, LookupKind,
  ModerationStatus,
} from "../apis/types";

export const fetchBusinessCategories = createAsyncThunk("platformCategories/fetchBusinessCategories", () =>
  categoriesApi.getBusinessCategories(),
);
export const fetchServiceCategories = createAsyncThunk("platformCategories/fetchServiceCategories", () =>
  categoriesApi.getServiceCategories(),
);
export const fetchLookup = createAsyncThunk("platformCategories/fetchLookup", (kind: LookupKind) =>
  categoriesApi.getLookups(kind),
);
export const fetchFeeTypes = createAsyncThunk("platformCategories/fetchFeeTypes", () => categoriesApi.getFeeTypes());
export const fetchAccreditations = createAsyncThunk("platformCategories/fetchAccreditations", () =>
  categoriesApi.getAccreditations(),
);
export const fetchIssuingOrganizations = createAsyncThunk("platformCategories/fetchIssuingOrganizations", () =>
  categoriesApi.getIssuingOrganizations(),
);

export const fetchCatalog = createAsyncThunk("platformCategories/fetch", async () => {
  const results = await Promise.allSettled([
    categoriesApi.getBusinessCategories(),
    categoriesApi.getServiceCategories(),
    categoriesApi.getLookups("degree-levels"),
    categoriesApi.getLookups("areas-of-study"),
    categoriesApi.getFeeTypes(),
    categoriesApi.getAccreditations(),
    categoriesApi.getIssuingOrganizations(),
    categoriesApi.getCountries(),
  ]);
  const [
    businessCategories, serviceCategories, degreeLevels, areasOfStudy,
    feeTypes, accreditations, issuingOrganizations, countries,
  ] = results.map((r) => {
    if (r.status === "rejected") console.warn("Catalog slice failed to load", r.reason);
    return r.status === "fulfilled" ? r.value : [];
  }) as [Category[], Category[], Lookup[], Lookup[], FeeType[], Accreditation[], IssuingOrganization[], CountryOption[]];
  return {
    businessCategories, serviceCategories, degreeLevels, areasOfStudy,
    feeTypes, accreditations, issuingOrganizations, countries,
  };
});

function mutation<Arg>(name: string, run: (arg: Arg) => Promise<unknown>, refetch: (arg: Arg) => unknown) {
  return createAsyncThunk(`platformCategories/${name}`, async (arg: Arg, { dispatch }) => {
    await run(arg);
    await dispatch(refetch(arg) as never);
  });
}

export const saveCategory = mutation<{ kind: "business" | "service"; id: number | null; input: CategoryInput }>(
  "saveCategory",
  ({ kind, id, input }) => (id ? categoriesApi.updateCategory(kind, id, input) : categoriesApi.createCategory(kind, input)),
  ({ kind }) => (kind === "business" ? fetchBusinessCategories() : fetchServiceCategories()),
);

export const toggleCategory = mutation<{ kind: "business" | "service"; id: number; is_active: boolean }>(
  "toggleCategory",
  ({ kind, id, is_active }) => categoriesApi.updateCategory(kind, id, { is_active }),
  ({ kind }) => (kind === "business" ? fetchBusinessCategories() : fetchServiceCategories()),
);

export const saveLookup = mutation<{ kind: LookupKind; id: number | null; input: LookupInput }>(
  "saveLookup",
  ({ kind, id, input }) => (id ? categoriesApi.updateLookup(kind, id, input) : categoriesApi.createLookup(kind, input)),
  ({ kind }) => fetchLookup(kind),
);

export const toggleLookup = mutation<{ kind: LookupKind; id: number; is_active: boolean }>(
  "toggleLookup",
  ({ kind, id, is_active }) => categoriesApi.updateLookup(kind, id, { is_active }),
  ({ kind }) => fetchLookup(kind),
);

export const saveFeeType = mutation<{ id: number | null; input: FeeTypeInput }>(
  "saveFeeType",
  ({ id, input }) => (id ? categoriesApi.updateFeeType(id, input) : categoriesApi.createFeeType(input)),
  () => fetchFeeTypes(),
);

export const reviewFeeType = mutation<{ id: number; decision: ModerationStatus }>(
  "reviewFeeType",
  ({ id, decision }) => categoriesApi.reviewFeeType(id, decision),
  () => fetchFeeTypes(),
);

export const removeFeeType = mutation<number>("removeFeeType", (id) => categoriesApi.deleteFeeType(id), () => fetchFeeTypes());

export const saveAccreditation = mutation<{ id: number | null; input: AccreditationInput }>(
  "saveAccreditation",
  ({ id, input }) => (id ? categoriesApi.updateAccreditation(id, input) : categoriesApi.createAccreditation(input)),
  () => fetchAccreditations(),
);

export const reviewAccreditation = mutation<{ id: number; decision: ModerationStatus }>(
  "reviewAccreditation",
  ({ id, decision }) => categoriesApi.reviewAccreditation(id, decision),
  () => fetchAccreditations(),
);

export const removeAccreditation = mutation<number>("removeAccreditation", (id) => categoriesApi.deleteAccreditation(id), () => fetchAccreditations());

type CategoriesState = {
  businessCategories: Category[];
  serviceCategories: Category[];
  degreeLevels: Lookup[];
  areasOfStudy: Lookup[];
  feeTypes: FeeType[];
  accreditations: Accreditation[];
  issuingOrganizations: IssuingOrganization[];
  countries: CountryOption[];
  status: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: CategoriesState = {
  businessCategories: [], serviceCategories: [], degreeLevels: [], areasOfStudy: [],
  feeTypes: [], accreditations: [], issuingOrganizations: [], countries: [],
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
        state.businessCategories = action.payload;
      })
      .addCase(fetchServiceCategories.fulfilled, (state, action) => {
        state.serviceCategories = action.payload;
      })
      .addCase(fetchLookup.fulfilled, (state, action) => {
        if (action.meta.arg === "degree-levels") state.degreeLevels = action.payload;
        else state.areasOfStudy = action.payload;
      })
      .addCase(fetchFeeTypes.fulfilled, (state, action) => {
        state.feeTypes = action.payload;
      })
      .addCase(fetchAccreditations.fulfilled, (state, action) => {
        state.accreditations = action.payload;
      })
      .addCase(fetchIssuingOrganizations.fulfilled, (state, action) => {
        state.issuingOrganizations = action.payload;
      });
  },
});

export const categoriesReducer = categoriesSlice.reducer;
