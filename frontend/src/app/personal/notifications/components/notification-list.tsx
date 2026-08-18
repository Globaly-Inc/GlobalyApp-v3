"use client";

import { Bell, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { deleteNotification, markNotificationRead } from "../store/notifications-slice";
import { timeAgo } from "../utils";

export function NotificationList() {
  const dispatch = useAppDispatch();
  const { items, unreadOnly, listStatus } = useAppSelector((state) => state.notifications);

  if (listStatus === "loading") {
    return (
      <div className="flex justify-center rounded-lg border border-border bg-card py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (listStatus === "failed") {
    return (
      <div className="rounded-lg border border-border bg-card py-12 text-center text-sm text-muted-foreground">
        Couldn&apos;t load your notifications.
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card py-16 text-center">
        <Bell className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">
          {unreadOnly ? "Nothing unread." : "No notifications yet."}
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {items.map((n) => (
        <li key={n.id} className={cn("flex gap-3 px-4 py-3", !n.is_read && "bg-primary/5")}>
          <span
            aria-hidden
            className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", n.is_read ? "bg-transparent" : "bg-primary")}
          />
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => !n.is_read && dispatch(markNotificationRead(n.id))}
          >
            <p className={cn("truncate text-sm text-foreground", !n.is_read && "font-medium")}>{n.title}</p>
            {n.body && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{n.body}</p>}
            <p className="mt-1 text-xs text-muted-foreground">{timeAgo(n.created_at)}</p>
          </button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete notification"
            onClick={() => dispatch(deleteNotification(n.id))}
          >
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
