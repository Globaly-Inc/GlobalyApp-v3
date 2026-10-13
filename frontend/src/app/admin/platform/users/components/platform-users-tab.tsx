"use client";

import { useEffect, useRef, useState } from "react";
import { Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar, SearchInput } from "@/components/ui/filter-bar";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { Pagination } from "@/components/ui/pagination";
import { Table, TableBody, TableCard, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchPlatformUsers } from "../../platform-users/store/platform-users-slice";
import { PLATFORM_USER_COLUMNS, PlatformUserRow } from "../../platform-users/components/platform-user-row";
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
  const loadingFirstPage = platformUsersStatus === "loading" && platformUsers.data.length === 0;

  return (
    <div className="space-y-4">
      <FilterBar>
        <SearchInput placeholder="Search by name or email" value={search} onChange={(e) => handleSearchChange(e.target.value)} />
        <span className="shrink-0 px-2 text-sm text-muted-foreground">
          {platformUsers.total} user{platformUsers.total === 1 ? "" : "s"}
        </span>
      </FilterBar>

      {loadingFirstPage && <ListSkeleton count={6} itemClassName="h-14" />}
      {!loadingFirstPage && platformUsers.data.length === 0 && (
        <EmptyState icon={Users} title="No users found" description={debouncedSearch ? "Try a different name or email." : undefined} />
      )}
      {platformUsers.data.length > 0 && (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                {PLATFORM_USER_COLUMNS.map((col) => (
                  <TableHead key={col.label} className={"className" in col ? col.className : undefined}>
                    {"srOnly" in col ? <span className="sr-only">{col.label}</span> : col.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {platformUsers.data.map((user) => (
                <PlatformUserRow
                  key={user.id}
                  user={user}
                  refreshParams={refreshParams}
                  onSuspend={() => setSuspendingUser(user)}
                  onSuperAdminAction={(grant) => setSuperAdminAction({ user, grant })}
                />
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}

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
