import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { aiApi } from "../apis";
import type { ChatSession, CourseCard, Message, SSEEvent } from "../apis/types";
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
  { sessionId: number | null; content: string },
  { dispatch: AppDispatch }
>("aiChat/sendMessage", async ({ sessionId, content }, { dispatch, signal }) => {
  let finalMessageId = 0;

  await aiApi.sendMessage(
    { session_id: sessionId, content },
    (event: SSEEvent) => {
      switch (event.type) {
        case "session_created":
          dispatch(sessionCreated(event.session));
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
        case "done":
          finalMessageId = event.message_id;
          break;
        case "error":
          throw new Error(event.error);
      }
    },
    signal,
  );

  return finalMessageId;
});

/* ── state ── */

type RegionStatus = "idle" | "loading" | "failed";

type AiChatState = {
  sessions: ChatSession[];
  activeSessionId: number | null;
  messages: Record<number, Message[]>;
  sessionListStatus: RegionStatus;
  messagesStatus: RegionStatus;
  sendStatus: RegionStatus;
  streamingContent: string;
  streamingCards: CourseCard[];
  streamingChips: string[];
  traceSteps: string[];
  error: string | null;
};

const initialState: AiChatState = {
  sessions: [],
  activeSessionId: null,
  messages: {},
  sessionListStatus: "idle",
  messagesStatus: "idle",
  sendStatus: "idle",
  streamingContent: "",
  streamingCards: [],
  streamingChips: [],
  traceSteps: [],
  error: null,
};

/* ── slice ── */

const aiChatSlice = createSlice({
  name: "aiChat",
  initialState,
  reducers: {
    setActiveSession(state, action: PayloadAction<number | null>) {
      state.activeSessionId = action.payload;
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
      state.traceSteps = [];
    },
    addOptimisticUserMessage(state, action: PayloadAction<{ sessionId: number; content: string }>) {
      const { sessionId, content } = action.payload;
      const msg: Message = {
        id: -Date.now(), // negative temp id
        session_id: sessionId,
        role: "user",
        content,
        cards: [],
        chips: [],
        feedback: null,
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
            content: state.streamingContent,
            cards: state.streamingCards,
            chips: state.streamingChips,
            feedback: null,
            created_at: new Date().toISOString(),
          };
          if (!state.messages[sessionId]) state.messages[sessionId] = [];
          state.messages[sessionId].push(assistantMsg);
        }
        state.streamingContent = "";
        state.streamingCards = [];
        state.streamingChips = [];
        state.traceSteps = [];
      })
      .addCase(sendMessage.rejected, (state, action) => {
        state.sendStatus = "failed";
        state.error = action.error.message ?? "Failed to send message.";
        state.streamingContent = "";
        state.streamingCards = [];
        state.streamingChips = [];
        state.traceSteps = [];
      })

      // updateSession
      .addCase(updateSession.fulfilled, (state, action) => {
        const updated = action.payload;
        if (updated.is_archived) {
          state.sessions = state.sessions.filter((s) => s.id !== updated.id);
          if (state.activeSessionId === updated.id) state.activeSessionId = null;
        } else {
          state.sessions = state.sessions.map((s) => (s.id === updated.id ? updated : s));
        }
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
  addTrace,
  sessionCreated,
  clearStreamingState,
  addOptimisticUserMessage,
} = aiChatSlice.actions;

export const aiChatReducer = aiChatSlice.reducer;
