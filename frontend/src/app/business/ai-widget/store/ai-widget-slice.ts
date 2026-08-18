import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { aiWidgetApi } from "../apis";
import type { CreateEmbedConfigInput, EmbedConfig } from "../apis/types";

export const fetchEmbedConfigs = createAsyncThunk("aiWidget/fetchConfigs", () => aiWidgetApi.listConfigs());

export const createEmbedConfig = createAsyncThunk("aiWidget/createConfig", (input: CreateEmbedConfigInput) =>
  aiWidgetApi.createConfig(input),
);

export const deactivateEmbedConfig = createAsyncThunk("aiWidget/deactivateConfig", async (id: number) => {
  await aiWidgetApi.deactivateConfig(id);
  return id;
});

type AiWidgetState = {
  configs: EmbedConfig[];
  status: "idle" | "loading" | "failed";
  createStatus: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: AiWidgetState = {
  configs: [],
  status: "idle",
  createStatus: "idle",
  error: null,
};

const aiWidgetSlice = createSlice({
  name: "aiWidget",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchEmbedConfigs.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchEmbedConfigs.fulfilled, (state, action) => {
        state.status = "idle";
        state.configs = action.payload;
      })
      .addCase(fetchEmbedConfigs.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load embed configs.";
      })
      .addCase(createEmbedConfig.pending, (state) => {
        state.createStatus = "loading";
        state.error = null;
      })
      .addCase(createEmbedConfig.fulfilled, (state, action) => {
        state.createStatus = "idle";
        state.configs.unshift(action.payload);
      })
      .addCase(createEmbedConfig.rejected, (state, action) => {
        state.createStatus = "failed";
        state.error = action.error.message ?? "Failed to create embed config.";
      })
      .addCase(deactivateEmbedConfig.fulfilled, (state, action) => {
        const config = state.configs.find((c) => c.id === action.payload);
        if (config) config.is_active = false;
      });
  },
});

export const aiWidgetReducer = aiWidgetSlice.reducer;
