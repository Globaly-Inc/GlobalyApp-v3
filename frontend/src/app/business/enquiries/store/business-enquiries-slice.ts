import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { businessEnquiriesApi } from "../apis";
import type { DistributionListItem, EnquiryMessage } from "../apis/types";

export const fetchDistributions = createAsyncThunk("businessEnquiries/fetchAll", async () => {
  const result = await businessEnquiriesApi.listDistributions();
  return result.data;
});

export const fetchCredits = createAsyncThunk("businessEnquiries/fetchCredits", () =>
  businessEnquiriesApi.getCredits(),
);

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

/** Chat, keyed by distribution — each card in the inbox is its own thread. */
export const fetchDistributionMessages = createAsyncThunk(
  "businessEnquiries/fetchMessages",
  async (distributionId: string) => ({
    distributionId,
    messages: (await businessEnquiriesApi.getMessages(distributionId)).messages,
  }),
);

export const sendDistributionMessage = createAsyncThunk(
  "businessEnquiries/sendMessage",
  async ({ distributionId, body }: { distributionId: string; body: string }, { rejectWithValue }) => {
    try {
      return { distributionId, message: await businessEnquiriesApi.sendMessage(distributionId, body) };
    } catch (err) {
      return rejectWithValue(err instanceof Error ? err.message : "Failed to send message");
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
  messagesByDistribution: Record<string, EnquiryMessage[]>;
  messagesStatus: Record<string, "idle" | "loading" | "failed">;
};

const initialState: BusinessEnquiriesState = {
  items: [],
  status: "idle",
  error: null,
  credits: null,
  unlockCost: 0,
  actingId: null,
  actionError: null,
  messagesByDistribution: {},
  messagesStatus: {},
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

      .addCase(fetchDistributionMessages.pending, (state, action) => {
        // Only on the FIRST load — the poll refetches every few seconds and flipping to
        // a spinner each time would make the thread flicker.
        const id = action.meta.arg;
        if (!state.messagesByDistribution[id]) state.messagesStatus[id] = "loading";
      })
      .addCase(fetchDistributionMessages.fulfilled, (state, action) => {
        state.messagesStatus[action.payload.distributionId] = "idle";
        state.messagesByDistribution[action.payload.distributionId] = action.payload.messages;
      })
      .addCase(fetchDistributionMessages.rejected, (state, action) => {
        state.messagesStatus[action.meta.arg] = "failed";
      })

      .addCase(sendDistributionMessage.fulfilled, (state, action) => {
        // Append rather than refetch so the sender sees it immediately; the poll
        // reconciles anything that arrived meanwhile.
        const { distributionId, message } = action.payload;
        state.messagesByDistribution[distributionId] = [
          ...(state.messagesByDistribution[distributionId] ?? []),
          message,
        ];
      });
  },
});

export const { clearActionError } = businessEnquiriesSlice.actions;
export const businessEnquiriesReducer = businessEnquiriesSlice.reducer;
