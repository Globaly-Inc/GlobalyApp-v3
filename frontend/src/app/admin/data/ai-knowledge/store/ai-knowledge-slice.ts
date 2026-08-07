import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { aiKnowledgeApi } from "../apis";
import type { KnowledgeByTab } from "../apis/types";

export const fetchKnowledge = createAsyncThunk("dataAiKnowledge/fetch", () => aiKnowledgeApi.getKnowledge());

type AiKnowledgeState = {
  data: KnowledgeByTab | null;
  status: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: AiKnowledgeState = { data: null, status: "idle", error: null };

const aiKnowledgeSlice = createSlice({
  name: "dataAiKnowledge",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchKnowledge.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchKnowledge.fulfilled, (state, action) => {
        state.status = "idle";
        state.data = action.payload;
      })
      .addCase(fetchKnowledge.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load the knowledge base.";
      });
  },
});

export const aiKnowledgeReducer = aiKnowledgeSlice.reducer;
