import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { countriesApi } from "../apis";
import type { CountrySummary } from "../apis/types";

export const fetchCountries = createAsyncThunk("platformCountries/fetch", () => countriesApi.getCountries());

type CountriesState = {
  countries: CountrySummary[];
  status: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: CountriesState = { countries: [], status: "idle", error: null };

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
        state.countries = action.payload;
      })
      .addCase(fetchCountries.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load countries.";
      });
  },
});

export const countriesReducer = countriesSlice.reducer;
