// What the institution's AI counsellor knows: admin rules, counsellor corrections, and the
// candidates it has learned and is waiting on a human for.
//
// Separate from the review slice next door for the same reason aiWidget and aiWidgetVisitors are
// separate: a review action must not reset whatever filter the memory list has open.
//
// Mutations replace the row in place so the result is immediate; the view refetches after one
// lands, because approving a candidate moves it out of the "Awaiting review" filter and a row
// that silently no longer matches its own list is the bug this avoids.

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { aiKnowledgeApi } from "../apis";
import type { CreateMemoryInput, Memory, MemoryListParams, PatchMemoryInput } from "../apis/types";
import { MEMORY_PAGE_SIZE } from "../const";

export const fetchMemories = createAsyncThunk("aiKnowledge/fetch", (params: MemoryListParams) =>
  aiKnowledgeApi.listMemories({ limit: MEMORY_PAGE_SIZE, ...params }),
);

export const createMemory = createAsyncThunk("aiKnowledge/create", (input: CreateMemoryInput) =>
  aiKnowledgeApi.createMemory(input),
);

export const updateMemory = createAsyncThunk(
  "aiKnowledge/update",
  ({ id, input }: { id: string; input: PatchMemoryInput }) => aiKnowledgeApi.updateMemory(id, input),
);

export const approveMemory = createAsyncThunk("aiKnowledge/approve", (id: string) =>
  aiKnowledgeApi.approveMemory(id),
);

export const deprecateMemory = createAsyncThunk(
  "aiKnowledge/deprecate",
  ({ id, reason }: { id: string; reason: string }) => aiKnowledgeApi.deprecateMemory(id, reason),
);

export const reactivateMemory = createAsyncThunk("aiKnowledge/reactivate", (id: string) =>
  aiKnowledgeApi.reactivateMemory(id),
);

export const unflagMemory = createAsyncThunk("aiKnowledge/unflag", (id: string) =>
  aiKnowledgeApi.unflagMemory(id),
);

export const deleteMemory = createAsyncThunk("aiKnowledge/delete", async (id: string) => {
  await aiKnowledgeApi.deleteMemory(id);
  return id;
});

type AiKnowledgeState = {
  items: Memory[];
  status: "idle" | "loading" | "failed";
  /** Separate from `status` so the list doesn't blank out while one row is being approved. */
  actionStatus: "idle" | "loading" | "failed";
  error: string | null;
  /** The latest fetch. Filters change faster than responses arrive; only this one may write. */
  requestId: string | null;
};

const initialState: AiKnowledgeState = {
  items: [],
  status: "idle",
  actionStatus: "idle",
  error: null,
  requestId: null,
};

/** Every mutation answers with the row; keep the list's order and swap it in place. */
const replace = (state: AiKnowledgeState, memory: Memory) => {
  state.items = state.items.map((m) => (m.id === memory.id ? memory : m));
};

const aiKnowledgeSlice = createSlice({
  name: "aiKnowledge",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchMemories.pending, (state, action) => {
        state.requestId = action.meta.requestId;
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchMemories.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.requestId) return;
        state.status = "idle";
        state.items = action.payload;
      })
      .addCase(fetchMemories.rejected, (state, action) => {
        if (action.meta.requestId !== state.requestId) return;
        state.status = "failed";
        state.error = action.error.message ?? "Couldn't load what your counsellor knows.";
      })

      .addCase(createMemory.fulfilled, (state, action) => {
        state.actionStatus = "idle";
        const exists = state.items.some((m) => m.id === action.payload.memory.id);
        if (exists) replace(state, action.payload.memory);
        else state.items = [action.payload.memory, ...state.items];
      })
      .addCase(deleteMemory.fulfilled, (state, action) => {
        state.actionStatus = "idle";
        state.items = state.items.filter((m) => m.id !== action.payload);
      })

      // Every single-row mutation lands the same way, so they share one matcher rather than
      // five near-identical cases.
      .addMatcher(
        (action): action is { type: string; payload: Memory } =>
          [updateMemory, approveMemory, deprecateMemory, reactivateMemory, unflagMemory]
            .some((thunk) => thunk.fulfilled.match(action)),
        (state, action) => {
          state.actionStatus = "idle";
          replace(state, action.payload);
        },
      )
      .addMatcher(
        (action) => action.type.startsWith("aiKnowledge/") && action.type.endsWith("/pending")
          && !action.type.startsWith("aiKnowledge/fetch"),
        (state) => {
          state.actionStatus = "loading";
          state.error = null;
        },
      )
      .addMatcher(
        (action): action is { type: string; error: { message?: string } } =>
          action.type.startsWith("aiKnowledge/") && action.type.endsWith("/rejected")
          && !action.type.startsWith("aiKnowledge/fetch"),
        (state, action) => {
          state.actionStatus = "failed";
          state.error = action.error.message ?? "That didn't go through.";
        },
      );
  },
});

export const aiKnowledgeReducer = aiKnowledgeSlice.reducer;
