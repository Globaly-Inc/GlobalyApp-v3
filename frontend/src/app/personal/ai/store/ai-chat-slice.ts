import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { aiApi } from "../apis";
import { stripStructuredBlocks } from "../utils";
import type { ChatSession, CourseCard, CreditBalance, Message, ResponseBlock, SSEEvent } from "../apis/types";
import type { AppDispatch } from "@/lib/store";

/* ── thunks ── */

export const fetchSessions = createAsyncThunk("aiChat/fetchSessions", () => aiApi.listSessions());

export const fetchMessages = createAsyncThunk("aiChat/fetchMessages", (sessionId: number) =>
  aiApi.getMessages(sessionId),
);

export const updateSession = createAsyncThunk(
  "aiChat/updateSession",
  ({ sessionId, data }: { sessionId: number; data: { title?: string; is_archived?: boolean } }) =>
    aiApi.updateSession(sessionId, data),
);

export const deleteSession = createAsyncThunk("aiChat/deleteSession", async (sessionId: number) => {
  await aiApi.deleteSession(sessionId);
  return sessionId;
});

export const setFeedback = createAsyncThunk(
  "aiChat/setFeedback",
  async ({ messageId, feedback }: { messageId: number; feedback: "up" | "down" | null }) => {
    await aiApi.setFeedback(messageId, feedback);
    return { messageId, feedback };
  },
);

/**
 * SSE streaming thunk. Dispatches sync reducers as events arrive so the UI
 * updates incrementally. Returns the final message_id from the `done` event.
 */
export const sendMessage = createAsyncThunk<
  number, // return: final message_id
  { sessionId: number | null; content: string; files?: File[] },
  { dispatch: AppDispatch }
>("aiChat/sendMessage", async ({ sessionId, content, files }, { dispatch, signal }) => {
  let finalMessageId = 0;
  let createdNewSession = false;

  // Attachments upload first; their storage paths ride along with the message
  const attachments = files?.length
    ? (await Promise.all(files.map((f) => aiApi.uploadAttachment(f)))).map((u) => u.storage_path)
    : undefined;

  await aiApi.sendMessage(
    { session_id: sessionId, content, attachments },
    (event: SSEEvent) => {
      switch (event.type) {
        case "session_created":
          createdNewSession = true;
          dispatch(sessionCreated(event.session));
          // New chat: the view couldn't add the optimistic user message earlier
          // (no session id existed yet), so add it now or it never renders.
          dispatch(addOptimisticUserMessage({
            sessionId: event.session.id,
            content,
            attachments: files?.map((f) => f.name),
          }));
          break;
        case "trace":
          dispatch(addTrace(event.step));
          break;
        case "delta":
          dispatch(appendDelta(event.text));
          break;
        case "cards":
          dispatch(setCards(event.cards));
          break;
        case "chips":
          dispatch(setChips(event.chips));
          break;
        case "blocks":
          dispatch(setBlocks(event.blocks));
          break;
        case "done":
          finalMessageId = event.message_id;
          break;
        case "error":
          throw new Error(event.error);
      }
    },
    signal,
  );

  // The generated title lands server-side a moment after the stream ends
  // (fire-and-forget Gemini call) — refresh the sidebar once to pick it up.
  if (createdNewSession) {
    setTimeout(() => dispatch(fetchSessions()), 3000);
  }

  return finalMessageId;
});

export const fetchCreditBalance = createAsyncThunk("aiChat/fetchCreditBalance", () =>
  aiApi.getCreditBalance(),
);

/* ── state ── */

type RegionStatus = "idle" | "loading" | "failed";

type AiChatState = {
  sessions: ChatSession[];
  activeSessionId: number | null;
  messages: Record<number, Message[]>;
  sessionListStatus: RegionStatus;
  messagesStatus: RegionStatus;
  sendStatus: RegionStatus;
  credits: CreditBalance | null;
  creditsStatus: RegionStatus;
  streamingContent: string;
  streamingCards: CourseCard[];
  streamingChips: string[];
  streamingBlocks: ResponseBlock[];
  traceSteps: string[];
  /** Block shown large in the Preview/Canvas panel (right column / bottom sheet). */
  previewBlock: ResponseBlock | null;
  /** Message the composer is replying to — quoted into the next send. Lives in the
   * store because the reply button (ChatMessage) and the composer (ChatInput) have
   * no common parent across the page, popover and embed surfaces. */
  replyTo: ReplyTarget | null;
  error: string | null;
};

export type ReplyTarget = { role: Message["role"]; content: string };

const initialState: AiChatState = {
  sessions: [],
  activeSessionId: null,
  messages: {},
  sessionListStatus: "idle",
  messagesStatus: "idle",
  sendStatus: "idle",
  credits: null,
  creditsStatus: "idle",
  streamingContent: "",
  streamingCards: [],
  streamingChips: [],
  streamingBlocks: [],
  traceSteps: [],
  previewBlock: null,
  replyTo: null,
  error: null,
};

/** Block types worth showing large in the preview panel (quick_replies stays inline). */
const PREVIEWABLE = new Set(["comparison", "breakdown", "timeline", "recommendation", "image"]);

/* ── slice ── */

const aiChatSlice = createSlice({
  name: "aiChat",
  initialState,
  reducers: {
    setActiveSession(state, action: PayloadAction<number | null>) {
      state.activeSessionId = action.payload;
      state.replyTo = null;
    },
    setReplyTo(state, action: PayloadAction<ReplyTarget | null>) {
      state.replyTo = action.payload;
    },
    appendDelta(state, action: PayloadAction<string>) {
      state.streamingContent += action.payload;
    },
    setCards(state, action: PayloadAction<CourseCard[]>) {
      state.streamingCards = action.payload;
    },
    setChips(state, action: PayloadAction<string[]>) {
      state.streamingChips = action.payload;
    },
    setBlocks(state, action: PayloadAction<ResponseBlock[]>) {
      state.streamingBlocks = action.payload;
      // Preview follows the conversation: the newest previewable block takes the canvas.
      const latest = action.payload.filter((b) => PREVIEWABLE.has(b.type)).at(-1);
      if (latest) state.previewBlock = latest;
    },
    setPreviewBlock(state, action: PayloadAction<ResponseBlock | null>) {
      state.previewBlock = action.payload;
    },
    addTrace(state, action: PayloadAction<string>) {
      state.traceSteps.push(action.payload);
    },
    sessionCreated(state, action: PayloadAction<ChatSession>) {
      state.sessions.unshift(action.payload);
      state.activeSessionId = action.payload.id;
    },
    clearStreamingState(state) {
      state.streamingContent = "";
      state.streamingCards = [];
      state.streamingChips = [];
      state.streamingBlocks = [];
      state.traceSteps = [];
    },
    // compare moved to the shared useCompareTray store (search feature) — one list app-wide
    addOptimisticUserMessage(state, action: PayloadAction<{ sessionId: number; content: string; attachments?: string[] }>) {
      const { sessionId, content, attachments } = action.payload;
      const msg: Message = {
        id: -Date.now(), // negative temp id
        session_id: sessionId,
        role: "user",
        content,
        cards: [],
        chips: [],
        blocks: [],
        feedback: null,
        attachments,
        created_at: new Date().toISOString(),
      };
      if (!state.messages[sessionId]) state.messages[sessionId] = [];
      state.messages[sessionId].push(msg);
    },
  },
  extraReducers: (builder) => {
    builder
      // fetchSessions
      .addCase(fetchSessions.pending, (state) => {
        state.sessionListStatus = "loading";
        state.error = null;
      })
      .addCase(fetchSessions.fulfilled, (state, action) => {
        state.sessionListStatus = "idle";
        state.sessions = action.payload;
      })
      .addCase(fetchSessions.rejected, (state, action) => {
        state.sessionListStatus = "failed";
        state.error = action.error.message ?? "Failed to load sessions.";
      })

      // fetchMessages
      .addCase(fetchMessages.pending, (state) => {
        state.messagesStatus = "loading";
      })
      .addCase(fetchMessages.fulfilled, (state, action) => {
        state.messagesStatus = "idle";
        const sessionId = action.meta.arg;
        state.messages[sessionId] = action.payload;
      })
      .addCase(fetchMessages.rejected, (state, action) => {
        state.messagesStatus = "failed";
        state.error = action.error.message ?? "Failed to load messages.";
      })

      // sendMessage
      .addCase(sendMessage.pending, (state) => {
        state.sendStatus = "loading";
        state.streamingContent = "";
        state.streamingCards = [];
        state.streamingChips = [];
        state.streamingBlocks = [];
        state.traceSteps = [];
        state.error = null;
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        state.sendStatus = "idle";
        const sessionId = state.activeSessionId;
        if (sessionId && state.streamingContent) {
          const assistantMsg: Message = {
            id: action.payload, // message_id from done event
            session_id: sessionId,
            role: "assistant",
            // Raw stream still contains the chips/card fences; the backend only
            // strips them from the *persisted* copy — mirror it here.
            content: stripStructuredBlocks(state.streamingContent),
            cards: state.streamingCards,
            chips: state.streamingChips,
            blocks: state.streamingBlocks,
            feedback: null,
            created_at: new Date().toISOString(),
          };
          if (!state.messages[sessionId]) state.messages[sessionId] = [];
          state.messages[sessionId].push(assistantMsg);
        }
        state.streamingContent = "";
        state.streamingCards = [];
        state.streamingChips = [];
        state.streamingBlocks = [];
        state.traceSteps = [];
      })
      .addCase(sendMessage.rejected, (state, action) => {
        state.sendStatus = "failed";
        state.error = action.error.message ?? "Failed to send message.";
        state.streamingContent = "";
        state.streamingCards = [];
        state.streamingChips = [];
        state.streamingBlocks = [];
        state.traceSteps = [];
      })

      // updateSession — archived sessions stay in state; the sidebar's tabs filter them
      .addCase(updateSession.fulfilled, (state, action) => {
        const updated = action.payload;
        state.sessions = state.sessions.map((s) => (s.id === updated.id ? updated : s));
        if (updated.is_archived && state.activeSessionId === updated.id) {
          state.activeSessionId = null;
        }
      })

      // deleteSession
      .addCase(deleteSession.fulfilled, (state, action) => {
        state.sessions = state.sessions.filter((s) => s.id !== action.payload);
        if (state.activeSessionId === action.payload) state.activeSessionId = null;
      })

      // fetchCreditBalance
      .addCase(fetchCreditBalance.pending, (state) => {
        state.creditsStatus = "loading";
      })
      .addCase(fetchCreditBalance.fulfilled, (state, action) => {
        state.creditsStatus = "idle";
        state.credits = action.payload;
      })
      .addCase(fetchCreditBalance.rejected, (state) => {
        state.creditsStatus = "failed";
      })

      // setFeedback
      .addCase(setFeedback.fulfilled, (state, action) => {
        const { messageId, feedback } = action.payload;
        for (const msgs of Object.values(state.messages)) {
          const msg = msgs.find((m) => m.id === messageId);
          if (msg) {
            msg.feedback = feedback;
            break;
          }
        }
      });
  },
});

export const {
  setActiveSession,
  appendDelta,
  setCards,
  setChips,
  setBlocks,
  setPreviewBlock,
  setReplyTo,
  addTrace,
  sessionCreated,
  clearStreamingState,
  addOptimisticUserMessage,
} = aiChatSlice.actions;

export const aiChatReducer = aiChatSlice.reducer;
