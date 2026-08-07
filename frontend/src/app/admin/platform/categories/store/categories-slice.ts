import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { categoriesApi } from "../apis";
import type { CategoriesByTab } from "../apis/types";

export const fetchCategories = createAsyncThunk("platformCategories/fetch", () => categoriesApi.getCategories());

type CategoriesState = {
  data: CategoriesByTab | null;
  status: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: CategoriesState = { data: null, status: "idle", error: null };

const categoriesSlice = createSlice({
  name: "platformCategories",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchCategories.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchCategories.fulfilled, (state, action) => {
        state.status = "idle";
        state.data = action.payload;
      })
      .addCase(fetchCategories.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load categories.";
      });
  },
});

export const categoriesReducer = categoriesSlice.reducer;
