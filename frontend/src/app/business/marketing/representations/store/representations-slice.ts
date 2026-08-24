import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { representationsApi } from "../apis";
import type { Representation, RepresentationInviteInput } from "../apis/types";

export const fetchRepresentations = createAsyncThunk("representations/fetchAll", () => representationsApi.list());

export const inviteRepresentation = createAsyncThunk(
  "representations/invite",
  (input: RepresentationInviteInput) => representationsApi.invite(input),
);

export const respondToRepresentation = createAsyncThunk(
  "representations/respond",
  ({ id, status }: { id: string; status: "active" | "rejected" }) => representationsApi.respond(id, status),
);

type RepresentationsState = {
  items: Representation[];
  status: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: RepresentationsState = { items: [], status: "idle", error: null };

const representationsSlice = createSlice({
  name: "representations",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchRepresentations.pending, (state) => { state.status = "loading"; })
      .addCase(fetchRepresentations.fulfilled, (state, action) => {
        state.status = "idle";
        state.items = action.payload;
      })
      .addCase(fetchRepresentations.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load representations.";
      })
      .addCase(inviteRepresentation.fulfilled, (state, action) => {
        state.items.unshift(action.payload);
      })
      .addCase(respondToRepresentation.fulfilled, (state, action) => {
        const i = state.items.findIndex((r) => r.id === action.payload.id);
        if (i >= 0) state.items[i] = action.payload;
      });
  },
});

export const businessRepresentationsReducer = representationsSlice.reducer;
