// The Inbox's AI Conversations tab: widget visitors as conversations, plus each one's transcript.
//
// Its own slice rather than a reuse of ai-widget's `aiWidgetVisitors`: that one belongs to the
// paged, filtered Visitors table, and an Inbox fetch landing in it would reset whatever page the
// owner had open there. The endpoints are the same ones — only the state is separate.

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { aiWidgetApi } from "@/app/business/ai-widget/apis";
import { switchAccount } from "@/app/auth/store/auth-slice";
import type { ConversationControl, HandoffMode, VisitorMessage, WidgetVisitor } from "@/app/business/ai-widget/apis/types";

/** The API's max page size. "Load more" walks further pages. */
const PAGE_SIZE = 100;

/**
 * One page of visitors. Page 1 replaces the list, later pages append. `search` goes to the
 * server (name, email, programme), so a conversation beyond the loaded pages can still be found.
 */
export const fetchEmbedChats = createAsyncThunk(
  "embedChats/fetch",
  /** `poll`: a background refresh — it must not flash the list's loading state. */
  (arg: { page?: number; search?: string; poll?: boolean } | undefined) =>
    aiWidgetApi.listVisitors({ page: arg?.page ?? 1, limit: PAGE_SIZE, search: arg?.search || undefined }),
);

export const fetchEmbedTranscript = createAsyncThunk("embedChats/transcript", (visitorId: number) =>
  aiWidgetApi.listVisitorMessages(visitorId),
);

/** A staff reply. The server takes the chat over from the AI when it was handling it. */
export const sendEmbedMessage = createAsyncThunk(
  "embedChats/send",
  (arg: { visitorId: number; body: string; attachments: string[] }) =>
    aiWidgetApi.sendVisitorMessage(arg.visitorId, arg.body, arg.attachments),
);

/** Take over ("human") or give the chat back to the AI assistant ("ai"). */
export const setEmbedHandoff = createAsyncThunk(
  "embedChats/handoff",
  (arg: { visitorId: number; mode: HandoffMode }) => aiWidgetApi.setVisitorHandoff(arg.visitorId, arg.mode),
);

export const resolveEmbedChat = createAsyncThunk(
  "embedChats/resolve",
  (arg: { visitorId: number; resolved: boolean }) => aiWidgetApi.resolveVisitorChat(arg.visitorId, arg.resolved),
);

export const markEmbedChatRead = createAsyncThunk("embedChats/read", (visitorId: number) =>
  aiWidgetApi.markVisitorChatRead(visitorId),
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

/** The list row is where the header, panel and sidebar all read who is answering. */
function applyControl(state: EmbedChatsState, visitorId: number, control: ConversationControl) {
  const visitor = state.visitors.find((v) => v.id === visitorId);
  if (visitor) Object.assign(visitor, control);
}

const embedChatsSlice = createSlice({
  name: "embedChats",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchEmbedChats.pending, (state, action) => {
        state.requestId = action.meta.requestId;
        if (!action.meta.arg?.poll) state.status = "loading";
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
        state.status = action.meta.arg?.poll ? "idle" : "failed";
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
        // A failed poll keeps the transcript already on screen.
        if (!state.transcripts[action.meta.arg]) state.transcriptStatus[action.meta.arg] = "failed";
      })
      .addCase(sendEmbedMessage.fulfilled, (state, action) => {
        const { visitorId } = action.meta.arg;
        const { message, control } = action.payload;
        const transcript = state.transcripts[visitorId];
        // A poll may have landed it first.
        if (transcript && !transcript.some((m) => m.id === message.id)) transcript.push(message);
        applyControl(state, visitorId, control);
        const visitor = state.visitors.find((v) => v.id === visitorId);
        if (visitor) visitor.last_activity_at = message.created_at;
      })
      .addCase(setEmbedHandoff.fulfilled, (state, action) => {
        applyControl(state, action.meta.arg.visitorId, action.payload.control);
      })
      .addCase(resolveEmbedChat.fulfilled, (state, action) => {
        applyControl(state, action.meta.arg.visitorId, action.payload.control);
      })
      // Optimistic: opening the chat is the read. A failed call just leaves the count stale
      // until the next list poll brings the server's number back.
      .addCase(markEmbedChatRead.pending, (state, action) => {
        applyControl(state, action.meta.arg, { unread_count: 0 });
      })
      // Switching org keeps the rest of Redux, but every visitor id here belongs to the old
      // org — and ids are per-tenant integers, so the new org's visitor 4 would show the old
      // org's visitor 4's transcript. Wipe on `pending`, before any new-org request can land;
      // the cleared requestIds then drop any old-org response still in flight.
      .addCase(switchAccount.pending, () => initialState);
  },
});

export const embedChatsReducer = embedChatsSlice.reducer;
