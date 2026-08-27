"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { PlatformUserRow } from "./platform-user-row";
import { SuspendPlatformUserDialog } from "./suspend-platform-user-dialog";
import type { PlatformUser } from "../apis/types";

type PaginatedList<T> = { data: T[]; page: number; limit: number; total: number; totalPages: number };

export function PlatformUsersTab({
  platformUsers, search, onSearchChange, loading, onPageChange,
}: Readonly<{
  platformUsers: PaginatedList<PlatformUser>;
  search: string;
  onSearchChange: (value: string) => void;
  loading: boolean;
  onPageChange: (page: number) => void;
}>) {
  const [suspendingUser, setSuspendingUser] = useState<PlatformUser | null>(null);

  return (
    <div>
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search platform users..."
          className="h-10 pl-9"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {platformUsers.total} user{platformUsers.total === 1 ? "" : "s"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading && platformUsers.data.length === 0 && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!loading && platformUsers.data.length === 0 && <p className="text-sm text-muted-foreground">No users found.</p>}
          {platformUsers.data.map((user) => (
            <PlatformUserRow key={user.id} user={user} onSuspend={() => setSuspendingUser(user)} />
          ))}
        </CardContent>
      </Card>

      <Pagination page={platformUsers.page} limit={platformUsers.limit} total={platformUsers.total} onPageChange={onPageChange} />

      <SuspendPlatformUserDialog user={suspendingUser} onClose={() => setSuspendingUser(null)} />
    </div>
  );
}
