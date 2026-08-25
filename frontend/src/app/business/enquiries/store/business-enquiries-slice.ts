import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { isInstitutionContext } from "@/lib/api/http";
import { businessEnquiriesApi } from "../apis";
import type { DistributionListItem } from "../apis/types";

// Institution tenants share the /business/* shell but have no business context, and every
// enquiry route sits behind requireBusinessContext — the whole substrate (representations,
// enquiry_match_directory, enquiry_distributions) keys on business_id, so there is nothing
// for an institution to read. Guarded in the thunks rather than at each call site: both the
// inbox and the portal's stats rail dispatch these, and both otherwise surface the plumbing's
// own "This endpoint requires a business context" as a load failure.
const INSTITUTION_UNSUPPORTED = "Enquiries are only available for business accounts.";

export const fetchDistributions = createAsyncThunk("businessEnquiries/fetchAll", async () => {
  if (isInstitutionContext()) throw new Error(INSTITUTION_UNSUPPORTED);
  const result = await businessEnquiriesApi.listDistributions();
  return result.data;
});

export const fetchCredits = createAsyncThunk("businessEnquiries/fetchCredits", () => {
  if (isInstitutionContext()) throw new Error(INSTITUTION_UNSUPPORTED);
  return businessEnquiriesApi.getCredits();
});

export const unlockDistribution = createAsyncThunk(
  "businessEnquiries/unlock",
  // rejectWithValue so the server's own message (402 "Insufficient credits…",
  // 409 "already been unlocked by 3 businesses") reaches the UI verbatim.
  async (id: string, { rejectWithValue }) => {
    try {
      return await businessEnquiriesApi.unlock(id);
    } catch (err) {
      return rejectWithValue(err instanceof Error ? err.message : "Failed to unlock enquiry");
    }
  },
);

export const closeDistribution = createAsyncThunk(
  "businessEnquiries/close",
  async ({ id, closeReason }: { id: string; closeReason: string }, { rejectWithValue }) => {
    try {
      return await businessEnquiriesApi.close(id, closeReason);
    } catch (err) {
      return rejectWithValue(err instanceof Error ? err.message : "Failed to close enquiry");
    }
  },
);



type BusinessEnquiriesState = {
  items: DistributionListItem[];
  status: "idle" | "loading" | "failed";
  error: string | null;
  credits: number | null;
  unlockCost: number;
  /** distribution_id currently being unlocked or closed — drives per-row spinners
   * so one pending action doesn't disable every button in the list. */
  actingId: string | null;
  actionError: string | null;
};

const initialState: BusinessEnquiriesState = {
  items: [],
  status: "idle",
  error: null,
  credits: null,
  unlockCost: 0,
  actingId: null,
  actionError: null,
};

const businessEnquiriesSlice = createSlice({
  name: "businessEnquiries",
  initialState,
  reducers: {
    clearActionError: (state) => {
      state.actionError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDistributions.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchDistributions.fulfilled, (state, action) => {
        state.status = "idle";
        state.items = action.payload;
      })
      .addCase(fetchDistributions.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load enquiries";
      })

      .addCase(fetchCredits.fulfilled, (state, action) => {
        state.credits = action.payload.balance;
        state.unlockCost = action.payload.unlock_cost;
      })

      .addCase(unlockDistribution.pending, (state, action) => {
        state.actingId = action.meta.arg;
        state.actionError = null;
      })
      .addCase(unlockDistribution.fulfilled, (state, action) => {
        state.actingId = null;
        state.credits = action.payload.credits_remaining;
        // Patch in place rather than refetching: the server already told us
        // everything that changed, and a refetch would reset scroll position.
        const name = [action.payload.student_first_name, action.payload.student_last_name]
          .filter(Boolean)
          .join(" ");
        state.items = state.items.map((item) =>
          item.distribution_id === action.payload.distribution_id
            ? {
                ...item,
                status: "unlocked",
                is_unlocked: true,
                // Our own unlock counts toward the cap the card displays; the
                // server already incremented it, so mirror that locally rather
                // than refetching just to move one number.
                accept_count: action.payload.already_unlocked ? item.accept_count : item.accept_count + 1,
                coin_cost: action.payload.coin_cost,
                unlocked_at: new Date().toISOString(),
                student_name: name || null,
                student_email: action.payload.student_email,
                student_phone: action.payload.student_phone,
              }
            : item,
        );
      })
      .addCase(unlockDistribution.rejected, (state, action) => {
        state.actingId = null;
        state.actionError = (action.payload as string) ?? "Failed to unlock enquiry";
      })

      .addCase(closeDistribution.pending, (state, action) => {
        state.actingId = action.meta.arg.id;
        state.actionError = null;
      })
      .addCase(closeDistribution.fulfilled, (state, action) => {
        state.actingId = null;
        state.items = state.items.map((item) =>
          item.distribution_id === action.payload.distribution_id
            ? {
                ...item,
                status: "closed",
                closed_at: action.payload.closed_at,
                close_reason: action.payload.close_reason,
              }
            : item,
        );
      })
      .addCase(closeDistribution.rejected, (state, action) => {
        state.actingId = null;
        state.actionError = (action.payload as string) ?? "Failed to close enquiry";
      })

;
  },
});

export const { clearActionError } = businessEnquiriesSlice.actions;
export const businessEnquiriesReducer = businessEnquiriesSlice.reducer;
