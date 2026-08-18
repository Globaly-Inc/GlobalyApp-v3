import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import { notificationsApi } from "../apis";
import type { Notification, NotificationChannel, NotificationPreferences } from "../apis";

export const fetchNotifications = createAsyncThunk(
  "notifications/list",
  (params: { unread?: boolean } = {}) => notificationsApi.list(params),
);

export const fetchUnreadCount = createAsyncThunk("notifications/unreadCount", () =>
  notificationsApi.unreadCount(),
);

export const markNotificationRead = createAsyncThunk("notifications/markRead", async (id: number) => {
  await notificationsApi.markRead(id);
  return id;
});

export const markAllNotificationsRead = createAsyncThunk("notifications/markAllRead", () =>
  notificationsApi.markAllRead(),
);

export const deleteNotification = createAsyncThunk("notifications/remove", async (id: number) => {
  await notificationsApi.remove(id);
  return id;
});

export const fetchNotificationPreferences = createAsyncThunk("notifications/preferences", () =>
  notificationsApi.getPreferences(),
);

export const saveNotificationPreference = createAsyncThunk(
  "notifications/savePreference",
  (entry: { notification_type: string; channel: NotificationChannel; enabled: boolean }) =>
    notificationsApi.setPreferences([entry]),
);

type Status = "idle" | "loading" | "failed";

interface State {
  items: Notification[];
  total: number;
  unread: number;
  unreadOnly: boolean;
  preferences: NotificationPreferences | null;
  listStatus: Status;
  preferencesStatus: Status;
  error: string | null;
}

const initialState: State = {
  items: [],
  total: 0,
  unread: 0,
  unreadOnly: false,
  preferences: null,
  listStatus: "idle",
  preferencesStatus: "idle",
  error: null,
};

const slice = createSlice({
  name: "notifications",
  initialState,
  reducers: {
    setUnreadOnly(state, action: { payload: boolean }) {
      state.unreadOnly = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotifications.pending, (state) => {
        state.listStatus = "loading";
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.listStatus = "idle";
        state.items = action.payload.data;
        state.total = action.payload.meta.total;
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        state.listStatus = "failed";
        state.error = action.error.message ?? "Could not load notifications.";
      })

      .addCase(fetchUnreadCount.fulfilled, (state, action) => {
        state.unread = action.payload;
      })

      // Optimistic-free: the reducer applies what the server already accepted.
      .addCase(markNotificationRead.fulfilled, (state, action) => {
        const row = state.items.find((n) => n.id === action.payload);
        if (row && !row.is_read) {
          row.is_read = true;
          row.read_at = new Date().toISOString();
          state.unread = Math.max(state.unread - 1, 0);
        }
        if (state.unreadOnly) state.items = state.items.filter((n) => n.id !== action.payload);
      })

      .addCase(markAllNotificationsRead.fulfilled, (state) => {
        for (const row of state.items) {
          row.is_read = true;
          row.read_at ??= new Date().toISOString();
        }
        state.unread = 0;
        if (state.unreadOnly) state.items = [];
      })

      .addCase(deleteNotification.fulfilled, (state, action) => {
        const row = state.items.find((n) => n.id === action.payload);
        if (row && !row.is_read) state.unread = Math.max(state.unread - 1, 0);
        state.items = state.items.filter((n) => n.id !== action.payload);
        state.total = Math.max(state.total - 1, 0);
      })

      .addCase(fetchNotificationPreferences.pending, (state) => {
        state.preferencesStatus = "loading";
      })
      .addCase(fetchNotificationPreferences.fulfilled, (state, action) => {
        state.preferencesStatus = "idle";
        state.preferences = action.payload;
      })
      .addCase(fetchNotificationPreferences.rejected, (state, action) => {
        state.preferencesStatus = "failed";
        state.error = action.error.message ?? "Could not load notification settings.";
      })
      .addCase(saveNotificationPreference.fulfilled, (state, action) => {
        state.preferences = action.payload;
      });
  },
});

export const { setUnreadOnly } = slice.actions;
export const notificationsReducer = slice.reducer;
