import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { notificationsApi } from "../apis";

/**
 * The bell badge belongs to the portal shell, not to Home: it has to work on every personal route, so it
 * must not depend on the Home view being mounted or on Home's state.
 */
export const fetchUnreadCount = createAsyncThunk("notifications/fetchUnreadCount", async () => {
  const { unread } = await notificationsApi.getUnreadCount();
  return unread;
});

type NotificationsState = { unreadCount: number; status: "idle" | "loading" | "failed" };

const initialState: NotificationsState = { unreadCount: 0, status: "idle" };

const notificationsSlice = createSlice({
  name: "notifications",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchUnreadCount.pending, (state) => {
        state.status = "loading";
      })
      .addCase(fetchUnreadCount.fulfilled, (state, action) => {
        state.status = "idle";
        state.unreadCount = action.payload;
      })
      // A failed count is silent: the badge simply doesn't render. It is not worth an error state in the
      // portal chrome on every page.
      .addCase(fetchUnreadCount.rejected, (state) => {
        state.status = "failed";
        state.unreadCount = 0;
      });
  },
});

export const notificationsReducer = notificationsSlice.reducer;
