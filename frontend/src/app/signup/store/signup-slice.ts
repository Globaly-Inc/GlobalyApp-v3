import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { signupApi } from "../apis";
import type { AuthUser, ClaimRequestParams, RegisterParams, SendOtpParams, VerifyOtpParams } from "../apis/types";

const BUSINESS_CLAIM_AVAILABLE = "BUSINESS_CLAIM_AVAILABLE";

export const registerAndSendOtp = createAsyncThunk("signup/registerAndSendOtp", async (params: RegisterParams) => {
  await signupApi.register(params);
  await signupApi.sendOtp({ email: params.email });
  return params.email;
});

export const requestBusinessClaim = createAsyncThunk("signup/requestBusinessClaim", async (params: ClaimRequestParams) => {
  await signupApi.requestBusinessClaim(params);
});

export const resendOtp = createAsyncThunk("signup/resendOtp", async (params: SendOtpParams) => {
  await signupApi.sendOtp(params);
  return params.email;
});

export const verifySignUpOtp = createAsyncThunk("signup/verifySignUpOtp", (params: VerifyOtpParams) =>
  signupApi.verifyOtp(params),
);

type SignupState = {
  user: AuthUser | null;
  status: "idle" | "registering" | "sendingOtp" | "verifyingOtp" | "requestingClaim" | "failed";
  error: string | null;
  claimOffer: { message: string } | null;
};

const initialState: SignupState = { user: null, status: "idle", error: null, claimOffer: null };

const signupSlice = createSlice({
  name: "signup",
  initialState,
  reducers: {
    resetSignupError(state) {
      state.error = null;
    },
    dismissClaimOffer(state) {
      state.claimOffer = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(registerAndSendOtp.pending, (state) => {
        state.status = "registering";
        state.error = null;
        state.claimOffer = null;
      })
      .addCase(registerAndSendOtp.fulfilled, (state) => {
        state.status = "idle";
      })
      .addCase(registerAndSendOtp.rejected, (state, action) => {
        state.status = "failed";
        if (action.error.code === BUSINESS_CLAIM_AVAILABLE) {
          state.claimOffer = { message: action.error.message ?? "A business profile already exists for this email." };
          return;
        }
        state.error = action.error.message ?? "Failed to create account.";
      })
      .addCase(requestBusinessClaim.pending, (state) => {
        state.status = "requestingClaim";
        state.error = null;
      })
      .addCase(requestBusinessClaim.fulfilled, (state) => {
        state.status = "idle";
        state.claimOffer = null;
      })
      .addCase(requestBusinessClaim.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to send claim link.";
      })
      .addCase(resendOtp.pending, (state) => {
        state.status = "sendingOtp";
        state.error = null;
      })
      .addCase(resendOtp.fulfilled, (state) => {
        state.status = "idle";
      })
      .addCase(resendOtp.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to send code.";
      })
      .addCase(verifySignUpOtp.pending, (state) => {
        state.status = "verifyingOtp";
        state.error = null;
      })
      .addCase(verifySignUpOtp.fulfilled, (state, action) => {
        state.status = "idle";
        state.user = action.payload;
      })
      .addCase(verifySignUpOtp.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Verification failed.";
      });
  },
});

export const { resetSignupError, dismissClaimOffer } = signupSlice.actions;
export const signupReducer = signupSlice.reducer;
