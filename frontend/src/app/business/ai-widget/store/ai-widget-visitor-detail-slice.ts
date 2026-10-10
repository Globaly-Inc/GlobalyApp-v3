// One visitor, for the detail page. Separate from the list slice so opening a profile doesn't
// disturb the table behind it — going back lands on the same page, filters and all.

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { aiWidgetApi } from "../apis";
import type { VisitorPatch, WidgetVisitor } from "../apis/types";

export const fetchVisitor = createAsyncThunk("aiWidgetVisitorDetail/fetch", (id: number) =>
  aiWidgetApi.getVisitor(id),
);

export const saveVisitor = createAsyncThunk(
  "aiWidgetVisitorDetail/save",
  ({ id, patch }: { id: number; patch: VisitorPatch }) => aiWidgetApi.updateVisitor(id, patch),
);

type AiWidgetVisitorDetailState = {
  visitor: WidgetVisitor | null;
  status: "idle" | "loading" | "failed";
  savingStatus: "idle" | "loading" | "failed";
  error: string | null;
  /** The fetch whose answer this page is waiting for. Any other one finishing is stale. */
  requestId: string | null;
};

const initialState: AiWidgetVisitorDetailState = {
  visitor: null,
  status: "loading",
  savingStatus: "idle",
  error: null,
  requestId: null,
};

const aiWidgetVisitorDetailSlice = createSlice({
  name: "aiWidgetVisitorDetail",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      // Opening visitor B while A's fetch is still out: A's answer can land last. Only the latest
      // request may write, or B's page shows — and saves edits into — A's record.
      .addCase(fetchVisitor.pending, (state, action) => {
        state.requestId = action.meta.requestId;
        state.status = "loading";
        state.error = null;
        // Cleared so a second visitor's page never briefly paints the first one's details.
        state.visitor = null;
      })
      .addCase(fetchVisitor.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.requestId) return;
        state.status = "idle";
        state.visitor = action.payload;
      })
      .addCase(fetchVisitor.rejected, (state, action) => {
        if (action.meta.requestId !== state.requestId) return;
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load this visitor.";
      })
      .addCase(saveVisitor.pending, (state) => {
        state.savingStatus = "loading";
      })
      .addCase(saveVisitor.fulfilled, (state, action) => {
        state.savingStatus = "idle";
        // A save for a visitor this page has since navigated away from.
        if (state.visitor?.id !== action.meta.arg.id) return;
        // The server's row, not the patch: `status` is computed there, so filling in an email
        // flips the badge to Lead only because this replaces the whole row.
        state.visitor = action.payload;
      })
      .addCase(saveVisitor.rejected, (state) => {
        state.savingStatus = "failed";
      });
  },
});

export const aiWidgetVisitorDetailReducer = aiWidgetVisitorDetailSlice.reducer;
