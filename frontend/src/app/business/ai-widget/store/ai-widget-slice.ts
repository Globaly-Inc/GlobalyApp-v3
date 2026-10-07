import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { switchAccount } from "@/app/auth/store/auth-slice";
import { aiWidgetApi } from "../apis";
import { mergeSentRecipients } from "../utils";
import type {
  CreateEmbedConfigInput, EmbedConfig, EnsureEmbedResult, SendSnippetInput, UpdateEmbedConfigInput,
} from "../apis/types";

// `condition` drops a second fetch while one is in flight — Strict Mode's double effect, or the
// Inbox and the widget page mounting together, would otherwise race two identical requests.
export const fetchEmbedConfigs = createAsyncThunk("aiWidget/fetchConfigs", () => aiWidgetApi.listConfigs(), {
  condition: (_, { getState }) => (getState() as { aiWidget: AiWidgetState }).aiWidget.status !== "loading",
});

export const createEmbedConfig = createAsyncThunk("aiWidget/createConfig", (input: CreateEmbedConfigInput) =>
  aiWidgetApi.createConfig(input),
);

export const updateEmbedConfig = createAsyncThunk(
  "aiWidget/updateConfig",
  ({ id, input }: { id: number; input: UpdateEmbedConfigInput }) => aiWidgetApi.updateConfig(id, input),
);

export const rotateEmbedKey = createAsyncThunk("aiWidget/rotateKey", (id: number) => aiWidgetApi.rotateKey(id));

export const deactivateEmbedConfig = createAsyncThunk("aiWidget/deactivateConfig", async (id: number) => {
  await aiWidgetApi.deactivateConfig(id);
  return id;
});

export const reactivateEmbedConfig = createAsyncThunk("aiWidget/reactivateConfig", async (id: number) => {
  await aiWidgetApi.reactivateConfig(id);
  return id;
});

/** The portal card's own load: mints the widget if the org has none, and reports who the snippet
 *  would go to. Kept apart from `configs` — the card never lists widgets, it works on the one. */
export const ensureEmbedConfig = createAsyncThunk("aiWidget/ensureConfig", () => aiWidgetApi.ensureConfig());

export const sendEmbedSnippet = createAsyncThunk(
  "aiWidget/sendSnippet",
  async (input: SendSnippetInput, { rejectWithValue }) => {
    try {
      return await aiWidgetApi.sendSnippet(input);
    } catch (e) {
      // The backend's message names the real reason (rate limit, bad address); a generic
      // "failed" would hide the one thing the owner can act on.
      return rejectWithValue(e instanceof Error ? e.message : "Couldn't send the code.");
    }
  },
);

export const forgetEmbedDeveloper = createAsyncThunk(
  "aiWidget/forgetDeveloper",
  async (id: number, { rejectWithValue }) => {
    try {
      await aiWidgetApi.forgetDeveloper(id);
      return id;
    } catch (e) {
      // Same reason as the send above: the backend names the real cause — "Recipient not found"
      // for a row somebody else already removed — and the row stays on screen either way, so a
      // silent failure reads as a button that does nothing.
      return rejectWithValue(e instanceof Error ? e.message : "Couldn't remove that address.");
    }
  },
);

type AiWidgetState = {
  configs: EmbedConfig[];
  status: "idle" | "loading" | "failed";
  /** A fetch has succeeded for this org — "no configs" is only an answer once this is true. */
  loaded: boolean;
  createStatus: "idle" | "loading" | "failed";
  error: string | null;
  handoff: EnsureEmbedResult | null;
  handoffStatus: "idle" | "loading" | "failed";
  sendStatus: "idle" | "loading" | "failed";
};

const initialState: AiWidgetState = {
  configs: [],
  status: "idle",
  loaded: false,
  createStatus: "idle",
  error: null,
  handoff: null,
  handoffStatus: "idle",
  sendStatus: "idle",
};

const aiWidgetSlice = createSlice({
  name: "aiWidget",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      // Configs belong to the org; another org's widget must not answer "is one set up?".
      .addCase(switchAccount.pending, () => initialState)
      .addCase(fetchEmbedConfigs.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchEmbedConfigs.fulfilled, (state, action) => {
        state.status = "idle";
        state.loaded = true;
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
      .addCase(updateEmbedConfig.fulfilled, (state, action) => {
        const i = state.configs.findIndex((c) => c.id === action.payload.id);
        if (i >= 0) state.configs[i] = action.payload;
      })
      .addCase(rotateEmbedKey.fulfilled, (state, action) => {
        const i = state.configs.findIndex((c) => c.id === action.payload.id);
        if (i >= 0) state.configs[i] = action.payload;
      })
      .addCase(deactivateEmbedConfig.fulfilled, (state, action) => {
        const config = state.configs.find((c) => c.id === action.payload);
        if (config) config.is_active = false;
      })
      .addCase(reactivateEmbedConfig.fulfilled, (state, action) => {
        const config = state.configs.find((c) => c.id === action.payload);
        if (config) config.is_active = true;
      })
      .addCase(ensureEmbedConfig.pending, (state) => {
        state.handoffStatus = "loading";
      })
      .addCase(ensureEmbedConfig.fulfilled, (state, action) => {
        state.handoffStatus = "idle";
        state.handoff = action.payload;
        // ensure may have just created the widget: keep the cached list in step, or the Inbox
        // (which trusts `loaded` and won't refetch) keeps showing setup prompts for a live widget.
        // But this request can still be in flight while the owner saves or rotates the key on the
        // settings page, so it only replaces a cached record that is older than it — never a newer one.
        const incoming = action.payload.config;
        const i = state.configs.findIndex((c) => c.id === incoming.id);
        if (i < 0) state.configs.unshift(incoming);
        else if (Date.parse(incoming.updated_at) > Date.parse(state.configs[i]!.updated_at)) state.configs[i] = incoming;
      })
      .addCase(ensureEmbedConfig.rejected, (state, action) => {
        state.handoffStatus = "failed";
        state.error = action.error.message ?? "Couldn't load your widget.";
      })
      .addCase(sendEmbedSnippet.pending, (state) => {
        state.sendStatus = "loading";
      })
      .addCase(sendEmbedSnippet.fulfilled, (state, action) => {
        state.sendStatus = "idle";
        // Merge the rows this send touched; never adopt `recipients` wholesale. It is the list
        // as it stood when the server read it, so a Remove that completed while the send was in
        // flight would be undone by it and the deleted address would reappear. Anything the send
        // did not touch stays exactly as the card has it — including gone.
        if (!state.handoff) return;
        state.handoff.developers = mergeSentRecipients(
          state.handoff.developers, action.payload.sent, action.payload.recipients,
        );
      })
      .addCase(forgetEmbedDeveloper.fulfilled, (state, action) => {
        if (state.handoff) {
          state.handoff.developers = state.handoff.developers.filter((d) => d.id !== action.payload);
        }
      })
      .addCase(sendEmbedSnippet.rejected, (state) => {
        state.sendStatus = "failed";
      });
  },
});

export const aiWidgetReducer = aiWidgetSlice.reducer;
