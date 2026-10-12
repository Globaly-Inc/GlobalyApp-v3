// Connected WhatsApp, Instagram and Facebook accounts — read by the Channels page, the inbox bar's
// status chips and the Inbox's Channels dropdown (connection dots).

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { switchAccount } from "@/app/auth/store/auth-slice";
import { channelsApi } from "../apis";
import type { AiConfig, ChannelConnection, ChannelKey } from "../apis/types";

export const fetchChannels = createAsyncThunk("inboxChannels/fetch", () => channelsApi.listChannels(), {
  // One in flight at a time: the Inbox and the Channels page both ask on mount.
  condition: (_, { getState }) => (getState() as { inboxChannels: ChannelsState }).inboxChannels.status !== "loading",
});

export const confirmChannel = createAsyncThunk("inboxChannels/confirm", (arg: { channel: ChannelKey; accountId?: string }) =>
  channelsApi.confirmChannel(arg.channel, arg.accountId),
);

export const updateChannelAi = createAsyncThunk(
  "inboxChannels/updateAi",
  (arg: { id: number; ai_mode: "auto" | "suggest"; ai_config: AiConfig }) =>
    channelsApi.updateChannelAi(arg.id, { ai_mode: arg.ai_mode, ai_config: arg.ai_config }),
);

export const disconnectChannel = createAsyncThunk("inboxChannels/disconnect", (id: number) => channelsApi.disconnectChannel(id));

type ChannelsState = {
  configured: boolean;
  connections: ChannelConnection[];
  status: "idle" | "loading" | "failed";
  loaded: boolean;
  error: string | null;
};

const initialState: ChannelsState = { configured: true, connections: [], status: "idle", loaded: false, error: null };

function upsert(state: ChannelsState, rows: ChannelConnection[]) {
  for (const row of rows) {
    const i = state.connections.findIndex((c) => c.id === row.id);
    if (i >= 0) state.connections[i] = row;
    else state.connections.push(row);
  }
}

const channelsSlice = createSlice({
  name: "inboxChannels",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchChannels.pending, (state) => { state.status = "loading"; })
      .addCase(fetchChannels.fulfilled, (state, action) => {
        Object.assign(state, { ...action.payload, status: "idle", loaded: true, error: null });
      })
      .addCase(fetchChannels.rejected, (state, action) => {
        state.status = "failed";
        state.loaded = true;
        state.error = action.error.message ?? "Couldn't load channels";
      })
      .addCase(confirmChannel.fulfilled, (state, action) => upsert(state, action.payload))
      .addCase(updateChannelAi.fulfilled, (state, action) => upsert(state, [action.payload]))
      .addCase(disconnectChannel.fulfilled, (state, action) => {
        state.connections = state.connections.filter((c) => c.id !== action.meta.arg);
      })
      // Connections belong to the org; switching org must not show another org's numbers.
      .addCase(switchAccount.pending, () => initialState);
  },
});

export const channelsReducer = channelsSlice.reducer;
