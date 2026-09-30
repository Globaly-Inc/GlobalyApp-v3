import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { ApiError } from "@/lib/api/http";
import { businessInvitesApi } from "../apis";
import type { EmailMatch, InviteCounts, InviteListParams, OnboardingInvite, SendInviteParams, SendInviteResult } from "../apis/types";

export const fetchInvites = createAsyncThunk("businessInvites/fetchInvites", (params: InviteListParams = {}) =>
  businessInvitesApi.listInvites(params),
);

/** Rejects with the matches too, since a thrown error's details don't survive serialisation. */
export const sendInvite = createAsyncThunk<SendInviteResult, SendInviteParams, { rejectValue: { message: string; matches: EmailMatch[] } }>(
  "businessInvites/sendInvite",
  async (params, { rejectWithValue }) => {
    try {
      return await businessInvitesApi.sendInvite(params);
    } catch (err) {
      const matches = err instanceof ApiError ? ((err.details as { matches?: EmailMatch[] } | undefined)?.matches ?? []) : [];
      return rejectWithValue({ message: (err as Error).message || "Please try again.", matches });
    }
  },
);

export const resendInvite = createAsyncThunk("businessInvites/resendInvite", (id: string) =>
  businessInvitesApi.resendInvite(id),
);

export const revokeInvite = createAsyncThunk("businessInvites/revokeInvite", async (id: string) => {
  await businessInvitesApi.revokeInvite(id);
  return id;
});

/** The "Resend the invite" button in a new-link-requested email lands here; a no-op once resent. */
export const resendRequestedInvite = createAsyncThunk("businessInvites/resendRequestedInvite", (id: string) =>
  businessInvitesApi.resendInvite(id, { ifRequested: true }),
);

export const deleteInvite = createAsyncThunk("businessInvites/deleteInvite", async (id: string) => {
  await businessInvitesApi.deleteInvite(id);
  return id;
});

type BusinessInvitesState = {
  invites: OnboardingInvite[];
  page: number;
  limit: number;
  total: number;
  counts: InviteCounts;
  status: "idle" | "loading" | "failed";
  error: string | null;
  /** Only the latest list request may write — a slower one from a previous filter/page is dropped. */
  latestRequestId: string | null;
};

const initialState: BusinessInvitesState = {
  invites: [],
  page: 1,
  limit: 10,
  total: 0,
  counts: { pending: 0, accepted: 0, expired: 0, revoked: 0 },
  status: "idle",
  error: null,
  latestRequestId: null,
};

const businessInvitesSlice = createSlice({
  name: "businessInvites",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchInvites.pending, (state, action) => {
        state.status = "loading";
        state.error = null;
        state.latestRequestId = action.meta.requestId;
      })
      .addCase(fetchInvites.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.latestRequestId) return;
        state.status = "idle";
        state.invites = action.payload.data;
        state.page = action.payload.meta.page;
        state.limit = action.payload.meta.limit;
        state.total = action.payload.meta.total;
        state.counts = action.payload.counts;
      })
      .addCase(fetchInvites.rejected, (state, action) => {
        if (action.meta.requestId !== state.latestRequestId) return;
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load invites.";
      });
  },
});

export const businessInvitesReducer = businessInvitesSlice.reducer;
