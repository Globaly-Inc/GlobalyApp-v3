import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { businessIntegrationsApi } from "../apis";
import type { UpsertWebhookInput, WebhookEvent, WebhookSettings } from "../apis/types";

export const fetchWebhook = createAsyncThunk("businessIntegrations/fetchWebhook", async () => {
  const [settings, events] = await Promise.all([
    businessIntegrationsApi.getWebhook(),
    businessIntegrationsApi.listEvents(),
  ]);
  return { settings, events };
});

export const saveWebhook = createAsyncThunk(
  "businessIntegrations/saveWebhook",
  async (input: UpsertWebhookInput, { rejectWithValue }) => {
    try {
      return await businessIntegrationsApi.saveWebhook(input);
    } catch (err) {
      return rejectWithValue(err instanceof Error ? err.message : "Failed to save webhook");
    }
  },
);

type BusinessIntegrationsState = {
  settings: WebhookSettings | null;
  availableEvents: WebhookEvent[];
  status: "idle" | "loading" | "failed";
  error: string | null;
  saving: boolean;
  saveError: string | null;
  /** The secret is only ever present right after (re)generation — held here so the UI can show a
   * "copy this now" banner, and cleared once the user acknowledges it. */
  revealedSecret: string | null;
};

const initialState: BusinessIntegrationsState = {
  settings: null,
  availableEvents: [],
  status: "idle",
  error: null,
  saving: false,
  saveError: null,
  revealedSecret: null,
};

const businessIntegrationsSlice = createSlice({
  name: "businessIntegrations",
  initialState,
  reducers: {
    dismissRevealedSecret: (state) => {
      state.revealedSecret = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchWebhook.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchWebhook.fulfilled, (state, action) => {
        state.status = "idle";
        state.settings = action.payload.settings;
        state.availableEvents = action.payload.events;
      })
      .addCase(fetchWebhook.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load webhook settings";
      })

      .addCase(saveWebhook.pending, (state) => {
        state.saving = true;
        state.saveError = null;
      })
      .addCase(saveWebhook.fulfilled, (state, action) => {
        state.saving = false;
        state.settings = action.payload;
        if (action.payload.secret) state.revealedSecret = action.payload.secret;
      })
      .addCase(saveWebhook.rejected, (state, action) => {
        state.saving = false;
        state.saveError = (action.payload as string) ?? "Failed to save webhook";
      });
  },
});

export const { dismissRevealedSecret } = businessIntegrationsSlice.actions;
export const businessIntegrationsReducer = businessIntegrationsSlice.reducer;
