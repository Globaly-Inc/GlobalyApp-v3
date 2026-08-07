import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { adminApi } from "../apis";
import type { AdminUser } from "../apis/types";

export const fetchMe = createAsyncThunk("admin/fetchMe", () => adminApi.getMe());

type AdminState = {
  me: AdminUser | null;
  status: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: AdminState = { me: null, status: "idle", error: null };

const adminSlice = createSlice({
  name: "admin",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchMe.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchMe.fulfilled, (state, action) => {
        state.status = "idle";
        state.me = action.payload;
      })
      .addCase(fetchMe.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load your admin profile.";
      });
  },
});

export const adminReducer = adminSlice.reducer;
