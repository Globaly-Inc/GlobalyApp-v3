import { useSyncExternalStore } from "react";
import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { authApi } from "../apis";
import type { AuthUser, SendOtpParams, UpdateRoleParams, VerifyOtpParams } from "../apis/types";
import { clearTokens } from "@/lib/session";
import { useAppSelector } from "@/lib/hooks";
import type { RootState } from "@/lib/store";

export type PortalCategory = "personal" | "business";

export function toPortalCategory(value: string | null | undefined): PortalCategory | null {
  return value === "personal" || value === "business" ? value : null;
}

// Server render and the hydrating client render must agree, so the real auth state is
// withheld until after hydration. useSyncExternalStore is React's own way to say
// "false on the server, true on the client" without an effect that sets state.
const neverChanges = () => () => {};
const onClient = () => true;
const onServer = () => false;

export function useAuthState() {
  const state = useAppSelector((s) => s.auth);
  const mounted = useSyncExternalStore(neverChanges, onClient, onServer);
  return mounted ? state : { ...state, user: null, initializing: true };
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

export const restoreSession = createAsyncThunk("auth/restoreSession", () => authApi.getMe(), {
  condition: (_, { getState }) => (getState() as RootState).auth.initializing,
});

export const fetchMe = createAsyncThunk("auth/fetchMe", () => authApi.getMe());

/** Switches the active JWT org to `orgId`, then refetches /auth/me so `state.auth.user.orgId` reflects it. */
export const switchAccount = createAsyncThunk("auth/switchAccount", async (orgId: string, { dispatch }) => {
  await authApi.switchAccount({ org_id: orgId });
  return dispatch(fetchMe()).unwrap();
});

type AuthState = {
  user: AuthUser | null;
  status: "idle" | "sendingOtp" | "verifyingOtp" | "updatingRole" | "failed";
  error: string | null;
  selectedCategory: PortalCategory | null;
  initializing: boolean;
};

const initialState: AuthState = {
  user: null,
  status: "idle",
  error: null,
  selectedCategory: null,
  initializing: true,
};

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
    settleInitializing(state) {
      state.initializing = false;
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
      })
      .addCase(restoreSession.fulfilled, (state, action) => {
        state.user = action.payload;
        state.initializing = false;
      })
      .addCase(restoreSession.rejected, (state) => {
        clearTokens();
        state.user = null;
        state.initializing = false;
      })
      .addCase(fetchMe.fulfilled, (state, action) => {
        state.user = action.payload;
        state.initializing = false;
      });
  },
});

export const { resetSignInError, setSelectedCategory, logout, settleInitializing } = authSlice.actions;
export const authReducer = authSlice.reducer;
