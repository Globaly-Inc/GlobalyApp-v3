import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { countriesApi } from "../apis";
import type { CountryListParams, CountryStats, CountrySummary, PaginationMeta } from "../apis/types";

export const fetchCountries = createAsyncThunk("platformCountries/fetch", (params: CountryListParams = {}) =>
  countriesApi.getCountries(params),
);
export const removeCountry = createAsyncThunk("platformCountries/remove", async (id: number) => {
  await countriesApi.deleteCountry(id);
  return id;
});

type CountriesState = {
  countries: CountrySummary[];
  meta: PaginationMeta;
  stats: CountryStats;
  status: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: CountriesState = {
  countries: [],
  meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
  stats: { total: 0, active: 0, featured: 0 },
  status: "idle",
  error: null,
};

const countriesSlice = createSlice({
  name: "platformCountries",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchCountries.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchCountries.fulfilled, (state, action) => {
        state.status = "idle";
        state.countries = action.payload.countries;
        state.meta = action.payload.meta;
        state.stats = action.payload.stats;
      })
      .addCase(fetchCountries.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load countries.";
      });
  },
});

export const countriesReducer = countriesSlice.reducer;
