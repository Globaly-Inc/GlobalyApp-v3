import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { usersApi } from "../apis";
import type { AdminInvitation, AdminUser, InviteAdminParams, ListParams, UpdateAdminParams } from "../apis/types";

export const fetchUsers = createAsyncThunk("adminUsers/fetchUsers", (params: ListParams = {}) =>
  usersApi.listUsers(params),
);

export const updateAdmin = createAsyncThunk(
  "adminUsers/updateAdmin",
  ({ id, patch }: { id: number; patch: UpdateAdminParams }) => usersApi.updateAdmin(id, patch),
);

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
  users: PaginatedList<AdminUser>;
  usersStatus: ListStatus;
  usersError: string | null;

  invitations: PaginatedList<AdminInvitation>;
  invitationsStatus: ListStatus | "inviting";
  invitationsError: string | null;
};

const emptyList = { data: [], page: 1, limit: 10, total: 0, totalPages: 1 };

const initialState: UsersState = {
  users: { ...emptyList },
  usersStatus: "idle",
  usersError: null,

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
      .addCase(fetchUsers.pending, (state) => {
        state.usersStatus = "loading";
        state.usersError = null;
      })
      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.usersStatus = "idle";
        state.users = { ...action.payload.meta, data: action.payload.data };
      })
      .addCase(fetchUsers.rejected, (state, action) => {
        state.usersStatus = "failed";
        state.usersError = action.error.message ?? "Failed to load users.";
      })
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
