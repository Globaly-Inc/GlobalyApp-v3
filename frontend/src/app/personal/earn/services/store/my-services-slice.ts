import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { servicesApi } from "../apis";
import type {
  Listing,
  ListingInput,
  MyReviewState,
  Order,
  OrderMessage,
  ServicesMeta,
  Summary,
} from "../apis/types";

type Status = "idle" | "loading" | "failed";

// ── Thunks ─────────────────────────────────────────────────────────────────

export const fetchMeta = createAsyncThunk("myServices/fetchMeta", () => servicesApi.getMeta());
export const fetchSummary = createAsyncThunk("myServices/fetchSummary", () => servicesApi.getSummary());
export const fetchListings = createAsyncThunk("myServices/fetchListings", () => servicesApi.getListings());
export const fetchPurchases = createAsyncThunk("myServices/fetchPurchases", () => servicesApi.getPurchases());
export const fetchReceived = createAsyncThunk("myServices/fetchReceived", () => servicesApi.getReceivedOrders());

export const fetchListing = createAsyncThunk("myServices/fetchListing", (serviceId: number) =>
  servicesApi.getListing(serviceId),
);

export const createListing = createAsyncThunk("myServices/createListing", (input: ListingInput) =>
  servicesApi.createListing(input),
);

export const updateListing = createAsyncThunk(
  "myServices/updateListing",
  ({ serviceId, input }: { serviceId: number; input: Partial<ListingInput> }) =>
    servicesApi.updateListing(serviceId, input),
);

export const deleteListing = createAsyncThunk("myServices/deleteListing", async (serviceId: number) => {
  await servicesApi.deleteListing(serviceId);
  return serviceId;
});

export const uploadCover = createAsyncThunk("myServices/uploadCover", (file: File) => servicesApi.uploadCover(file));

export const fetchOrder = createAsyncThunk("myServices/fetchOrder", (orderId: number) =>
  servicesApi.getOrder(orderId),
);

export const disputeOrder = createAsyncThunk(
  "myServices/disputeOrder",
  ({ orderId, reason }: { orderId: number; reason: string }) => servicesApi.disputeOrder(orderId, reason),
);

export const cancelOrder = createAsyncThunk("myServices/cancelOrder", (orderId: number) =>
  servicesApi.cancelOrder(orderId),
);

export const refundOrder = createAsyncThunk("myServices/refundOrder", (orderId: number) =>
  servicesApi.refundOrder(orderId),
);

/** The order thread. Fetched when the order detail opens, appended to as messages are sent. */
export const fetchMessages = createAsyncThunk("myServices/fetchMessages", (orderId: number) =>
  servicesApi.getMessages(orderId),
);

export const sendMessage = createAsyncThunk(
  "myServices/sendMessage",
  ({ orderId, body }: { orderId: number; body: string }) => servicesApi.sendMessage(orderId, body),
);

/** Keyed on the listing: reviewing no longer requires having bought. */
export const fetchMyReview = createAsyncThunk("myServices/fetchMyReview", (serviceId: number) =>
  servicesApi.getMyReview(serviceId),
);

export const createReview = createAsyncThunk(
  "myServices/createReview",
  ({ serviceId, rating, comment }: { serviceId: number; rating: number; comment?: string | null }) =>
    servicesApi.createReview(serviceId, { rating, comment }),
);

/** Verification is fired once per mount by the view; this thunk carries no retry logic of its own. */
export const verifyPayment = createAsyncThunk("myServices/verifyPayment", (sessionId: string) =>
  servicesApi.verifyPayment(sessionId),
);

// ── State ──────────────────────────────────────────────────────────────────

interface MyServicesState {
  meta: ServicesMeta | null;
  summary: Summary | null;
  listings: Listing[];
  purchases: Order[];
  received: Order[];
  /** The listing being edited, and the order being viewed — each page's own subject. */
  listing: Listing | null;
  order: Order | null;
  messages: OrderMessage[];
  myReview: MyReviewState | null;

  /**
   * One status per region. The hub's three tabs and its earnings strip fetch independently, so a failure in
   * one must not blank the others — the same reason Home keeps summaryStatus and feedStatus apart.
   */
  summaryStatus: Status;
  listingsStatus: Status;
  purchasesStatus: Status;
  receivedStatus: Status;
  listingStatus: Status;
  orderStatus: Status;
  messagesStatus: Status;
  myReviewStatus: Status;

  /** Write-in-flight flags, so buttons disable without a spinner replacing the page. */
  saving: boolean;
  acting: boolean;
  uploading: boolean;

  summaryError: string | null;
  listingsError: string | null;
  purchasesError: string | null;
  receivedError: string | null;
  listingError: string | null;
  orderError: string | null;
}

const initialState: MyServicesState = {
  meta: null,
  summary: null,
  listings: [],
  purchases: [],
  received: [],
  listing: null,
  order: null,
  messages: [],
  myReview: null,
  summaryStatus: "idle",
  listingsStatus: "idle",
  purchasesStatus: "idle",
  receivedStatus: "idle",
  listingStatus: "idle",
  orderStatus: "idle",
  messagesStatus: "idle",
  myReviewStatus: "idle",
  saving: false,
  acting: false,
  uploading: false,
  summaryError: null,
  listingsError: null,
  purchasesError: null,
  receivedError: null,
  listingError: null,
  orderError: null,
};

/** Replace an order wherever it appears — a user can be buyer on one row and provider on another. */
function replaceOrder(state: MyServicesState, order: Order) {
  const swap = (list: Order[]) => list.map((o) => (o.id === order.id ? order : o));
  state.purchases = swap(state.purchases);
  state.received = swap(state.received);
  if (state.order?.id === order.id) state.order = order;
}

const slice = createSlice({
  name: "myServices",
  initialState,
  reducers: {
    /** Clear the per-page subject when leaving, so the next visit never flashes stale content. */
    clearListing(state) {
      state.listing = null;
      state.listingStatus = "idle";
      state.listingError = null;
    },
    /**
     * Swap in an order the caller already has.
     *
     * The booking transitions each return the updated order, so refetching would be a second round trip for
     * a row we are already holding. Reuses replaceOrder so the lists stay in step with the detail.
     */
    replaceOrderLocally(state, action: { payload: Order }) {
      replaceOrder(state, action.payload);
    },
    clearOrder(state) {
      state.order = null;
      state.messages = [];
      state.messagesStatus = "idle";
      state.orderStatus = "idle";
      state.orderError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Meta is best-effort: a failure leaves the defaults the API layer already substituted.
      .addCase(fetchMeta.fulfilled, (state, action) => {
        state.meta = action.payload;
      })

      .addCase(fetchSummary.pending, (state) => {
        state.summaryStatus = "loading";
        state.summaryError = null;
      })
      .addCase(fetchSummary.fulfilled, (state, action) => {
        state.summaryStatus = "idle";
        state.summary = action.payload;
      })
      .addCase(fetchSummary.rejected, (state, action) => {
        state.summaryStatus = "failed";
        state.summaryError = action.error.message ?? "Could not load your totals.";
      })

      .addCase(fetchListings.pending, (state) => {
        state.listingsStatus = "loading";
        state.listingsError = null;
      })
      .addCase(fetchListings.fulfilled, (state, action) => {
        state.listingsStatus = "idle";
        state.listings = action.payload;
      })
      .addCase(fetchListings.rejected, (state, action) => {
        state.listingsStatus = "failed";
        state.listingsError = action.error.message ?? "Could not load your listings.";
      })

      .addCase(fetchPurchases.pending, (state) => {
        state.purchasesStatus = "loading";
        state.purchasesError = null;
      })
      .addCase(fetchPurchases.fulfilled, (state, action) => {
        state.purchasesStatus = "idle";
        state.purchases = action.payload;
      })
      .addCase(fetchPurchases.rejected, (state, action) => {
        state.purchasesStatus = "failed";
        state.purchasesError = action.error.message ?? "Could not load your purchases.";
      })

      .addCase(fetchReceived.pending, (state) => {
        state.receivedStatus = "loading";
        state.receivedError = null;
      })
      .addCase(fetchReceived.fulfilled, (state, action) => {
        state.receivedStatus = "idle";
        state.received = action.payload;
      })
      .addCase(fetchReceived.rejected, (state, action) => {
        state.receivedStatus = "failed";
        state.receivedError = action.error.message ?? "Could not load your received orders.";
      })

      .addCase(fetchListing.pending, (state) => {
        state.listingStatus = "loading";
        state.listingError = null;
      })
      .addCase(fetchListing.fulfilled, (state, action) => {
        state.listingStatus = "idle";
        state.listing = action.payload;
      })
      .addCase(fetchListing.rejected, (state, action) => {
        state.listingStatus = "failed";
        state.listingError = action.error.message ?? "Could not load this listing.";
      })

      .addCase(fetchOrder.pending, (state) => {
        state.orderStatus = "loading";
        state.orderError = null;
      })
      .addCase(fetchOrder.fulfilled, (state, action) => {
        state.orderStatus = "idle";
        state.order = action.payload;
      })
      .addCase(fetchOrder.rejected, (state, action) => {
        state.orderStatus = "failed";
        state.orderError = action.error.message ?? "Order not found.";
      })

      // ── Writes ──
      .addCase(createListing.fulfilled, (state, action) => {
        // Newest first, matching the server's ordering, so the new listing is where the user expects it.
        state.listings = [action.payload, ...state.listings];
      })
      .addCase(updateListing.fulfilled, (state, action) => {
        state.listings = state.listings.map((l) => (l.id === action.payload.id ? action.payload : l));
        if (state.listing?.id === action.payload.id) state.listing = action.payload;
      })
      .addCase(deleteListing.fulfilled, (state, action) => {
        state.listings = state.listings.filter((l) => l.id !== action.payload);
      })

      .addCase(disputeOrder.fulfilled, (state, action) => replaceOrder(state, action.payload))
      .addCase(cancelOrder.fulfilled, (state, action) => replaceOrder(state, action.payload))
      .addCase(refundOrder.fulfilled, (state, action) => replaceOrder(state, action.payload))

      .addCase(fetchMessages.pending, (state) => {
        state.messagesStatus = "loading";
      })
      .addCase(fetchMessages.fulfilled, (state, action) => {
        state.messagesStatus = "idle";
        state.messages = action.payload;
      })
      .addCase(fetchMessages.rejected, (state) => {
        state.messagesStatus = "failed";
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        // Appended rather than refetched: the thread is already on screen and the server echoes the row.
        state.messages = [...state.messages, action.payload];
        if (state.order) state.order = { ...state.order, message_count: state.messages.length };
      })

      .addCase(fetchMyReview.pending, (state) => {
        state.myReviewStatus = "loading";
      })
      .addCase(fetchMyReview.fulfilled, (state, action) => {
        state.myReviewStatus = "idle";
        state.myReview = action.payload;
      })
      .addCase(fetchMyReview.rejected, (state) => {
        state.myReviewStatus = "failed";
      })
      .addCase(createReview.fulfilled, (state, action) => {
        // The form is replaced by the submitted review.
        state.myReview = { can_review: false, reason: "already_reviewed", review: action.payload };
      });

    // Write-in-flight flags, matched by action-type suffix rather than listed one by one.
    builder
      .addMatcher(
        (action) => /^myServices\/(createListing|updateListing|deleteListing|createReview)\/pending$/.test(action.type),
        (state) => {
          state.saving = true;
        },
      )
      .addMatcher(
        (action) =>
          /^myServices\/(createListing|updateListing|deleteListing|createReview)\/(fulfilled|rejected)$/.test(
            action.type,
          ),
        (state) => {
          state.saving = false;
        },
      )
      .addMatcher(
        (action) =>
          /^myServices\/(disputeOrder|cancelOrder|refundOrder)\/pending$/.test(action.type),
        (state) => {
          state.acting = true;
        },
      )
      .addMatcher(
        (action) =>
          /^myServices\/(disputeOrder|cancelOrder|refundOrder)\/(fulfilled|rejected)$/.test(action.type),
        (state) => {
          state.acting = false;
        },
      )
      .addMatcher(
        (action) => action.type === uploadCover.pending.type,
        (state) => {
          state.uploading = true;
        },
      )
      .addMatcher(
        (action) => action.type === uploadCover.fulfilled.type || action.type === uploadCover.rejected.type,
        (state) => {
          state.uploading = false;
        },
      );
  },
});

export const { clearListing, clearOrder, replaceOrderLocally } = slice.actions;
export const myServicesReducer = slice.reducer;
