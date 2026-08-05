import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { signupApi } from "../apis";
import type { AuthUser, RegisterParams, SendOtpParams, VerifyOtpParams } from "../apis/types";

export const registerAndSendOtp = createAsyncThunk("signup/registerAndSendOtp", async (params: RegisterParams) => {
  await signupApi.register(params);
  await signupApi.sendOtp({ email: params.email });
  return params.email;
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
  status: "idle" | "registering" | "sendingOtp" | "verifyingOtp" | "failed";
  error: string | null;
};

const initialState: SignupState = { user: null, status: "idle", error: null };

const signupSlice = createSlice({
  name: "signup",
  initialState,
  reducers: {
    resetSignupError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(registerAndSendOtp.pending, (state) => {
        state.status = "registering";
        state.error = null;
      })
      .addCase(registerAndSendOtp.fulfilled, (state) => {
        state.status = "idle";
      })
      .addCase(registerAndSendOtp.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to create account.";
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

export const { resetSignupError } = signupSlice.actions;
export const signupReducer = signupSlice.reducer;
