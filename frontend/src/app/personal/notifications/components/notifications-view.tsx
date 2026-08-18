"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import {
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  setUnreadOnly,
} from "../store/notifications-slice";
import { NotificationList } from "./notification-list";
import { NotificationPreferences } from "./notification-preferences";

export function NotificationsView() {
  const dispatch = useAppDispatch();
  const { unread, unreadOnly } = useAppSelector((state) => state.notifications);
  const [showSettings, setShowSettings] = useState(false);

  // Strict Mode double-invokes effects in dev; the ref stops the first mount
  // firing two identical requests. Filter changes still refetch, by design.
  const fetchedRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (fetchedRef.current === unreadOnly) return;
    fetchedRef.current = unreadOnly;
    dispatch(fetchNotifications({ unread: unreadOnly }));
    dispatch(fetchUnreadCount());
  }, [dispatch, unreadOnly]);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
          <p className="mt-1 text-muted-foreground">
            {unread > 0 ? `${unread} unread` : "You are all caught up."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowSettings((v) => !v)}>
            {showSettings ? "Back to inbox" : "Settings"}
          </Button>
          {!showSettings && unread > 0 && (
            <Button size="sm" onClick={() => dispatch(markAllNotificationsRead())}>
              <CheckCheck className="mr-1 h-4 w-4" /> Mark all read
            </Button>
          )}
        </div>
      </div>

      {showSettings ? (
        <NotificationPreferences />
      ) : (
        <>
          <div className="mb-3 flex gap-2">
            <FilterButton active={!unreadOnly} onClick={() => dispatch(setUnreadOnly(false))}>
              All
            </FilterButton>
            <FilterButton active={unreadOnly} onClick={() => dispatch(setUnreadOnly(true))}>
              Unread
            </FilterButton>
          </div>
          <NotificationList />
        </>
      )}
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: Readonly<{ active: boolean; onClick: () => void; children: React.ReactNode }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-sm",
        active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}
