import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { extractedDataApi } from "../apis";
import type { ExtractedInstitution } from "../apis/types";

export const fetchExtractedData = createAsyncThunk("dataExtractedData/fetch", () => extractedDataApi.getExtracted());

type ExtractedDataState = {
  institutions: ExtractedInstitution[];
  status: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: ExtractedDataState = { institutions: [], status: "idle", error: null };

const extractedDataSlice = createSlice({
  name: "dataExtractedData",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchExtractedData.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchExtractedData.fulfilled, (state, action) => {
        state.status = "idle";
        state.institutions = action.payload;
      })
      .addCase(fetchExtractedData.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load extracted data.";
      });
  },
});

export const extractedDataReducer = extractedDataSlice.reducer;
