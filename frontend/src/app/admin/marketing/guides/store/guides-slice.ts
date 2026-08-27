import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { guidesApi } from "../apis";
import type { GuideFiles, GuideInput, GuideWithLeadCount } from "../apis/types";

// ponytail: single unpaginated fetch + client-side filtering, same technique the blog list
// uses — move to server-side pagination if the guide count ever approaches this cap.
const ALL_GUIDES_LIMIT = 100;

export const fetchGuides = createAsyncThunk(
  "marketingGuides/fetchGuides",
  async () => (await guidesApi.getGuides({ limit: ALL_GUIDES_LIMIT })).data,
);

export const saveGuide = createAsyncThunk(
  "marketingGuides/saveGuide",
  async (
    { id, input, files }: { id: number | null; input: Partial<GuideInput>; files: GuideFiles },
    { dispatch },
  ) => {
    await (id ? guidesApi.updateGuide(id, input, files) : guidesApi.createGuide(input as GuideInput, files));
    await dispatch(fetchGuides());
  },
);

export const togglePublish = createAsyncThunk(
  "marketingGuides/togglePublish",
  async ({ id, is_published }: { id: number; is_published: boolean }, { dispatch }) => {
    await guidesApi.updateGuide(id, { is_published });
    await dispatch(fetchGuides());
  },
);

export const removeGuide = createAsyncThunk(
  "marketingGuides/removeGuide",
  async (id: number, { dispatch }) => {
    await guidesApi.deleteGuide(id);
    await dispatch(fetchGuides());
  },
);

type GuidesState = {
  guides: GuideWithLeadCount[];
  status: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: GuidesState = {
  guides: [],
  status: "idle",
  error: null,
};

const guidesSlice = createSlice({
  name: "marketingGuides",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchGuides.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchGuides.fulfilled, (state, action) => {
        state.status = "idle";
        state.guides = action.payload;
      })
      .addCase(fetchGuides.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load guides.";
      });
  },
});

export const guidesReducer = guidesSlice.reducer;
