import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { usersApi } from "../apis";
import type { AdminUser, InviteAdminParams, ListAdminsParams } from "../apis/types";

export const fetchAdmins = createAsyncThunk("adminUsers/fetchAdmins", (params: ListAdminsParams = {}) =>
  usersApi.listAdmins(params),
);

export const inviteAdmin = createAsyncThunk("adminUsers/inviteAdmin", (params: InviteAdminParams) =>
  usersApi.inviteAdmin(params),
);

export const updateAdmin = createAsyncThunk(
  "adminUsers/updateAdmin",
  (args: { id: number; patch: Partial<Pick<AdminUser, "name" | "role" | "account_status" | "photo_url">> }) =>
    usersApi.updateAdmin(args.id, args.patch),
);

type UsersState = {
  admins: AdminUser[];
  status: "idle" | "loading" | "inviting" | "failed";
  error: string | null;
};

const initialState: UsersState = { admins: [], status: "idle", error: null };

const usersSlice = createSlice({
  name: "adminUsers",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchAdmins.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchAdmins.fulfilled, (state, action) => {
        state.status = "idle";
        state.admins = action.payload.data;
      })
      .addCase(fetchAdmins.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load admins.";
      })
      .addCase(inviteAdmin.pending, (state) => {
        state.status = "inviting";
        state.error = null;
      })
      .addCase(inviteAdmin.fulfilled, (state) => {
        state.status = "idle";
      })
      .addCase(inviteAdmin.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to send invitation.";
      })
      .addCase(updateAdmin.fulfilled, (state, action) => {
        state.admins = state.admins.map((a) => (a.id === action.payload.id ? action.payload : a));
      });
  },
});

export const usersReducer = usersSlice.reducer;
