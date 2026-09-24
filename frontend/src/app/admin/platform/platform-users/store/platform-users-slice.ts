import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { platformUsersApi } from "../apis";
import type { ListParams, PlatformUser, PlatformUserAdminRole, PlatformUserType, UpdatePlatformUserParams } from "../apis/types";

export type { PlatformUserType };

export const fetchPlatformUsers = createAsyncThunk("platformUsers/fetch", (params: ListParams = {}) =>
  platformUsersApi.listPlatformUsers(params),
);

export const updatePlatformUser = createAsyncThunk(
  "platformUsers/update",
  ({ id, patch }: { id: number; patch: UpdatePlatformUserParams }) => platformUsersApi.updatePlatformUser(id, patch),
);

export const setPlatformUserAdminRole = createAsyncThunk(
  "platformUsers/setAdminRole",
  ({ id, role }: { id: number; role: PlatformUserAdminRole | null }) => platformUsersApi.setPlatformUserAdminRole(id, role),
);

type PaginatedList<T> = { data: T[]; page: number; limit: number; total: number; totalPages: number };

type PlatformUsersState = {
  platformUsers: PaginatedList<PlatformUser>;
  platformUsersStatus: "idle" | "loading" | "failed";
  platformUsersError: string | null;
  latestRequestId: string | null;
};

const initialState: PlatformUsersState = {
  platformUsers: { data: [], page: 1, limit: 10, total: 0, totalPages: 1 },
  platformUsersStatus: "idle",
  platformUsersError: null,
  latestRequestId: null,
};

const platformUsersSlice = createSlice({
  name: "platformUsers",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchPlatformUsers.pending, (state, action) => {
        state.latestRequestId = action.meta.requestId;
        state.platformUsersStatus = "loading";
        state.platformUsersError = null;
      })
      .addCase(fetchPlatformUsers.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.latestRequestId) return;
        state.platformUsersStatus = "idle";
        state.platformUsers = { ...action.payload.meta, data: action.payload.data };
      })
      .addCase(fetchPlatformUsers.rejected, (state, action) => {
        if (action.meta.requestId !== state.latestRequestId) return;
        state.platformUsersStatus = "failed";
        state.platformUsersError = action.error.message ?? "Failed to load platform users.";
      });
  },
});

export const platformUsersReducer = platformUsersSlice.reducer;
