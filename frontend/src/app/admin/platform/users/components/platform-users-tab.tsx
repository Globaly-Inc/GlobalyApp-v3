"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchPlatformUsers } from "../../platform-users/store/platform-users-slice";
import { PlatformUserRow } from "../../platform-users/components/platform-user-row";
import { SuspendPlatformUserDialog } from "../../platform-users/components/suspend-platform-user-dialog";
import { ConfirmSuperAdminDialog } from "../../platform-users/components/confirm-super-admin-dialog";
import type { PlatformUser } from "../../platform-users/apis/types";

export function PlatformUsersTab() {
  const dispatch = useAppDispatch();
  const { platformUsers, platformUsersStatus } = useAppSelector((state) => state.platformUsers);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [suspendingUser, setSuspendingUser] = useState<PlatformUser | null>(null);
  const [superAdminAction, setSuperAdminAction] = useState<{ user: PlatformUser; grant: boolean } | null>(null);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(value), 300);
  };

  const fetchedRef = useRef(false);
  const lastFetchKey = useRef<string | null>(null);
  useEffect(() => {
    const key = JSON.stringify({ search: debouncedSearch });
    if (fetchedRef.current && lastFetchKey.current === key) return;
    fetchedRef.current = true;
    lastFetchKey.current = key;
    dispatch(fetchPlatformUsers({ search: debouncedSearch || undefined, limit: 10 }));
  }, [dispatch, debouncedSearch]);

  const refreshParams = { search: debouncedSearch || undefined, page: platformUsers.page, limit: platformUsers.limit };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            className="h-10 pl-9"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>
        <span className="shrink-0 text-sm text-muted-foreground">
          {platformUsers.total} user{platformUsers.total === 1 ? "" : "s"}
        </span>
      </div>

      <div className="space-y-2">
        {platformUsersStatus === "loading" && platformUsers.data.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        )}
        {platformUsersStatus !== "loading" && platformUsers.data.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <Users className="h-8 w-8 opacity-30" />
            <p className="text-sm">No users found.</p>
          </div>
        )}
        {platformUsers.data.map((user) => (
          <PlatformUserRow
            key={user.id}
            user={user}
            refreshParams={refreshParams}
            onSuspend={() => setSuspendingUser(user)}
            onSuperAdminAction={(grant) => setSuperAdminAction({ user, grant })}
          />
        ))}
      </div>

      <Pagination
        page={platformUsers.page}
        limit={platformUsers.limit}
        total={platformUsers.total}
        onPageChange={(page) => dispatch(fetchPlatformUsers({ search: debouncedSearch || undefined, page, limit: 10 }))}
      />

      <SuspendPlatformUserDialog
        user={suspendingUser}
        refreshParams={refreshParams}
        onClose={() => setSuspendingUser(null)}
      />
      <ConfirmSuperAdminDialog
        user={superAdminAction?.user ?? null}
        grant={superAdminAction?.grant ?? true}
        refreshParams={refreshParams}
        onClose={() => setSuperAdminAction(null)}
      />
    </div>
  );
}
