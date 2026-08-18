"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import type { NotificationChannel } from "../apis";
import { CHANNEL_DEFAULTS, CHANNEL_LABELS } from "../const";
import { humanizeType } from "../utils";
import { fetchNotificationPreferences, saveNotificationPreference } from "../store/notifications-slice";

/**
 * Channel switches per notification type. Rows exist only for types this account
 * has actually seen or set — the backend has no fixed type list (every wave adds
 * its own), so inventing one here would go stale on the next wave.
 */
export function NotificationPreferences() {
  const dispatch = useAppDispatch();
  const { items, preferences, preferencesStatus } = useAppSelector((state) => state.notifications);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchNotificationPreferences());
  }, [dispatch]);

  if (preferencesStatus === "loading" || !preferences) {
    return (
      <div className="flex justify-center rounded-lg border border-border bg-card py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const types = [
    ...new Set([...preferences.preferences.map((p) => p.notification_type), ...items.map((n) => n.type)]),
  ].sort((a, b) => a.localeCompare(b));

  if (types.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card py-12 text-center text-sm text-muted-foreground">
        Settings appear once you have received your first notification.
      </div>
    );
  }

  const isEnabled = (type: string, channel: NotificationChannel) =>
    preferences.preferences.find((p) => p.notification_type === type && p.channel === channel)?.enabled ??
    CHANNEL_DEFAULTS[channel];

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[480px] text-sm">
        <thead className="border-b border-border bg-muted/40">
          <tr>
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Notification
            </th>
            {preferences.channels.map((c) => (
              <th
                key={c}
                className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                {CHANNEL_LABELS[c]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {types.map((type) => (
            <tr key={type} className="border-b border-border last:border-0">
              <td className="px-4 py-2.5 text-foreground">{humanizeType(type)}</td>
              {preferences.channels.map((channel) => (
                <td key={channel} className="px-4 py-2.5">
                  <input
                    type="checkbox"
                    aria-label={`${humanizeType(type)} via ${CHANNEL_LABELS[channel]}`}
                    checked={isEnabled(type, channel)}
                    onChange={(e) =>
                      dispatch(
                        saveNotificationPreference({
                          notification_type: type,
                          channel,
                          enabled: e.target.checked,
                        }),
                      )
                    }
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
