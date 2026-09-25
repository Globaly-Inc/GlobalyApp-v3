// The Inbox's AI Conversations tab: widget visitors as conversations, plus each one's transcript.
//
// Its own slice rather than a reuse of ai-widget's `aiWidgetVisitors`: that one belongs to the
// paged, filtered Visitors table, and an Inbox fetch landing in it would reset whatever page the
// owner had open there. The endpoints are the same ones — only the state is separate.

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { aiWidgetApi } from "@/app/business/ai-widget/apis";
import { switchAccount } from "@/app/auth/store/auth-slice";
import type { VisitorMessage, WidgetVisitor } from "@/app/business/ai-widget/apis/types";

/** The API's max page size. "Load more" walks further pages. */
const PAGE_SIZE = 100;

/**
 * One page of visitors. Page 1 replaces the list, later pages append. `search` goes to the
 * server (name/email), so a conversation beyond the loaded pages can still be found.
 */
export const fetchEmbedChats = createAsyncThunk(
  "embedChats/fetch",
  (arg: { page?: number; search?: string } | undefined) =>
    aiWidgetApi.listVisitors({ page: arg?.page ?? 1, limit: PAGE_SIZE, search: arg?.search || undefined }),
);

export const fetchEmbedTranscript = createAsyncThunk("embedChats/transcript", (visitorId: number) =>
  aiWidgetApi.listVisitorMessages(visitorId),
);

type EmbedChatsState = {
  visitors: WidgetVisitor[];
  /** All of this org's visitors, unsearched — the tab count. May exceed `visitors`. */
  total: number;
  /** Rows matching the current `search` on the server — decides whether "Load more" shows. */
  matched: number;
  page: number;
  search: string;
  status: "idle" | "loading" | "failed";
  /** The latest list fetch. Searches change faster than responses arrive; only this one may write. */
  requestId: string | null;
  /** Keyed by visitor id. Visitor ids are tenant-local, so this is wiped on an account switch. */
  transcripts: Record<number, VisitorMessage[]>;
  transcriptStatus: Record<number, "idle" | "loading" | "failed">;
  /** Per visitor, the in-flight transcript fetch — a response from before a reset is dropped. */
  transcriptRequest: Record<number, string>;
};

const initialState: EmbedChatsState = {
  visitors: [],
  total: 0,
  matched: 0,
  page: 1,
  search: "",
  status: "idle",
  requestId: null,
  transcripts: {},
  transcriptStatus: {},
  transcriptRequest: {},
};

const embedChatsSlice = createSlice({
  name: "embedChats",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchEmbedChats.pending, (state, action) => {
        state.requestId = action.meta.requestId;
        state.status = "loading";
      })
      .addCase(fetchEmbedChats.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.requestId) return;
        const { page = 1, search = "" } = action.meta.arg ?? {};
        const { data, total } = action.payload;
        state.status = "idle";
        if (page === 1) {
          state.visitors = data;
        } else {
          const seen = new Set(state.visitors.map((v) => v.id));
          state.visitors.push(...data.filter((v) => !seen.has(v.id)));
        }
        state.page = page;
        state.search = search;
        state.matched = total;
        if (!search) state.total = total;
      })
      .addCase(fetchEmbedChats.rejected, (state, action) => {
        if (action.meta.requestId !== state.requestId) return;
        state.status = "failed";
      })
      .addCase(fetchEmbedTranscript.pending, (state, action) => {
        state.transcriptRequest[action.meta.arg] = action.meta.requestId;
        state.transcriptStatus[action.meta.arg] = "loading";
      })
      .addCase(fetchEmbedTranscript.fulfilled, (state, action) => {
        if (state.transcriptRequest[action.meta.arg] !== action.meta.requestId) return;
        state.transcriptStatus[action.meta.arg] = "idle";
        state.transcripts[action.meta.arg] = action.payload;
      })
      .addCase(fetchEmbedTranscript.rejected, (state, action) => {
        if (state.transcriptRequest[action.meta.arg] !== action.meta.requestId) return;
        state.transcriptStatus[action.meta.arg] = "failed";
      })
      // Switching org keeps the rest of Redux, but every visitor id here belongs to the old
      // org — and ids are per-tenant integers, so the new org's visitor 4 would show the old
      // org's visitor 4's transcript. Wipe on `pending`, before any new-org request can land;
      // the cleared requestIds then drop any old-org response still in flight.
      .addCase(switchAccount.pending, () => initialState);
  },
});

export const embedChatsReducer = embedChatsSlice.reducer;
