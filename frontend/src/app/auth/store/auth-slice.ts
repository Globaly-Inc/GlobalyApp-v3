import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { authApi } from "../apis";
import type { Employee } from "../apis/types";

export const fetchEmployees = createAsyncThunk("auth/fetchEmployees", () =>
  authApi.getEmployees()
);

type AuthState = {
  employees: Employee[];
  status: "idle" | "loading" | "failed";
};

const initialState: AuthState = { employees: [], status: "idle" };

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchEmployees.pending, (state) => {
        state.status = "loading";
      })
      .addCase(fetchEmployees.fulfilled, (state, action) => {
        state.status = "idle";
        state.employees = action.payload;
      })
      .addCase(fetchEmployees.rejected, (state) => {
        state.status = "failed";
      });
  },
});

export const authReducer = authSlice.reducer;
