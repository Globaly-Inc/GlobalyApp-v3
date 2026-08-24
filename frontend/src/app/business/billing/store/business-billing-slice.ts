import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { businessBillingApi } from "../apis";
import type { Plan, SubscriptionStatus } from "../apis/types";

export const fetchPlans = createAsyncThunk("businessBilling/fetchPlans", () => businessBillingApi.listPlans());

export const fetchSubscription = createAsyncThunk("businessBilling/fetchSubscription", () =>
  businessBillingApi.getSubscription(),
);

export const startCheckout = createAsyncThunk(
  "businessBilling/startCheckout",
  async (planCode: string, { rejectWithValue }) => {
    try {
      return await businessBillingApi.startCheckout(planCode);
    } catch (err) {
      return rejectWithValue(err instanceof Error ? err.message : "Failed to start checkout");
    }
  },
);

export const openBillingPortal = createAsyncThunk(
  "businessBilling/openPortal",
  async (_: void, { rejectWithValue }) => {
    try {
      return await businessBillingApi.openPortal();
    } catch (err) {
      return rejectWithValue(err instanceof Error ? err.message : "Failed to open billing portal");
    }
  },
);

type BusinessBillingState = {
  plans: Plan[];
  subscription: SubscriptionStatus | null;
  status: "idle" | "loading" | "failed";
  error: string | null;
  /** plan_code currently checking out, or null. */
  checkingOutPlan: string | null;
  checkoutError: string | null;
  openingPortal: boolean;
  portalError: string | null;
};

const initialState: BusinessBillingState = {
  plans: [],
  subscription: null,
  status: "idle",
  error: null,
  checkingOutPlan: null,
  checkoutError: null,
  openingPortal: false,
  portalError: null,
};

const businessBillingSlice = createSlice({
  name: "businessBilling",
  initialState,
  reducers: {
    clearCheckoutError: (state) => {
      state.checkoutError = null;
    },
    clearPortalError: (state) => {
      state.portalError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPlans.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchPlans.fulfilled, (state, action) => {
        state.status = "idle";
        state.plans = action.payload;
      })
      .addCase(fetchPlans.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load plans";
      })

      .addCase(fetchSubscription.fulfilled, (state, action) => {
        state.subscription = action.payload;
      })

      .addCase(startCheckout.pending, (state, action) => {
        state.checkingOutPlan = action.meta.arg;
        state.checkoutError = null;
      })
      .addCase(startCheckout.fulfilled, (state) => {
        state.checkingOutPlan = null;
        // Real API returns a Stripe URL the view redirects to; the mock activates
        // the plan immediately, so re-fetch subscription status either way.
      })
      .addCase(startCheckout.rejected, (state, action) => {
        state.checkingOutPlan = null;
        state.checkoutError = (action.payload as string) ?? "Failed to start checkout";
      })

      .addCase(openBillingPortal.pending, (state) => {
        state.openingPortal = true;
        state.portalError = null;
      })
      .addCase(openBillingPortal.fulfilled, (state) => {
        state.openingPortal = false;
      })
      .addCase(openBillingPortal.rejected, (state, action) => {
        state.openingPortal = false;
        state.portalError = (action.payload as string) ?? "Failed to open billing portal";
      });
  },
});

export const { clearCheckoutError, clearPortalError } = businessBillingSlice.actions;
export const businessBillingReducer = businessBillingSlice.reducer;
