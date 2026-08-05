import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { authApi } from "../apis";
import type { AuthUser, SendOtpParams, UpdateRoleParams, VerifyOtpParams } from "../apis/types";
import { clearTokens } from "@/lib/session";

export type PortalCategory = "personal" | "business";

export function toPortalCategory(value: string | null | undefined): PortalCategory | null {
  return value === "personal" || value === "business" ? value : null;
}

export const sendSignInOtp = createAsyncThunk("auth/sendSignInOtp", async (params: SendOtpParams) => {
  await authApi.sendOtp(params);
  return params.email;
});

export const resendSignInOtp = createAsyncThunk("auth/resendSignInOtp", async (params: SendOtpParams) => {
  await authApi.sendOtp(params);
  return params.email;
});

export const verifySignInOtp = createAsyncThunk("auth/verifySignInOtp", (params: VerifyOtpParams) =>
  authApi.verifyOtp(params),
);

export const updateRole = createAsyncThunk("auth/updateRole", (params: UpdateRoleParams) =>
  authApi.updateRole(params),
);

type AuthState = {
  user: AuthUser | null;
  status: "idle" | "sendingOtp" | "verifyingOtp" | "updatingRole" | "failed";
  error: string | null;
  selectedCategory: PortalCategory | null;
};

const initialState: AuthState = { user: null, status: "idle", error: null, selectedCategory: null };

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    resetSignInError(state) {
      state.error = null;
    },
    setSelectedCategory(state, action: PayloadAction<PortalCategory | null>) {
      state.selectedCategory = action.payload;
    },
    logout(state) {
      clearTokens();
      state.user = null;
      state.selectedCategory = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(sendSignInOtp.pending, (state) => {
        state.status = "sendingOtp";
        state.error = null;
      })
      .addCase(sendSignInOtp.fulfilled, (state) => {
        state.status = "idle";
      })
      .addCase(sendSignInOtp.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to send code.";
      })
      .addCase(resendSignInOtp.pending, (state) => {
        state.status = "sendingOtp";
        state.error = null;
      })
      .addCase(resendSignInOtp.fulfilled, (state) => {
        state.status = "idle";
      })
      .addCase(resendSignInOtp.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to send code.";
      })
      .addCase(verifySignInOtp.pending, (state) => {
        state.status = "verifyingOtp";
        state.error = null;
      })
      .addCase(verifySignInOtp.fulfilled, (state, action) => {
        state.status = "idle";
        state.user = action.payload;
      })
      .addCase(verifySignInOtp.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Verification failed.";
      })
      .addCase(updateRole.pending, (state) => {
        state.status = "updatingRole";
        state.error = null;
      })
      .addCase(updateRole.fulfilled, (state, action) => {
        state.status = "idle";
        state.selectedCategory = action.meta.arg.category;
      })
      .addCase(updateRole.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to update your account type.";
      });
  },
});

export const { resetSignInError, setSelectedCategory, logout } = authSlice.actions;
export const authReducer = authSlice.reducer;
