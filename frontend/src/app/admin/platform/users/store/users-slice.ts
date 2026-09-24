import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { usersApi } from "../apis";
import type { AdminInvitation, InviteAdminParams, ListParams } from "../apis/types";

export const fetchInvitations = createAsyncThunk("adminUsers/fetchInvitations", (params: ListParams = {}) =>
  usersApi.listInvitations(params),
);

export const inviteAdmin = createAsyncThunk("adminUsers/inviteAdmin", (params: InviteAdminParams) =>
  usersApi.inviteAdmin(params),
);

export const resendInvitation = createAsyncThunk("adminUsers/resendInvitation", (id: string) =>
  usersApi.resendInvitation(id),
);

type PaginatedList<T> = { data: T[]; page: number; limit: number; total: number; totalPages: number };

type ListStatus = "idle" | "loading" | "failed";

type UsersState = {
  invitations: PaginatedList<AdminInvitation>;
  invitationsStatus: ListStatus | "inviting";
  invitationsError: string | null;
};

const emptyList = { data: [], page: 1, limit: 10, total: 0, totalPages: 1 };

const initialState: UsersState = {
  invitations: { ...emptyList },
  invitationsStatus: "idle",
  invitationsError: null,
};

const usersSlice = createSlice({
  name: "adminUsers",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchInvitations.pending, (state) => {
        state.invitationsStatus = "loading";
        state.invitationsError = null;
      })
      .addCase(fetchInvitations.fulfilled, (state, action) => {
        state.invitationsStatus = "idle";
        state.invitations = { ...action.payload.meta, data: action.payload.data };
      })
      .addCase(fetchInvitations.rejected, (state, action) => {
        state.invitationsStatus = "failed";
        state.invitationsError = action.error.message ?? "Failed to load invitations.";
      })
      .addCase(inviteAdmin.pending, (state) => {
        state.invitationsStatus = "inviting";
        state.invitationsError = null;
      })
      .addCase(inviteAdmin.fulfilled, (state) => {
        state.invitationsStatus = "idle";
      })
      .addCase(inviteAdmin.rejected, (state, action) => {
        state.invitationsStatus = "failed";
        state.invitationsError = action.error.message ?? "Failed to send invitation.";
      });
  },
});

export const usersReducer = usersSlice.reducer;
